import { Link, createFileRoute } from "@tanstack/react-router";

import { CommandBlock, CopyButton } from "../components/Copy";
import { Page } from "../components/Layout";
import { SKILLS } from "../content/skills";
import { INSTALL_CMD, SKILL_GUIDE } from "../lib/site";

export const Route = createFileRoute("/")({
  component: Home,
});

const AGENT_PROMPT = `Run \`${INSTALL_CMD}\`, then build me a game with jgengine. Read jgengine-newgame for the plan and jgengine-api for the engine surface before you start.`;

function Home() {
  return (
    <Page>
      <section className="relative">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_0%,rgba(16,185,129,0.14),transparent)]" />
        <div className="relative mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
          <h1 className="text-balance text-2xl font-bold leading-tight tracking-tight text-slate-50 sm:text-[2rem]">
            A game engine your{" "}
            <span className="bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">
              AI agent
            </span>{" "}
            already knows how to use.
          </h1>

          <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-gradient-to-b from-emerald-400/[0.07] to-transparent p-5 sm:mt-8 sm:p-8">
            <h2 className="text-lg font-semibold text-slate-100">Point your agent here</h2>
            <p className="mt-2 text-sm text-slate-400">
              One command installs the skills into any coding agent — then it knows the engine. No docs to paste,
              no boilerplate to copy.
            </p>

            <div className="mt-4">
              <CommandBlock command={INSTALL_CMD} />
            </div>

            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-white/10 bg-slate-950/60 p-4 sm:flex-row sm:items-start sm:gap-3">
              <code className="flex-1 whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-slate-200 sm:text-sm">
                {AGENT_PROMPT}
              </code>
              <CopyButton value={AGENT_PROMPT} label="Copy" className="self-end sm:self-auto" />
            </div>

            <h3 className="mt-7 text-sm font-semibold text-slate-200">Which skill do I need?</h3>
            <ul className="mt-3 space-y-2.5">
              {SKILLS.map((s) => (
                <li key={s.slug}>
                  <Link
                    to="/skills/$name"
                    params={{ name: s.slug }}
                    className="group block rounded-lg border border-white/8 bg-white/[0.02] p-3 transition hover:border-emerald-400/30 hover:bg-white/[0.04] sm:p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold text-emerald-300">{s.name}</span>
                      <span className="text-slate-600 transition group-hover:text-emerald-300">→</span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">
                      {SKILL_GUIDE[s.slug] ?? s.description}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </Page>
  );
}
