import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { GAMES } from "../content/games";
import { REPO_URL } from "../lib/site";

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-[#05070d]/80 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold text-slate-100">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-emerald-400/15 font-mono text-emerald-300">
            jg
          </span>
          JGengine
        </Link>
        <nav className="flex items-center gap-5 text-sm text-slate-400">
          <Link to="/skills" className="transition hover:text-slate-100" activeProps={{ className: "text-emerald-300" }}>
            Skills
          </Link>
          <div className="group relative">
            <button className="flex items-center gap-1 transition hover:text-slate-100" type="button">
              Games
              <span className="text-[0.6rem] transition group-hover:text-emerald-300">▾</span>
            </button>
            <div className="absolute right-0 top-full hidden pt-2 group-hover:block group-focus-within:block">
              <div className="w-44 rounded-xl border border-white/8 bg-slate-950/95 p-1.5 shadow-lg backdrop-blur">
                {GAMES.map((game) => (
                  <a
                    key={game.id}
                    href={game.href}
                    className="block rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-100"
                  >
                    {game.title}
                  </a>
                ))}
              </div>
            </div>
          </div>
          <a href={REPO_URL} className="transition hover:text-slate-100">
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/5 py-10 text-center text-sm text-slate-500">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <p>
          JGengine — AGPL-3.0. Built for agents.{" "}
          <a href={REPO_URL} className="text-slate-400 underline hover:text-slate-200">
            Source on GitHub
          </a>
          .
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
