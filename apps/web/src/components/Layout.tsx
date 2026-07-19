import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { ENTRY_PROMPT, REPO_URL } from "../lib/site";

export function GitHubIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export function Backdrop({ variant = "page" }: { variant?: "hero" | "page" }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="bg-grid absolute inset-0" />
      <div className="orb orb-emerald -top-32 left-[8%] h-96 w-96" />
      <div className="orb orb-cyan -top-24 right-[10%] h-80 w-80" />
      {variant === "hero" && <div className="orb orb-violet top-40 left-[42%] h-[28rem] w-[28rem]" />}
      <div className="bg-noise absolute inset-0" />
    </div>
  );
}

export function SectionHeading({ eyebrow, title, blurb }: { eyebrow: string; title: string; blurb?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.22em] text-emerald-400/90">
        <span className="h-px w-6 bg-gradient-to-r from-emerald-400/70 to-transparent" />
        {eyebrow}
      </p>
      <h2 className="mt-3 text-balance text-2xl font-bold tracking-tight text-slate-50 sm:text-[2rem] sm:leading-tight">
        {title}
      </h2>
      {blurb && <p className="mt-3 text-pretty leading-relaxed text-slate-400">{blurb}</p>}
    </div>
  );
}

export function PageHero({
  eyebrow,
  title,
  blurb,
  children,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  children?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden">
      <Backdrop />
      <div className="relative mx-auto w-full max-w-6xl px-4 pb-4 pt-16 sm:px-6 sm:pt-24">
        <p className="animate-fade-up flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.22em] text-emerald-400/90">
          <span className="h-px w-6 bg-gradient-to-r from-emerald-400/70 to-transparent" />
          {eyebrow}
        </p>
        <h1
          className="animate-fade-up mt-3 text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl"
          style={{ animationDelay: "60ms" }}
        >
          {title}
        </h1>
        <p
          className="animate-fade-up mt-4 max-w-2xl text-pretty leading-relaxed text-slate-400 sm:text-lg"
          style={{ animationDelay: "120ms" }}
        >
          {blurb}
        </p>
        {children && (
          <div className="animate-fade-up mt-8" style={{ animationDelay: "180ms" }}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-20 px-3 pt-3 sm:px-4">
      <div className="mx-auto flex max-w-6xl items-center justify-between rounded-2xl border border-white/[0.08] bg-ink/75 py-2.5 pl-4 pr-3 shadow-[0_8px_32px_-12px_rgba(2,3,8,0.9)] backdrop-blur-xl sm:pl-5">
        <Link to="/" className="shrink-0 text-lg font-semibold tracking-tight text-white">
          JGengine
        </Link>
        <nav className="flex min-w-0 flex-wrap items-center justify-end gap-0.5 text-sm text-slate-400 sm:gap-1">
          <Link
            to="/why"
            className="rounded-full px-3 py-1.5 transition hover:bg-white/[0.04] hover:text-slate-100"
            activeProps={{ className: "rounded-full bg-emerald-400/10 px-3 py-1.5 text-emerald-300" }}
          >
            Why JGengine
          </Link>
          <Link
            to="/capabilities"
            className="rounded-full px-3 py-1.5 transition hover:bg-white/[0.04] hover:text-slate-100"
            activeProps={{ className: "rounded-full bg-emerald-400/10 px-3 py-1.5 text-emerald-300" }}
          >
            Capabilities
          </Link>
          <Link
            to="/adopt"
            className="rounded-full px-3 py-1.5 transition hover:bg-white/[0.04] hover:text-slate-100"
            activeProps={{ className: "rounded-full bg-emerald-400/10 px-3 py-1.5 text-emerald-300" }}
          >
            Adopt
          </Link>
          <Link
            to="/editor"
            className="rounded-full px-3 py-1.5 transition hover:bg-white/[0.04] hover:text-slate-100"
            activeProps={{ className: "rounded-full bg-emerald-400/10 px-3 py-1.5 text-emerald-300" }}
          >
            Editor
          </Link>
          <Link
            to="/games"
            className="rounded-full px-3 py-1.5 transition hover:bg-white/[0.04] hover:text-slate-100"
            activeProps={{ className: "rounded-full bg-emerald-400/10 px-3 py-1.5 text-emerald-300" }}
          >
            Games
          </Link>
          <Link
            to="/playground"
            className="rounded-full px-3 py-1.5 transition hover:bg-white/[0.04] hover:text-slate-100"
            activeProps={{ className: "rounded-full bg-emerald-400/10 px-3 py-1.5 text-emerald-300" }}
          >
            Playground
          </Link>
          <a
            href={REPO_URL}
            className="ml-1.5 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 transition hover:border-emerald-400/40 hover:bg-emerald-400/[0.08] hover:text-slate-100"
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
    <footer className="relative mt-4 overflow-hidden">
      <div className="hairline" />
      <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-14 sm:px-6">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <div className="text-lg font-semibold text-white">JGengine</div>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              A pure-TypeScript game engine SDK. AI coding agents build on it using focused JGengine Skills.
            </p>
            <code className="mt-4 block font-mono text-xs text-emerald-400/70">› {ENTRY_PROMPT}</code>
          </div>
          <div className="flex gap-16 text-sm">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-slate-600">Explore</p>
              <ul className="mt-3 space-y-2 text-slate-400">
                <li>
                  <Link to="/why" className="transition hover:text-emerald-300">
                    Why JGengine
                  </Link>
                </li>
                <li>
                  <Link to="/capabilities" className="transition hover:text-emerald-300">
                    Capabilities
                  </Link>
                </li>
                <li>
                  <Link to="/adopt" className="transition hover:text-emerald-300">
                    Drop-in adoption
                  </Link>
                </li>
                <li>
                  <Link to="/editor" className="transition hover:text-emerald-300">
                    Editor
                  </Link>
                </li>
                <li>
                  <Link to="/games" className="transition hover:text-emerald-300">
                    Games
                  </Link>
                </li>
                <li>
                  <Link to="/playground" className="transition hover:text-emerald-300">
                    Playground
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
              <p className="font-mono text-xs uppercase tracking-widest text-slate-600">Source</p>
              <ul className="mt-3 space-y-2 text-slate-400">
                <li>
                  <a href={`${REPO_URL}/tree/main/skills`} className="transition hover:text-emerald-300">
                    Skills source
                  </a>
                </li>
                <li>
                  <a href={`${REPO_URL}/tree/main/packages`} className="transition hover:text-emerald-300">
                    Packages
                  </a>
                </li>
                <li>
                  <a href={`${REPO_URL}/tree/main/Games`} className="transition hover:text-emerald-300">
                    Game sources
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <p className="mt-12 border-t border-white/[0.05] pt-6 text-xs text-slate-600">
          Apache-2.0 · Open source ·{" "}
          <a href={REPO_URL} className="text-slate-500 underline decoration-slate-700 underline-offset-2 transition hover:text-slate-300">
            Noisemaker111/jgengine
          </a>
        </p>
      </div>
      <p
        className="pointer-events-none absolute inset-x-0 -bottom-[0.22em] select-none whitespace-nowrap text-center font-mono text-[17vw] font-bold leading-none tracking-tighter text-white/[0.018] sm:text-[13vw]"
        aria-hidden
      >
        JGENGINE
      </p>
    </footer>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="-mt-16 flex-1 pt-16">{children}</main>
      <Footer />
    </div>
  );
}
