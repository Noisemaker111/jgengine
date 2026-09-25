import { createFileRoute } from "@tanstack/react-router";

import { GameCard } from "../components/GameCard";
import { Page, PageHero } from "../components/Layout";
import { GAME_IDS } from "../lib/games";
import { seo } from "../lib/seo";

export const Route = createFileRoute("/games/")({
  head: () =>
    seo({
      title: "Games — play what agents built with jgengine",
      description:
        "Probe games built by coding agents on the published jgengine packages, playable in your browser with no install.",
      path: "/games",
    }),
  component: Games,
});

function Games() {
  return (
    <Page>
      <PageHero
        eyebrow="Games · playable in your browser"
        title={
          <>
            Play what the <span className="text-accent">agents built.</span>
          </>
        }
        blurb="Every probe game runs right here with no install. Coding agents built them on the same npm packages you get, to find the engine's gaps. Some are homages to games you know."
      />

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        {GAME_IDS.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong p-8 text-center text-muted">
            No games in this build. Run <code className="font-mono text-fg">bun run games:clone</code> to fetch them.
          </p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {GAME_IDS.map((id, i) => (
              <li key={id}>
                <GameCard id={id} eager={i < 3} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-10 max-w-2xl text-sm leading-relaxed text-faint">
          These live in{" "}
          <a href="https://github.com/Noisemaker111/JGengine-games" className="link">
            Noisemaker111/JGengine-games
          </a>
          . They are probes, not templates: their content is not licensed for reuse. To start your own game, tell your
          agent the sentence; it runs <code className="font-mono text-muted">npx jgengine create</code>.
        </p>
      </section>
    </Page>
  );
}
