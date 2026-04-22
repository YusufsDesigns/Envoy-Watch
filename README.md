# Envoy Watch

> Automatic preview environments for every pull request — powered by [Locus BuildWithLocus](https://buildwithlocus.com).

Envoy Watch is a GitHub App that automatically spins up an isolated deployment when a pull request opens and tears it down when it closes. A bot comment appears on the PR with the live URL. No configuration, no cloud consoles, no DevOps.

Built for the [Locus Paygentic Hackathon #2](https://paywithlocus.com).

---

## How It Works

1. **Install** Envoy Watch on any GitHub repository
2. **Open a pull request** — Envoy Watch detects it instantly
3. **Get a live URL** — a bot comment appears on the PR with a fully deployed preview environment
4. **Merge or close** the PR — the environment is automatically destroyed

Every preview is fully isolated: its own container, its own URL, its own lifecycle.

---

## Features

- **Automatic deployments** — no commands, no configuration files, no manual steps
- **Bot comments** — PR comments update from "building" to "live" with the URL
- **Auto-teardown** — environments are destroyed the moment a PR closes or merges
- **Dashboard** — sign in with GitHub to see all your active preview environments and credit balance
- **Zero DevOps** — Locus handles builds, containers, routing, and SSL automatically

---

## Architecture

```
GitHub PR Event
      │
      ▼
Envoy Watch (Next.js on Vercel)
      │
      ├── Verifies webhook signature
      ├── Posts "building" comment to PR
      ├── Calls Locus API → deploys repo branch
      ├── Polls deployment status every 60s
      └── Updates PR comment with live URL
            │
            ▼
      Locus BuildWithLocus
            │
            ├── Clones repo at PR branch
            ├── Builds container (Nixpacks auto-detection)
            └── Serves at https://svc-{id}.buildwithlocus.com
```

```
PR Closed/Merged
      │
      ▼
Envoy Watch
      ├── Calls Locus DELETE /v1/projects/:id
      ├── Environment destroyed
      └── Posts "destroyed" comment to PR
```

**Stack:**
- [Next.js 15](https://nextjs.org) (App Router, TypeScript)
- [Auth.js v5](https://authjs.dev) — GitHub OAuth for dashboard login
- [Locus BuildWithLocus API](https://buildwithlocus.com) — infrastructure layer
- [Neon Postgres](https://neon.tech) — stores PR → environment mappings
- [@octokit/auth-app](https://github.com/octokit/auth-app.js) — GitHub App authentication
- Deployed on [Vercel](https://vercel.com)

---

## Prerequisites

- A GitHub account
- A [Locus](https://paywithlocus.com) account with a `claw_` API key
- A [Vercel](https://vercel.com) account (free tier works)
- A [Neon](https://neon.tech) Postgres database

> [!IMPORTANT]
> Repositories deployed via Envoy Watch must have an app that listens on **port 8080**. Locus injects `PORT=8080` automatically — most frameworks read `process.env.PORT` by default.

---

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/YusufsDesigns/Envoy-Watch.git
cd Envoy-Watch
npm install
```

### 2. Create a GitHub App

Go to **GitHub → Settings → Developer Settings → GitHub Apps → New GitHub App**.

| Field | Value |
|---|---|
| Webhook URL | `https://your-vercel-url/api/webhook` |
| Callback URL | `https://your-vercel-url/api/auth/callback/github` |
| Permissions | Pull requests (R/W), Contents (R), Metadata (R) |
| Events | Pull request |

Generate a private key and note your App ID.

### 3. Create a GitHub OAuth App

Go to **GitHub → Settings → Developer Settings → OAuth Apps → New OAuth App**.

| Field | Value |
|---|---|
| Authorization callback URL | `https://your-vercel-url/api/auth/callback/github` |

Note the Client ID and generate a Client Secret.

### 4. Set environment variables

```bash
# GitHub App
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=          # base64-encoded PEM
GITHUB_WEBHOOK_SECRET=           # random string
NEXT_PUBLIC_GITHUB_APP_INSTALL_URL=https://github.com/apps/your-app-name/installations/new

# GitHub OAuth (Auth.js)
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
AUTH_SECRET=                     # openssl rand -base64 32
AUTH_URL=https://your-vercel-url

# Locus
LOCUS_API_KEY=                   # claw_... from paywithlocus.com
LOCUS_JWT=                       # from POST /v1/auth/exchange

# Database
POSTGRES_URL=                    # Neon connection string
```

To get your `LOCUS_JWT`:

```bash
curl -X POST https://beta-api.buildwithlocus.com/v1/auth/exchange \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"your_claw_key"}'
```

### 5. Deploy to Vercel

```bash
npm install -g vercel
vercel deploy --prod
```

Add all environment variables to your Vercel project settings, then redeploy.

### 6. Install the GitHub App

Visit your app's install URL and install it on any repository you want preview environments for.

---

## Usage

Once installed, the workflow is fully automatic:

```bash
# On any repo with Envoy Watch installed:
git checkout -b feature/my-feature
git push origin feature/my-feature
# Open a pull request on GitHub
# → Envoy Watch bot posts a comment immediately
# → Preview environment is live in 3-7 minutes
# Merge the PR → environment destroyed automatically
```

---

## Dashboard

Sign in at `your-vercel-url/dashboard` with GitHub to see all active preview environments for your repos, build times, live URLs, and your Locus credit balance.

---

## Requirements for Deployed Repositories

For a repo to deploy successfully on Locus:

| Requirement | Details |
|---|---|
| Port | App must listen on port 8080 (`process.env.PORT`) |
| Build | Nixpacks auto-detects Node.js, Python, Go, and more |
| Public repo | Private repos require GitHub integration setup at [buildwithlocus.com/integrations](https://buildwithlocus.com/integrations) |
| Node.js | Version 20+ required if using Next.js 15 |

---

## Production Considerations

In the current implementation, all deployments bill against the configured Locus wallet. For a multi-tenant production deployment:

- Each user would connect their own Locus API key during onboarding
- Deployments run against their wallet, not the platform's
- A platform fee can be charged per environment on top of Locus costs

GitHub OAuth is implemented for the dashboard — each user only sees environments belonging to their own repositories.

---

## Project Structure

```
/app
  /api
    /webhook/route.ts        — receives GitHub PR events
    /status/route.ts         — returns environments for dashboard
    /locus/refresh/route.ts  — refreshes Locus JWT
    /auth/[...nextauth]/     — Auth.js handler
  /dashboard/page.tsx        — authenticated environment dashboard
  /login/page.tsx            — GitHub sign-in page
  page.tsx                   — public landing page
/lib
  github.ts                  — GitHub App auth, bot comments, repo listing
  locus.ts                   — Locus API (deploy, poll, destroy, balance)
  db.ts                      — Neon Postgres queries
auth.ts                      — Auth.js config
middleware.ts                — dashboard route protection
```

---

## Built With

| Tool | Purpose |
|---|---|
| [Locus BuildWithLocus](https://buildwithlocus.com) | Container deployments and infrastructure |
| [Next.js 15](https://nextjs.org) | App framework |
| [Auth.js v5](https://authjs.dev) | GitHub OAuth |
| [Octokit](https://github.com/octokit) | GitHub API and App authentication |
| [Neon](https://neon.tech) | Serverless Postgres |
| [Vercel](https://vercel.com) | Hosting |
| [Geist](https://vercel.com/font) | Typography |

## Production Considerations

### Billing & API Keys

In the current implementation, all preview environments deploy from the
platform owner's Locus wallet. Each environment costs $0.25 (service) —
charged from the configured `LOCUS_API_KEY` account.

This is intentional for the hackathon scope. For production use, the
architecture supports per-user billing:

- Each user provides their own Locus API key during GitHub App installation
- Deployments run against their wallet — not the platform owner's
- The platform can optionally charge a small fee per environment on top

**For self-hosters:** Set your own `LOCUS_API_KEY` in the environment
variables. All environments you trigger will bill to your Locus account.

**Roadmap for multi-tenant billing:**
- OAuth-style Locus key collection during GitHub App installation flow
- Per-user key storage (encrypted) in the database
- Deployment calls made with the installing user's key, not the platform key