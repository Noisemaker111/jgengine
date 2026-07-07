import { Link, createFileRoute } from "@tanstack/react-router";

import { CommandBlock } from "../components/Copy";
import { Page } from "../components/Layout";
import { SKILLS } from "../content/skills";
import { INSTALL_CMD, SKILL_GUIDE } from "../lib/site";

export const Route = createFileRoute("/skills/")({
  component: SkillsIndex,
});

function SkillsIndex() {
  return (
    <Page>
      <div className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-3xl font-bold text-slate-50">Skills</h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Each skill is the spec your agent reads before it builds. Install them all with one command — your
          agent picks the right one for the job.
        </p>
        <div className="mt-6 max-w-xl">
          <CommandBlock command={INSTALL_CMD} />
        </div>

        <div className="mt-10 space-y-4">
          {SKILLS.map((s) => (
            <Link
              key={s.slug}
              to="/skills/$name"
              params={{ name: s.slug }}
              className="block rounded-xl border border-white/8 bg-white/[0.02] p-5 transition hover:border-emerald-400/30 hover:bg-white/[0.04]"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-mono text-base font-semibold text-emerald-300">{s.name}</h2>
                <span className="text-slate-600">→</span>
              </div>
              <p className="mt-2 text-sm text-slate-300">{SKILL_GUIDE[s.slug] ?? s.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </Page>
  );
}
