import { createAppAuth } from "@octokit/auth-app"
import { Octokit } from "@octokit/rest"
import { createHmac, timingSafeEqual } from "crypto"

export function verifySignature(payload: string, sig: string): boolean {
  const expected = `sha256=${createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET!)
    .update(payload)
    .digest("hex")}`
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}

export async function getInstallationOctokit(installationId: number) {
  const auth = createAppAuth({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: Buffer.from(
      process.env.GITHUB_APP_PRIVATE_KEY!, 
      'base64'
    ).toString('utf-8'),
  })
  const { token } = await auth({ type: "installation", installationId })
  return new Octokit({ auth: token })
}

export async function postComment(
  installationId: number,
  repo: string,
  prNumber: number,
  body: string
): Promise<number> {
  const octokit = await getInstallationOctokit(installationId)
  const [owner, repoName] = repo.split("/")
  const { data } = await octokit.issues.createComment({
    owner,
    repo: repoName,
    issue_number: prNumber,
    body,
  })
  return data.id
}

export async function updateComment(
  installationId: number,
  repo: string,
  commentId: number,
  body: string
): Promise<void> {
  const octokit = await getInstallationOctokit(installationId)
  const [owner, repoName] = repo.split("/")
  await octokit.issues.updateComment({
    owner,
    repo: repoName,
    comment_id: commentId,
    body,
  })
}

export async function getUserRepos(accessToken: string) {
  const octokit = new Octokit({ auth: accessToken })
  const { data } = await octokit.repos.listForAuthenticatedUser({
    per_page: 100,
    sort: "updated",
    affiliation: "owner,collaborator",
  })
  return data
}
