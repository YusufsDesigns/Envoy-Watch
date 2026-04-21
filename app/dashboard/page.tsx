import { redirect } from "next/navigation"
import { auth, signOut } from "@/auth"
import { sql, createTable } from "@/lib/db"
import { getBalance } from "@/lib/locus"
import type { PreviewEnvironment } from "@/types"
import AutoRefresh from "./refresh"
import Image from "next/image"

export const metadata = { title: "Dashboard — Envoy Watch" }

const PILL: Record<string, { bg: string; color: string; dot: string; label: string }> = {
  building: {
    bg:    "oklch(0.96 0.05 90)",
    color: "oklch(0.48 0.16 90)",
    dot:   "oklch(0.6 0.18 90)",
    label: "Building",
  },
  deploying: {
    bg:    "oklch(0.96 0.04 240)",
    color: "oklch(0.45 0.14 240)",
    dot:   "oklch(0.6 0.18 240)",
    label: "Deploying",
  },
  healthy: {
    bg:    "oklch(0.96 0.05 145)",
    color: "oklch(0.42 0.15 145)",
    dot:   "oklch(0.65 0.2 145)",
    label: "Live",
  },
  failed: {
    bg:    "oklch(0.96 0.04 25)",
    color: "oklch(0.5 0.17 25)",
    dot:   "oklch(0.6 0.2 25)",
    label: "Failed",
  },
  destroyed: {
    bg:    "#f0f0ee",
    color: "#999",
    dot:   "#ccc",
    label: "Destroyed",
  },
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "—"
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const mins = Math.round(ms / 60000)
  return mins < 1 ? "<1 min" : `${mins} min`
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const username = session.githubUsername

  await createTable()

  const { rows: envs } = await sql<PreviewEnvironment>`
    SELECT * FROM preview_environments
    WHERE github_username = ${username}
    ORDER BY created_at DESC
  `

  let balance: { creditBalance: number } | null = null
  try {
    balance = await getBalance()
  } catch {}

  const liveCount = envs.filter(e => e.status === "healthy").length
  const buildingCount = envs.filter(e => e.status === "building" || e.status === "deploying").length

  const grouped = envs.reduce<Record<string, PreviewEnvironment[]>>((acc, env) => {
    if (!acc[env.repo]) acc[env.repo] = []
    acc[env.repo].push(env)
    return acc
  }, {})

  const installUrl = process.env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL

  return (
    <div style={{ minHeight: "100vh", background: "#f7f7f5", fontFamily: "var(--font-geist-sans)", color: "#111" }}>
      <AutoRefresh />

      {/* ── Header ──────────────────────────── */}
      <header
        style={{
          borderBottom: "1px solid #e8e8e8",
          padding: "0 28px",
          height: "54px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#fff",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Image src="/Logo.png" alt="Envoy Watch" width={28} height={28} style={{ borderRadius: "6px" }} />
          <span style={{ fontSize: "15px", fontWeight: "650", letterSpacing: "-0.03em", color: "#111" }}>
            Envoy Watch
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {balance !== null && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 10px",
                background: "oklch(0.96 0.05 145)",
                border: "1px solid oklch(0.88 0.07 145)",
                borderRadius: "100px",
              }}
            >
              <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "oklch(0.65 0.2 145)" }} />
              <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "11px", fontWeight: "500", color: "oklch(0.42 0.15 145)" }}>
                ${balance.creditBalance.toFixed(2)}
              </span>
            </div>
          )}

          {session.user?.image && (
            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={session.user.image}
                alt={username}
                width={26}
                height={26}
                style={{ borderRadius: "50%", border: "1px solid #e8e8e8" }}
              />
              <span style={{ fontSize: "13px", color: "#555", fontWeight: "450" }}>{username}</span>
            </div>
          )}

          <form
            action={async () => {
              "use server"
              await signOut({ redirectTo: "/" })
            }}
          >
            <button
              type="submit"
              style={{
                fontSize: "12px",
                padding: "5px 10px",
                border: "none",
                borderRadius: "6px",
                color: "#999",
                background: "transparent",
                cursor: "pointer",
                fontFamily: "var(--font-geist-sans)",
              }}
            >
              Sign out
            </button>
          </form>

          <a
            href={installUrl || "#"}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "12px",
              padding: "5px 12px",
              border: "1px solid #e0e0e0",
              borderRadius: "6px",
              color: "#555",
              textDecoration: "none",
              background: "#fff",
              fontWeight: "450",
            }}
          >
            Install App
          </a>
        </div>
      </header>

      {/* ── Stats bar ───────────────────────── */}
      {envs.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "1px",
            background: "#e8e8e8",
            borderBottom: "1px solid #e8e8e8",
          }}
        >
          {[
            { label: "Environments", value: envs.length, accent: false },
            { label: "Live",         value: liveCount,   accent: true  },
            { label: "Building",     value: buildingCount, accent: false },
          ].map(({ label, value, accent }) => (
            <div key={label} style={{ flex: 1, background: "#fff", padding: "12px 24px" }}>
              <div
                style={{
                  fontSize: "22px",
                  fontWeight: "700",
                  letterSpacing: "-0.05em",
                  color: accent ? "oklch(0.52 0.18 145)" : "#111",
                  lineHeight: 1,
                }}
              >
                {value}
              </div>
              <div style={{ fontSize: "11px", color: "#aaa", marginTop: "3px", fontWeight: "450" }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Body ────────────────────────────── */}
      <main style={{ padding: "28px 28px 60px", maxWidth: "960px", margin: "0 auto" }}>
        {envs.length === 0 ? (
          <EmptyState installUrl={installUrl} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
            {Object.entries(grouped).map(([repo, repoEnvs]) => (
              <section key={repo}>
                <h2
                  style={{
                    fontFamily: "var(--font-geist-mono)",
                    fontSize: "11px",
                    fontWeight: "500",
                    color: "#999",
                    margin: "0 0 10px",
                    letterSpacing: "0.04em",
                  }}
                >
                  {repo}
                </h2>

                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #e8e8e8",
                    borderRadius: "8px",
                    overflow: "hidden",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                  }}
                >
                  {/* Table header */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "72px 1fr 108px 1fr 72px",
                      padding: "8px 16px",
                      borderBottom: "1px solid #f0f0ee",
                      background: "#fafafa",
                      gap: "12px",
                    }}
                  >
                    {[
                      { label: "PR",     align: "left"  },
                      { label: "Branch", align: "left"  },
                      { label: "Status", align: "left"  },
                      { label: "URL",    align: "left"  },
                      { label: "Built",  align: "right" },
                    ].map(({ label, align }) => (
                      <span
                        key={label}
                        style={{
                          fontSize: "10px",
                          fontWeight: "500",
                          color: "#bbb",
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                          textAlign: align as "left" | "right",
                        }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>

                  {repoEnvs.map((env, i) => {
                    const pill = PILL[env.status] ?? PILL.building
                    return (
                      <div
                        key={env.id}
                        className="row-hover"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "72px 1fr 108px 1fr 72px",
                          alignItems: "center",
                          padding: "12px 16px",
                          borderTop: i === 0 ? "none" : "1px solid #f5f5f3",
                          gap: "12px",
                          animation: `fadeIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) ${i * 50}ms both`,
                        }}
                      >
                        {/* PR */}
                        <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "12px", fontWeight: "500", color: "#888" }}>
                          #{env.pr_number}
                        </span>

                        {/* Branch + title */}
                        <div style={{ overflow: "hidden" }}>
                          <span
                            style={{
                              fontFamily: "var(--font-geist-mono)",
                              fontSize: "12px",
                              color: "#333",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              display: "block",
                            }}
                          >
                            {env.branch}
                          </span>
                          {env.pr_title && (
                            <span
                              style={{
                                fontSize: "11px",
                                color: "#aaa",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                display: "block",
                                marginTop: "1px",
                              }}
                            >
                              {env.pr_title}
                            </span>
                          )}
                        </div>

                        {/* Status pill */}
                        <div>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "5px",
                              padding: "3px 9px",
                              borderRadius: "100px",
                              background: pill.bg,
                              fontSize: "11px",
                              fontWeight: "500",
                              color: pill.color,
                            }}
                          >
                            <span
                              className={env.status === "building" || env.status === "deploying" ? "building-dot" : ""}
                              style={{ width: "5px", height: "5px", borderRadius: "50%", background: pill.dot, flexShrink: 0 }}
                            />
                            {pill.label}
                          </span>
                        </div>

                        {/* URL */}
                        <div style={{ overflow: "hidden" }}>
                          {env.preview_url && env.status === "healthy" ? (
                            <a
                              href={env.preview_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="link-green"
                              style={{
                                fontFamily: "var(--font-geist-mono)",
                                fontSize: "11px",
                                color: "oklch(0.52 0.15 145)",
                                textDecoration: "none",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                display: "block",
                              }}
                            >
                              {env.preview_url.replace("https://", "")}
                            </a>
                          ) : (
                            <span style={{ fontSize: "12px", color: "#ddd" }}>—</span>
                          )}
                        </div>

                        {/* Build time */}
                        <span
                          style={{
                            fontFamily: "var(--font-geist-mono)",
                            fontSize: "11px",
                            color: "#bbb",
                            textAlign: "right",
                          }}
                        >
                          {formatDuration(env.build_started_at, env.build_completed_at)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function EmptyState({ installUrl }: { installUrl?: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "96px 24px",
        gap: "14px",
        textAlign: "center",
        animation: "fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "12px",
          background: "#f0f0ee",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "6px",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
      <p style={{ fontSize: "15px", fontWeight: "550", color: "#555", margin: 0, letterSpacing: "-0.01em" }}>
        No preview environments yet
      </p>
      <p style={{ fontSize: "13px", color: "#aaa", margin: 0, maxWidth: "280px", lineHeight: "1.55" }}>
        Install Envoy Watch on a repository and open a pull request to get started.
      </p>
      <a
        href={installUrl || "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-scale"
        style={{
          marginTop: "10px",
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "10px 20px",
          background: "linear-gradient(135deg, oklch(0.72 0.19 145), oklch(0.56 0.18 145))",
          color: "#fff",
          borderRadius: "7px",
          fontSize: "13px",
          fontWeight: "500",
          fontFamily: "var(--font-geist-sans)",
          textDecoration: "none",
          boxShadow: "0 2px 8px oklch(0.56 0.18 145 / 0.28)",
        }}
      >
        Install on GitHub →
      </a>
    </div>
  )
}
