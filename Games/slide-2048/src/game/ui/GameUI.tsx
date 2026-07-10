import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { useDisplayProfile } from "@jgengine/react/display";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";

import type { Dir } from "../logic/board";
import { STORE_KEY, type GameState } from "../logic/game";
import { shareLinkFor } from "../share";
import { Board } from "./components/Board";

const SWIPE_THRESHOLD = 24;

const SLIDE_COMMAND: Record<Dir, string> = {
  up: "slideUp",
  down: "slideDown",
  left: "slideLeft",
  right: "slideRight",
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="s2048__stat">
      <div className="s2048__stat-label">{label}</div>
      <div className="s2048__stat-value">{value.toLocaleString()}</div>
    </div>
  );
}

export function GameUI() {
  const ctx = useGameContext();
  const state = useGameStore((c) => c.game.store.get(STORE_KEY) as GameState | undefined);
  const { coarsePointer } = useDisplayProfile();
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const run = useCallback(
    (name: string, input: Record<string, unknown> = {}) => {
      ctx.game.commands.run(name, input);
    },
    [ctx],
  );

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    dragStart.current = { x: event.clientX, y: event.clientY };
  }, []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = dragStart.current;
      dragStart.current = null;
      if (start === null) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (Math.max(ax, ay) < SWIPE_THRESHOLD) return;
      const dir: Dir = ax > ay ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      run(SLIDE_COMMAND[dir]);
    },
    [run],
  );

  const copyLink = useCallback(() => {
    if (state === undefined) return;
    const link = shareLinkFor(state.seed);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        void navigator.clipboard.writeText(link).catch(() => undefined);
      }
    } catch {
      /* clipboard unavailable — ignore */
    }
    setCopied(true);
    if (typeof window !== "undefined") window.setTimeout(() => setCopied(false), 1400);
  }, [state]);

  if (state === undefined) return <div className="s2048" />;

  const showWin = state.won && !state.keepGoing;

  return (
    <div className="s2048">
      <header className="s2048__header">
        <h1 className="s2048__title">2048</h1>
        <p className="s2048__subtitle">Stoke the embers — merge tiles to 2048.</p>
      </header>

      <div className="s2048__topbar">
        <div className="s2048__scores">
          <Stat label="Score" value={state.score} />
          <Stat label="Best" value={state.best} />
        </div>
        <div className="s2048__actions">
          <button type="button" className="s2048__btn" onClick={() => run("newGame")}>
            New Game
          </button>
          <button
            type="button"
            className="s2048__btn s2048__btn--ghost"
            onClick={() => run("undo")}
            disabled={state.history === null}
          >
            Undo
          </button>
        </div>
      </div>

      <div className="s2048__board-wrap" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <Board tiles={state.tiles} />

        {showWin && (
          <div className="s2048__overlay s2048__overlay--win">
            <div className="s2048__overlay-title">You win!</div>
            <div className="s2048__overlay-sub">You forged a 2048 tile.</div>
            <div className="s2048__overlay-actions">
              <button type="button" className="s2048__btn" onClick={() => run("keepGoing")}>
                Keep going
              </button>
              <button type="button" className="s2048__btn s2048__btn--ghost" onClick={() => run("newGame")}>
                New Game
              </button>
            </div>
          </div>
        )}

        {state.over && (
          <div className="s2048__overlay s2048__overlay--over">
            <div className="s2048__overlay-title">Game over</div>
            <div className="s2048__overlay-sub">No moves left — final score {state.score.toLocaleString()}.</div>
            <div className="s2048__overlay-actions">
              <button type="button" className="s2048__btn" onClick={() => run("newGame")}>
                Try again
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="s2048__underboard">
        <p className="s2048__hint">
          {coarsePointer ? "Swipe across the board to slide the tiles." : "Arrow keys / WASD to slide · U to undo · N for a new game."}
        </p>
        <div className="s2048__seed">
          <span>
            Seed <code className="s2048__seed-code">{state.seed}</code>
          </span>
          <button type="button" className="s2048__link" onClick={copyLink}>
            {copied ? "Link copied" : "Copy share link"}
          </button>
        </div>
      </div>

      <footer className="s2048__credit">
        Based on 2048 by Gabriele Cirulli — inspired by Threes! (Asher Vollmer) and 1024!
      </footer>
    </div>
  );
}
