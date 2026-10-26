import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { GameCard } from "../components/GameCard";
import { Page } from "../components/Layout";
import { GAME_IDS, SEEDED_GAME_COUNT, gameBlurb, gameSeed, gameTitle } from "../lib/games";
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

function Games() {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const games = GAME_IDS.filter((id) =>
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
