import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { GameCard } from "../components/GameCard";
import { Page } from "../components/Layout";
import { GAME_IDS, gameBlurb, gameTitle } from "../lib/games";
import { seo } from "../lib/seo";

export const Route = createFileRoute("/games/")({
  head: () =>
    seo({
      title: "Games — made with JGengine",
      description:
        "Explore playable reference games made with JGengine. Different worlds and rules, built on one open-source TypeScript framework.",
      path: "/games",
    }),
  component: Games,
});

function Games() {
  const [query, setQuery] = useState("");
  const games = GAME_IDS.filter((id) =>
    `${gameTitle(id)} ${gameBlurb(id) ?? ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <Page>
      <section
        className="home-section games-library"
        aria-labelledby="games-title"
      >
        <div className="section-index">
          <span>THE PLAYABLE COLLECTION</span>
          <span>{GAME_IDS.length} REFERENCE GAMES</span>
        </div>
        <div className="editorial-heading">
          <h1 id="games-title">
            Pick a world.
            <br />
            <span>Press play.</span>
          </h1>
          <p>
            These are the games we build to test the framework. Explore their
            worlds, try their systems, and see what the same engine can do in
            different hands.
          </p>
        </div>
        <div className="library-tools">
          <label htmlFor="game-search">Find your next world</label>
          <input
            id="game-search"
            type="search"
            placeholder="Search games…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span aria-live="polite">
            {games.length} {games.length === 1 ? "game" : "games"}
          </span>
        </div>
        {games.length > 0 ? (
          <ul className="showcase-grid">
            {games.map((id, index) => (
              <li key={id} className="showcase-item">
                <div className="showcase-label">
                  <span>0{index + 1} / BUILT WITH JGENGINE</span>
                  <span aria-hidden>↗</span>
                </div>
                <GameCard id={id} size="lg" eager={index < 2} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="library-empty">
            <h2>
              {GAME_IDS.length
                ? "No matching worlds."
                : "The game library is unavailable in this build."}
            </h2>
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="btn btn-secondary"
              >
                Clear search
              </button>
            )}
          </div>
        )}
        <p className="showcase-note">
          Reference projects, not templates. Game content has its own credits
          and is not licensed for reuse. Start your own project with JGengine’s
          CLI and published packages.
        </p>
      </section>
    </Page>
  );
}
