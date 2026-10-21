import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { GAME_IDS, gameCover, gameTitle } from "../lib/games";

const SHOWCASE = [
  {
    id: "harbor-heat",
    category: "OPEN-WORLD ADVENTURE",
    label: "Explore",
    systems: ["Character movement", "Vehicles", "Missions", "Minimap"],
    description:
      "A coastal city, a courier job, and a world you can walk into.",
  },
  {
    id: "drift-foundry",
    category: "VEHICLE ACTION",
    label: "Drive",
    systems: ["Vehicle controls", "Collisions", "Salvage", "Game HUD"],
    description:
      "Drive through an industrial city with a compactor on your tail.",
  },
  {
    id: "ember-command",
    category: "REAL-TIME STRATEGY",
    label: "Command",
    systems: ["Unit commands", "Resources", "Combat", "Selection UI"],
    description:
      "Gather resources, command your units, and defend your warcamp.",
  },
  {
    id: "scrap-signal",
    category: "FIRST-PERSON LOOTER",
    label: "Fight",
    systems: ["Weapons", "Loot", "Shields", "Objectives"],
    description:
      "Take a salvage contract into a desert full of weapons and trouble.",
  },
];

export function HeroShowcase() {
  const games = SHOWCASE.filter(
    (game) => GAME_IDS.includes(game.id) && gameCover(game.id),
  );
  const [active, setActive] = useState(0);
  const game = games[active];
  return (
    <section className="engine-hero" aria-labelledby="hero-heading">
      <div className="hero-topline">
        <span>Independent ideas. Shared foundations.</span>
        <span>TypeScript / Open source</span>
      </div>
      <div className="hero-composition">
        <div className="hero-copy">
          <p className="eyebrow">The game framework for coding agents</p>
          <h1 id="hero-heading">
            MAKE
            <br />
            YOUR
            <br />
            <span>WORLD.</span>
            <span className="hero-period" aria-hidden>
              ↗
            </span>
          </h1>
          <p className="hero-description">
            Your idea. Your rules. A whole game.
            <br />
            Give your coding agent the building blocks for worlds, combat,
            multiplayer, and everything in between.
          </p>
          <div className="hero-actions">
            <a href="#start-building" className="btn btn-primary">
              Start with an idea <span aria-hidden>↗</span>
            </a>
            <Link to="/games" className="hero-play">
              <span className="play-ring" aria-hidden>
                ▶
              </span>{" "}
              Play the games
            </Link>
          </div>
          <div className="hero-license">
            Free & open source <span aria-hidden>·</span> Apache-2.0{" "}
            <span aria-hidden>·</span> Yours to ship
          </div>
        </div>
        <div className="hero-showcase" data-theme="dark">
          <div className="showcase-backplate" aria-hidden>
            <span>JG / ENGINE IN ACTION</span>
            <span>↗</span>
          </div>
          {game ? (
            <div className="game-viewer">
              <div className="viewer-toolbar">
                <span>
                  <span className="status-dot" aria-hidden /> ACTUAL GAME
                  CAPTURE
                </span>
                <span>
                  0{active + 1} / 0{games.length}
                </span>
              </div>
              <Link
                to="/games/$id"
                params={{ id: game.id }}
                className="viewer-image"
                aria-label={`Play ${gameTitle(game.id)}`}
              >
                {games.map((item, index) => (
                  <img
                    key={item.id}
                    src={gameCover(item.id)!}
                    alt={`${gameTitle(item.id)} gameplay`}
                    width={800}
                    height={450}
                    hidden={index !== active}
                    fetchPriority={index === 0 ? "high" : "low"}
                  />
                ))}
                <span className="viewer-play" aria-hidden>
                  ▶
                </span>
              </Link>
              <div className="viewer-info">
                <div>
                  <p className="micro-label">{game.category}</p>
                  <h2>{gameTitle(game.id)}</h2>
                  <p className="viewer-description">{game.description}</p>
                </div>
                <Link
                  to="/games/$id"
                  params={{ id: game.id }}
                  className="viewer-open"
                  aria-label={`Open ${gameTitle(game.id)}`}
                >
                  <span aria-hidden>↗</span>
                </Link>
              </div>
              <div className="viewer-systems">
                <span>BUILT WITH</span>
                {game.systems.map((system) => (
                  <span key={system}>{system}</span>
                ))}
              </div>
              <div
                className="scene-switcher"
                role="group"
                aria-label="Featured games"
              >
                {games.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active === index}
                    onClick={() => setActive(index)}
                  >
                    <span className="scene-number">0{index + 1}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <Link to="/games" className="game-viewer empty-showcase">
              Explore the game library ↗
            </Link>
          )}
          <div className="showcase-footnote">
            <span aria-hidden>↳</span> Different games. One shared framework.
          </div>
        </div>
      </div>
      <div className="hero-bottomline">
        <span>Built for ideas that don’t fit a template.</span>
        <a href="#engine">
          Explore the engine <span aria-hidden>↓</span>
        </a>
      </div>
    </section>
  );
}
