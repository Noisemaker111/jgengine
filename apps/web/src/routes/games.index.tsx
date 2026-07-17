import { Link, createFileRoute } from "@tanstack/react-router";

import { Page, PageHero } from "../components/Layout";
import { GAME_IDS, gameTitle } from "../lib/games";
import { seo } from "../lib/seo";

export const Route = createFileRoute("/games/")({
  head: () =>
    seo({
      title: "Games — play what agents built with JGengine",
      description:
        "Every game in the JGengine repository, playable right here in your browser. Each one was built by a coding agent on the same engine primitives you get from npm.",
      path: "/games",
    }),
  component: Games,
});

function Games() {
  return (
    <Page>
      <PageHero
        eyebrow="Games · playable in your browser"
        title="Play what the agents built."
        blurb="Every game in the repository runs right here — no install, no download. Each one was built by a coding agent from a short prompt, on the same engine primitives you get from npm."
      />

      <section className="relative">
        <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {GAME_IDS.map((id) => (
              <Link
                key={id}
                to="/games/$id"
                params={{ id }}
                className="group flex flex-col justify-between gap-6 rounded-2xl border border-white/[0.08] bg-ink/60 p-5 transition hover:border-emerald-400/40 hover:bg-emerald-400/[0.04]"
              >
                <div>
                  <h2 className="text-lg font-semibold text-slate-100 transition group-hover:text-emerald-200">
                    {gameTitle(id)}
                  </h2>
                  <p className="mt-1 font-mono text-xs text-slate-500">Games/{id}</p>
                </div>
                <span className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-400/35 bg-emerald-400/10 px-3.5 py-1.5 text-sm font-medium text-emerald-300 transition group-hover:bg-emerald-400/20">
                  ▶ Play
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-8 text-sm text-slate-500">
            These are the in-repo test games the engine is developed against — sources under{" "}
            <code className="text-slate-400">Games/*</code>. They probe engine gaps; they are not templates.
          </p>
        </div>
      </section>
    </Page>
  );
}
