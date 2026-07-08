import { Link, createFileRoute } from "@tanstack/react-router";

import { CommandBlock } from "../components/Copy";
import { Page } from "../components/Layout";
import { SKILLS } from "../content/skills";
import { INSTALL_CMD, SKILL_GUIDE } from "../lib/site";

export const Route = createFileRoute("/skills/")({
  head: () => ({
    meta: [
      { title: "Skills — JGengine" },
      {
        name: "description",
        content: "The specs your AI agent reads before it builds a game on JGengine.",
      },
    ],
  }),
  component: SkillsIndex,
});

function SkillsIndex() {
  return (
    <Page>
      <section className="relative overflow-hidden">
        <div className="glow-emerald pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-400/80">The spec</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">Skills</h1>
          <p className="mt-4 max-w-2xl text-slate-400">
            Each skill is the spec your agent reads before it builds. Install them all with one command —
            your agent picks the right one for the job.
          </p>
          <div className="mt-8 max-w-xl">
            <CommandBlock command={INSTALL_CMD} />
          </div>

          <div className="mt-12 space-y-4">
            {SKILLS.map((s, i) => (
              <Link
                key={s.slug}
                to="/skills/$name"
                params={{ name: s.slug }}
                className="card-hover group flex items-start gap-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 hover:border-emerald-400/30 sm:p-6"
              >
                <span className="hidden pt-0.5 font-mono text-sm text-slate-600 sm:block">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-mono text-base font-semibold text-emerald-300">{s.name}</h2>
                    <span className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-emerald-300">
                      →
                    </span>
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
                    {SKILL_GUIDE[s.slug] ?? s.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </Page>
  );
}
