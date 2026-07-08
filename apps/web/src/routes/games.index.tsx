import { createFileRoute } from "@tanstack/react-router";

import { GameCard } from "../components/GameCard";
import { Page } from "../components/Layout";
import { GAMES } from "../content/games";
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
      <section className="relative overflow-hidden">
        <div className="glow-emerald pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-400/80">The arcade</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">Games</h1>
          <p className="mt-4 max-w-2xl text-slate-400">
            Every game here was built by an AI agent from the JGengine skills — a different genre each
            time, on the same SDK. Click one and it runs in your browser, no install.
          </p>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {GAMES.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>

          <div className="mt-14 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
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
        </div>
      </section>
    </Page>
  );
}
