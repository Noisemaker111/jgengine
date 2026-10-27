import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { GameCard } from "../components/GameCard";
import { Page } from "../components/Layout";
import { GAME_IDS, SEEDED_GAME_COUNT, gameBlurb, gameParts, gameSeed, gameTitle } from "../lib/games";
import { DEMO_PARTS, demoPart, type DemoKey } from "../live/demoParts";
import { TracedDemo } from "../live/TracedDemo";
import { seo } from "../lib/seo";
import { BASELINE_GPU, SCENE_READY_RANGE_MS, WORST_MENU_CLICK_MS, secondsCeil } from "../lib/siteFacts";

export const Route = createFileRoute("/games/")({
  head: () =>
    seo({
      title: "Games built with jgengine — play them in your browser",
      description: `${GAME_IDS.length} games built on jgengine, playable in your browser: racers, tower defense, survival, builders and shooters, each with its own art, rules and menus.`,
      path: "/games",
    }),
  component: Games,
});

const PART_COUNTS = DEMO_PARTS.map((part) => ({ part, count: GAME_IDS.filter((id) => gameParts(id).includes(part.key)).length })).filter(
  (row) => row.count > 0,
);

function Games() {
  const [query, setQuery] = useState("");
  const [uses, setUses] = useState<DemoKey | null>(null);
  const [showDemo, setShowDemo] = useState(false);
  const needle = query.trim().toLowerCase();
  const games = GAME_IDS.filter(
    (id) =>
      (uses === null || gameParts(id).includes(uses)) &&
      `${gameTitle(id)} ${gameBlurb(id) ?? ""} ${gameSeed(id) ?? ""}`.toLowerCase().includes(needle),
  );
  return (
    <Page>
      <section className="relative overflow-hidden" aria-labelledby="games-title">
        <div className="bg-grid bg-grid-fade pointer-events-none absolute inset-0" aria-hidden />
        <div className="band-inner relative">
          <header className="band-head">
            <div>
              <p className="eyebrow">Built with jgengine</p>
              <h1 id="games-title" className="band-title">
                {GAME_IDS.length} games on one engine. Play any of them.
              </h1>
            </div>
            <p className="band-lede">
              These games are how the engine gets tested: an engine change has to keep the games it reaches building and booting. Each has
              its own art and rules on the same systems you get. Menus
              answer in under {secondsCeil(WORST_MENU_CLICK_MS)} while a game loads, and scenes are ready in{" "}
              {Math.floor(SCENE_READY_RANGE_MS[0] / 1000)}–{Math.ceil(SCENE_READY_RANGE_MS[1] / 1000)} s on a cold load (
              {BASELINE_GPU}).
              {SEEDED_GAME_COUNT > 0 && <> {SEEDED_GAME_COUNT} of them started as a one-line idea, shown on the card.</>}
            </p>
          </header>
          <div className="library-tools">
            <label htmlFor="game-search" className="sr-only">
              Search games
            </label>
            <input
              id="game-search"
              type="search"
              placeholder="Search: racer, survival, tower defense…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <span aria-live="polite">
              {games.length} {games.length === 1 ? "game" : "games"}
            </span>
          </div>
          <div className="mb-6 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by engine part">
            <span className="mr-1 font-mono text-[11px] uppercase tracking-[0.12em] text-faint">Uses</span>
            {PART_COUNTS.map(({ part, count }) => (
              <button
                key={part.key}
                type="button"
                aria-pressed={uses === part.key}
                onClick={() => setUses(uses === part.key ? null : part.key)}
                className={`rounded-full border px-3 py-1 font-mono text-[12px] transition-colors ${
                  uses === part.key ? "border-accent bg-accent/10 text-accent-text" : "border-line text-muted hover:text-fg"
                }`}
              >
                {part.label} <span className="text-faint">{count}</span>
              </button>
            ))}
          </div>
          {uses !== null && (
            <div className="mb-8">
              <p className="text-sm text-muted">
                {demoPart(uses).does}{" "}
                <button type="button" className="link" aria-expanded={showDemo} onClick={() => setShowDemo(!showDemo)}>
                  {showDemo ? "Hide the demo" : "▶ Try it live"}
                </button>
              </p>
              {showDemo && (
                <div className="mt-4">
                  <TracedDemo key={uses} demo={uses} />
                </div>
              )}
            </div>
          )}
          {games.length > 0 ? (
            <ul className="games-wall">
              {games.map((id, index) => (
                <li key={id}>
                  <GameCard id={id} eager={index < 4} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="library-empty">
              <h2>{GAME_IDS.length ? "No game matches that." : "The game list is missing from this build."}</h2>
              {query && (
                <button type="button" onClick={() => setQuery("")} className="btn btn-secondary">
                  Clear search
                </button>
              )}
            </div>
          )}
          <p className="library-note">
            These games test the engine. They are not templates, and their art and content keep their own credits and
            licenses. To make your own, run <code className="inline-code">npx jgengine create</code>.
          </p>
        </div>
      </section>
    </Page>
  );
}
