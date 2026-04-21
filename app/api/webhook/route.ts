import { verifySignature, postComment, updateComment } from "@/lib/github"
import { deployProject, pollDeployment, destroyProject } from "@/lib/locus"
import { sql } from "@/lib/db"
import type { PRContext } from "@/types"

const BUILDING_COMMENT = (branch: string) =>
  `## 🚀 Envoy Watch Preview\n⏳ **Building...** — preparing your environment\n🌿 **Branch:** \`${branch}\`\n_This comment updates as your environment progresses._`

const DEPLOYING_COMMENT = (branch: string) =>
  `## 🚀 Envoy Watch Preview\n🔄 **Deploying...** — spinning up your app\n🌿 **Branch:** \`${branch}\`\n_Almost there. URL will appear when ready._`

const HEALTHY_COMMENT = (url: string, branch: string, minutes: number) =>
  `## 🚀 Envoy Watch Preview\n✅ **Live:** ${url}\n🌿 **Branch:** \`${branch}\`\n⏱️ **Built in:** ~${minutes} min\n> Destroys automatically when this PR closes.`

const FAILED_COMMENT = (branch: string) =>
  `## 🚀 Envoy Watch Preview\n❌ **Build failed** — \`${branch}\`\nApp must listen on port 8080. Locus injects \`PORT=8080\`.`

const DESTROYED_COMMENT = () =>
  `## 🗑️ Envoy Watch\nPreview environment destroyed.`

async function handlePROpened(ctx: PRContext) {
  const { repo, branch, prNumber, prTitle, installationId, githubUsername } = ctx

  // Upsert into DB
  await sql`
    INSERT INTO preview_environments
      (repo, pr_number, branch, pr_title, installation_id, github_username)
    VALUES
      (${repo}, ${prNumber}, ${branch}, ${prTitle}, ${installationId}, ${githubUsername})
    ON CONFLICT (repo, pr_number) DO UPDATE SET
      branch = ${branch},
      pr_title = ${prTitle},
      status = 'building',
      locus_project_id = NULL,
      locus_service_id = NULL,
      locus_deployment_id = NULL,
      comment_id = NULL,
      preview_url = NULL,
      build_started_at = NOW(),
      build_completed_at = NULL,
      updated_at = NOW()
  `

  // Post initial building comment
  let commentId: number
  try {
    commentId = await postComment(installationId, repo, prNumber, BUILDING_COMMENT(branch))
  } catch (err) {
    console.error("Failed to post building comment:", err)
    return
  }

  // Deploy to Locus
  let locusResult
  try {
    locusResult = await deployProject(prNumber, repo, branch)
  } catch (err) {
    console.error("Locus deploy error:", err)
    await sql`
      UPDATE preview_environments SET status = 'failed', updated_at = NOW()
      WHERE repo = ${repo} AND pr_number = ${prNumber}
    `
    try {
      await updateComment(installationId, repo, commentId, FAILED_COMMENT(branch))
    } catch {}
    return
  }

  const projectId = locusResult.project.id
  const serviceId = locusResult.services[0]?.id ?? null
  const serviceUrl = locusResult.services[0]?.url ?? null
  const deploymentId = locusResult.deployments[0]?.id ?? null

  if (!deploymentId) {
    await sql`
      UPDATE preview_environments SET
        locus_project_id = ${projectId},
        locus_service_id = ${serviceId},
        comment_id = ${commentId},
        status = 'failed',
        updated_at = NOW()
      WHERE repo = ${repo} AND pr_number = ${prNumber}
    `
    await updateComment(installationId, repo, commentId, FAILED_COMMENT(branch))
    return
  }

  // Locus accepted the deployment — transition to "deploying"
  await sql`
    UPDATE preview_environments SET
      locus_project_id = ${projectId},
      locus_service_id = ${serviceId},
      locus_deployment_id = ${deploymentId},
      comment_id = ${commentId},
      preview_url = ${serviceUrl},
      status = 'deploying',
      updated_at = NOW()
    WHERE repo = ${repo} AND pr_number = ${prNumber}
  `
  try {
    await updateComment(installationId, repo, commentId, DEPLOYING_COMMENT(branch))
  } catch {}

  // Poll deployment status (every 60s, max 10 min)
  const startedAt = Date.now()
  const maxMs = 10 * 60 * 1000
  const pollMs = 60 * 1000

  while (Date.now() - startedAt < maxMs) {
    await new Promise((r) => setTimeout(r, pollMs))

    let deployment: { status: string }
    try {
      deployment = await pollDeployment(deploymentId)
    } catch {
      continue
    }

    if (deployment.status === "healthy") {
      const minutes = Math.round((Date.now() - startedAt) / 60000)
      await sql`
        UPDATE preview_environments SET
          status = 'healthy',
          preview_url = ${serviceUrl},
          build_completed_at = NOW(),
          updated_at = NOW()
        WHERE repo = ${repo} AND pr_number = ${prNumber}
      `
      await updateComment(
        installationId,
        repo,
        commentId,
        HEALTHY_COMMENT(serviceUrl ?? "", branch, minutes)
      )
      return
    }

    if (deployment.status === "failed") {
      await sql`
        UPDATE preview_environments SET
          status = 'failed',
          build_completed_at = NOW(),
          updated_at = NOW()
        WHERE repo = ${repo} AND pr_number = ${prNumber}
      `
      await updateComment(installationId, repo, commentId, FAILED_COMMENT(branch))
      return
    }
  }

  // Timed out — mark failed
  await sql`
    UPDATE preview_environments SET
      status = 'failed',
      build_completed_at = NOW(),
      updated_at = NOW()
    WHERE repo = ${repo} AND pr_number = ${prNumber}
  `
  await updateComment(installationId, repo, commentId, FAILED_COMMENT(branch))
}

async function handlePRClosed(ctx: PRContext) {
  const { repo, prNumber, installationId } = ctx

  const { rows } = await sql<{
    locus_project_id: string | null
    comment_id: number | null
    branch: string
  }>`
    SELECT locus_project_id, comment_id, branch
    FROM preview_environments
    WHERE repo = ${repo} AND pr_number = ${prNumber}
  `

  if (!rows.length) return

  const env = rows[0]

  if (env.locus_project_id) {
    try {
      await destroyProject(env.locus_project_id)
    } catch (err) {
      console.error("Locus destroy error:", err)
    }
  }

  await sql`
    UPDATE preview_environments SET
      status = 'destroyed',
      updated_at = NOW()
    WHERE repo = ${repo} AND pr_number = ${prNumber}
  `

  if (env.comment_id) {
    try {
      await updateComment(installationId, repo, Number(env.comment_id), DESTROYED_COMMENT())
    } catch (err) {
      console.error("Comment update error:", err)
    }
  }
}

export async function POST(req: Request) {
  const body = await req.text()
  const sig = req.headers.get("x-hub-signature-256") ?? ""

  if (!verifySignature(body, sig)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const event = req.headers.get("x-github-event")
  const payload = JSON.parse(body)

  if (event === "pull_request") {
    const { action, pull_request, repository, installation } = payload
    const ctx: PRContext = {
      repo: repository.full_name,
      branch: pull_request.head.ref,
      prNumber: pull_request.number,
      prTitle: pull_request.title,
      installationId: installation.id,
      githubUsername: repository.owner.login,
    }
    if (action === "opened" || action === "reopened") {
      handlePROpened(ctx).catch(console.error)
    }
    if (action === "closed") {
      handlePRClosed(ctx).catch(console.error)
    }
  }

  return Response.json({ ok: true })
}
