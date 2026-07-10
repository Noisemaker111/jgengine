import { createFileRoute } from "@tanstack/react-router";

import { GameCard } from "../components/GameCard";
import { Page, PageHero } from "../components/Layout";
import { GAMES, GAMES_BY_CATEGORY } from "../content/games";
import { REPO_URL } from "../lib/site";

export const Route = createFileRoute("/games/")({
  head: () => ({
    meta: [
      { title: "Games — JGengine" },
      {
        name: "description",
        content: "Games built by AI agents on the JGengine SDK — playable in the browser.",
      },
    ],
  }),
  component: GamesPage,
});

function GamesPage() {
  return (
    <Page>
      <PageHero
        eyebrow="The arcade"
        title="Games"
        blurb={`Every game here was built by an AI agent from the JGengine skills — ${GAMES.length} games, a different genre each time, on the same SDK. Click one and it runs in your browser, no install.`}
      />
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        {GAMES_BY_CATEGORY.map(({ category, games }) => (
          <div key={category} className="mt-12 first:mt-10">
            <div className="flex items-baseline gap-3">
              <h2 className="text-xl font-semibold tracking-tight text-slate-100">{category}</h2>
              <span className="font-mono text-xs text-slate-600">
                {games.length} {games.length === 1 ? "game" : "games"}
              </span>
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {games.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          </div>
        ))}

        <div className="panel panel-top-glow mt-14 rounded-2xl p-6 sm:p-8">
          <h2 className="font-semibold tracking-tight text-slate-100">How a game gets on this page</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
            An agent with the skills installed builds it under{" "}
            <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-cyan-300">Games/</code>{" "}
            in{" "}
            <a href={REPO_URL} className="text-emerald-300 underline decoration-emerald-300/40 underline-offset-2 transition hover:decoration-emerald-300">
              the repo
            </a>
            . On the next deploy it appears here and becomes playable at{" "}
            <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-cyan-300">
              /games/&lt;id&gt;
            </code>{" "}
            — no registry, no wiring.
          </p>
        </div>
      </section>
    </Page>
  );
}
