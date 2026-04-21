export interface PreviewEnvironment {
  id: number
  repo: string
  pr_number: number
  branch: string
  pr_title: string | null
  installation_id: number
  github_username: string | null
  locus_project_id: string | null
  locus_service_id: string | null
  locus_deployment_id: string | null
  comment_id: number | null
  status: "building" | "deploying" | "healthy" | "failed" | "destroyed"
  preview_url: string | null
  build_started_at: string
  build_completed_at: string | null
  created_at: string
  updated_at: string
}

export interface PRContext {
  repo: string
  branch: string
  prNumber: number
  prTitle: string
  installationId: number
  githubUsername: string
}

declare module "next-auth" {
  interface Session {
    githubAccessToken: string
    githubUsername: string
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    githubAccessToken?: string
    githubUsername?: string
  }
}
