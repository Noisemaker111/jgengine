import { Link, createFileRoute } from "@tanstack/react-router";

import { CommandBlock } from "../components/Copy";
import { Page, PageHero } from "../components/Layout";
import { SKILL_SLUGS } from "../content/skills";
import { INSTALL_CMD, SKILL_GUIDE } from "../lib/site";

export const Route = createFileRoute("/skills/")({
  head: () => ({
    meta: [
      { title: "Skills — JGengine" },
      {
        name: "description",
        content: "One JGengine intake router plus focused API domains for AI coding agents building on the TypeScript SDK.",
      },
    ],
  }),
  component: SkillsIndex,
});

function SkillsIndex() {
  return (
    <Page>
      <PageHero
        eyebrow="The spec"
        title="Skills"
        blurb="The main skill captures a short numbered blueprint, then routes the agent to only the API domains the game needs."
      >
        <div className="max-w-xl">
          <CommandBlock command={INSTALL_CMD} />
        </div>
      </PageHero>
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="mt-10 space-y-4">
          {SKILL_SLUGS.map((slug, i) => (
            <Link
              key={slug}
              to="/skills/$name"
              params={{ name: slug }}
              className="card-hover panel shine group flex items-start gap-5 rounded-2xl p-5 hover:border-emerald-400/35 sm:p-6"
            >
              <span className="hidden h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-ink font-mono text-xs text-slate-500 transition group-hover:border-emerald-400/35 group-hover:text-emerald-300 sm:grid">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-mono text-base font-semibold text-emerald-300">{slug}</h2>
                  <span className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-emerald-300" aria-hidden>
                    →
                  </span>
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">{SKILL_GUIDE[slug]}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </Page>
  );
}
