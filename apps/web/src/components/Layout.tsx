import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { INSTALL_CMD, REPO_URL } from "../lib/site";

export function GitHubIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-slate-100">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-emerald-400/25 bg-emerald-400/10 font-mono text-sm text-emerald-300 shadow-[0_0_18px_-4px_rgba(52,211,153,0.5)]">
            jg
          </span>
          JGengine
        </Link>
        <nav className="flex items-center gap-1 text-sm text-slate-400 sm:gap-2">
          <Link
            to="/skills"
            className="rounded-md px-2 py-1.5 transition hover:text-slate-100"
            activeProps={{ className: "rounded-md px-2 py-1.5 text-emerald-300" }}
          >
            Skills
          </Link>
          <Link
            to="/api"
            className="rounded-md px-2 py-1.5 transition hover:text-slate-100"
            activeProps={{ className: "rounded-md px-2 py-1.5 text-emerald-300" }}
          >
            API
          </Link>
          <Link
            to="/games"
            className="rounded-md px-2 py-1.5 transition hover:text-slate-100"
            activeProps={{ className: "rounded-md px-2 py-1.5 text-emerald-300" }}
          >
            Games
          </Link>
          <a
            href={REPO_URL}
            className="ml-1 flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 transition hover:border-white/25 hover:text-slate-100"
          >
            <GitHubIcon />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5 font-semibold text-slate-100">
              <span className="grid h-7 w-7 place-items-center rounded-md border border-emerald-400/25 bg-emerald-400/10 font-mono text-xs text-emerald-300">
                jg
              </span>
              JGengine
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              A genre-agnostic, pure-TypeScript game engine SDK — built to be driven by AI agents.
            </p>
          </div>
          <div className="flex gap-16 text-sm">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-slate-600">Explore</p>
              <ul className="mt-3 space-y-2 text-slate-400">
                <li>
                  <Link to="/skills" className="transition hover:text-emerald-300">
                    Skills
                  </Link>
                </li>
                <li>
                  <Link to="/api" className="transition hover:text-emerald-300">
                    API
                  </Link>
                </li>
                <li>
                  <Link to="/games" className="transition hover:text-emerald-300">
                    Games
                  </Link>
                </li>
                <li>
                  <a href={REPO_URL} className="transition hover:text-emerald-300">
                    GitHub
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-slate-600">Get started</p>
              <ul className="mt-3 space-y-2 text-slate-400">
                <li>
                  <code className="font-mono text-xs text-slate-500">{INSTALL_CMD}</code>
                </li>
                <li>
                  <a href={`${REPO_URL}/tree/main/skills`} className="transition hover:text-emerald-300">
                    Skills source
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <p className="mt-10 border-t border-white/[0.05] pt-6 text-xs text-slate-600">
          AGPL-3.0 · Open source ·{" "}
          <a href={REPO_URL} className="text-slate-500 underline decoration-slate-700 underline-offset-2 transition hover:text-slate-300">
            Noisemaker111/jgengine
          </a>
        </p>
      </div>
    </footer>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
