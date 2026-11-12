/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useState } from "@jgengine/core/ui/jsx";

import { GAME_IDS, gameCover, gameTitle } from "../../lib/games";
import { CopyButton } from "../Copy";

export const CREATE_COMMAND = 'npx jgengine create "My Game"';

/** Each idea is the pitch of a real game in games/, so the hero never shows a game that doesn't exist. */
const IDEAS: readonly { idea: string; id: string }[] = [
  { idea: "defends a highland keep from raider waves", id: "beacon-bastion" },
  { idea: "races a welded buggy ahead of a compactor", id: "drift-foundry" },
  { idea: "tames dinosaurs and survives the wild", id: "fernwild" },
  { idea: "runs a theme park full of hungry guests", id: "brightway-park" },
  { idea: "loots guns across six wasteland zones", id: "scrap-signal" },
  { idea: "drives deliveries through a coastal city", id: "harbor-heat" },
  { idea: "salvages a ruin and gets the haul home", id: "deepward" },
  { idea: "keeps an alien household fed and out of debt", id: "odd-orbit" },
];

const TYPE_MS = 34;
const DELETE_MS = 16;
const HOLD_MS = 2600;

/** The idea being typed: the whole first idea on the server, then a typewriter loop in the browser. */
function useTypedIdea(): { idea: (typeof IDEAS)[number]; shown: string; typing: boolean } {
  const [state, setState] = useState({ index: 0, length: IDEAS[0]!.idea.length, deleting: false });
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const full = IDEAS[state.index]!.idea.length;
    let delay: number;
    let next: typeof state;
    if (reduced) {
      delay = HOLD_MS + 1200;
      const index = (state.index + 1) % IDEAS.length;
      next = { index, length: IDEAS[index]!.idea.length, deleting: false };
    } else if (!state.deleting && state.length < full) {
      delay = TYPE_MS;
      next = { ...state, length: state.length + 1 };
    } else if (!state.deleting) {
      delay = HOLD_MS;
      next = { ...state, deleting: true };
    } else if (state.length > 0) {
      delay = DELETE_MS;
      next = { ...state, length: state.length - 1 };
    } else {
      delay = 220;
      next = { index: (state.index + 1) % IDEAS.length, length: 0, deleting: false };
    }
    const timer = window.setTimeout(() => setState(next), delay);
    return () => window.clearTimeout(timer);
  }, [state]);
  const idea = IDEAS[state.index]!;
  return { idea, shown: idea.idea.slice(0, state.length), typing: state.deleting || state.length < idea.idea.length };
}

/** Three rows of real game covers drifting past at an angle, behind the headline. */
function GameWall() {
  const covers = GAME_IDS.filter((id) => gameCover(id) !== null);
  if (covers.length === 0) return null;
  const rows = [0, 1, 2].map((row) => covers.map((_, i) => covers[(i + row * 3) % covers.length]!));
  return (
    <div className="wall" aria-hidden>
      <div className="wall-plane">
        {rows.map((row, r) => (
          <div key={r} className={`wall-row ${r % 2 === 1 ? "wall-row-rev" : ""}`}>
            {[...row, ...row].map((id, i) => (
              <img key={`${id}-${i}`} src={gameCover(id)!} alt="" width={800} height={450} loading={r === 0 ? "eager" : "lazy"} decoding="async" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function HomeHero() {
  const { idea, shown, typing } = useTypedIdea();
  return (
    <section className="story-hero" data-theme="dark" aria-labelledby="hero-heading">
      <GameWall />
      <div className="story-hero-shade" aria-hidden />
      <div className="story-hero-inner">
        <p className="eyebrow animate-fade-up">Open-source TypeScript game engine · Apache-2.0</p>
        <h1 id="hero-heading" className="story-h1 animate-fade-up" style={{ animationDelay: "60ms" }}>
          <span className="story-h1-fixed">Make a game that</span>
          <span className="story-h1-idea">
            <span className="sr-only">{idea.idea}</span>
            <span aria-hidden>
              {shown}
              <span className={`caret ${typing ? "" : "caret-blink"}`} />
            </span>
          </span>
          <span className="story-h1-fixed">
            with <em>jgengine</em>.
          </span>
        </h1>
        <p className="story-real animate-fade-up" style={{ animationDelay: "120ms" }}>
          <span className="live-dot" aria-hidden /> That one is real: <a href={`/games/${idea.id}`}>{gameTitle(idea.id)}</a>, one of{" "}
          {GAME_IDS.length} games built on the engine. You can play it below.
        </p>
        <p className="story-lede animate-fade-up" style={{ animationDelay: "160ms" }}>
          jgengine is a TypeScript game engine made to be built on by coding agents. Say that sentence to Claude Code, Codex
          or Cursor. The engine hands the agent the parts, a map of where they live and a way to check what it built.
        </p>
        <div className="story-actions animate-fade-up" style={{ animationDelay: "200ms" }}>
          <div className="command-chip">
            <span aria-hidden>$</span>
            <code>{CREATE_COMMAND}</code>
            <CopyButton value={CREATE_COMMAND} label="" ariaLabel="Copy the create command" variant="ghost" />
          </div>
          <a href="#play" className="btn btn-primary">
            Play a game <span className="arrow" aria-hidden>↓</span>
          </a>
          <a href="#decisions" className="btn btn-secondary">
            Read the decisions
          </a>
        </div>
      </div>
    </section>
  );
}
