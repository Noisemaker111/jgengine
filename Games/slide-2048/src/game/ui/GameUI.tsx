import { useCallback, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import { SettingsTrigger } from "@jgengine/react";
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

const CSS = `
@keyframes s2048-pop-in{0%{transform:scale(0);opacity:0}70%{opacity:1}100%{transform:scale(1);opacity:1}}
@keyframes s2048-pop-merge{0%{transform:scale(1)}45%{transform:scale(1.24)}100%{transform:scale(1)}}
@keyframes s2048-fade{from{opacity:0}to{opacity:1}}
.s2048-btn:hover:not(:disabled){filter:brightness(1.07)}
.s2048-btn:active:not(:disabled){transform:translateY(1px)}
.s2048-link:hover{color:#a94c12}
`;

const ROOT: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: "clamp(10px, 2.4vh, 18px)",
  padding: "clamp(14px, 3.5vh, 36px) 16px clamp(16px, 3vh, 28px)",
  boxSizing: "border-box",
  overflowY: "auto",
  overflowX: "hidden",
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  color: "#5b4128",
  background: "radial-gradient(130% 90% at 50% -12%, #fdf6e6 0%, #f4e7cd 52%, #ead9b8 100%)",
  userSelect: "none",
  WebkitUserSelect: "none",
};

const TITLE: CSSProperties = {
  margin: 0,
  fontSize: "clamp(2.5rem, 10vw, 3.75rem)",
  fontWeight: 900,
  letterSpacing: "-0.02em",
  lineHeight: 1,
  background: "linear-gradient(160deg, #e79c2a 0%, #d8552a 48%, #b31d47 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
  color: "transparent",
  textShadow: "0 2px 10px rgba(179,60,30,0.14)",
};

const SUBTITLE: CSSProperties = {
  margin: "6px 0 0",
  fontSize: "clamp(0.74rem, 2.6vw, 0.95rem)",
  fontWeight: 600,
  color: "#a06d3d",
};

const TOPBAR: CSSProperties = {
  width: "min(92vw, 460px)",
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "10px",
};

const STAT: CSSProperties = {
  minWidth: "84px",
  padding: "7px 14px",
  borderRadius: "11px",
  textAlign: "center",
  color: "#fbf1dd",
  background: "linear-gradient(180deg, #bd9d73 0%, #a9885f 100%)",
  boxShadow: "inset 0 2px 4px rgba(255,255,255,0.22), 0 3px 8px rgba(90,55,20,0.2)",
};

const STAT_LABEL: CSSProperties = {
  fontSize: "0.6rem",
  fontWeight: 800,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "#f0dcbd",
};

const STAT_VALUE: CSSProperties = {
  fontSize: "clamp(1.1rem, 4.4vw, 1.55rem)",
  fontWeight: 900,
  lineHeight: 1.15,
};

const BTN_BASE: CSSProperties = {
  cursor: "pointer",
  border: "none",
  borderRadius: "11px",
  padding: "10px 16px",
  fontWeight: 800,
  fontSize: "0.84rem",
  letterSpacing: "0.01em",
  color: "#fff6e6",
  background: "linear-gradient(180deg, #dd8a2c 0%, #c25e1a 100%)",
  boxShadow: "0 3px 8px rgba(150,70,20,0.32), inset 0 1px 0 rgba(255,255,255,0.28)",
  transition: "transform 90ms ease, filter 90ms ease",
};

const BTN_GHOST: CSSProperties = {
  color: "#4b371f",
  background: "linear-gradient(180deg, #cdb187 0%, #b3946b 100%)",
  boxShadow: "0 3px 8px rgba(90,55,20,0.2), inset 0 1px 0 rgba(255,255,255,0.3)",
};

const BTN_DISABLED: CSSProperties = { opacity: 0.42, cursor: "default", filter: "none", transform: "none" };

function btnStyle(opts?: { ghost?: boolean; disabled?: boolean }): CSSProperties {
  return {
    ...BTN_BASE,
    ...(opts?.ghost ? BTN_GHOST : null),
    ...(opts?.disabled ? BTN_DISABLED : null),
  };
}

const BOARD_WRAP: CSSProperties = { position: "relative", width: "min(92vw, 460px)" };

const OVERLAY_BASE: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 5,
  borderRadius: "15px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "12px",
  textAlign: "center",
  padding: "16px",
  boxSizing: "border-box",
  backdropFilter: "blur(1px)",
  animation: "s2048-fade 220ms ease",
};

const OVERLAY_WIN: CSSProperties = { ...OVERLAY_BASE, background: "rgba(226,185,59,0.86)", color: "#4a3410" };
const OVERLAY_OVER: CSSProperties = { ...OVERLAY_BASE, background: "rgba(120,70,40,0.88)", color: "#fbeede" };

const OVERLAY_TITLE: CSSProperties = { fontSize: "clamp(1.9rem, 8vw, 2.9rem)", fontWeight: 900, lineHeight: 1 };
const OVERLAY_SUB: CSSProperties = { fontSize: "clamp(0.82rem, 3.2vw, 1rem)", fontWeight: 600, opacity: 0.92 };
const OVERLAY_ACTIONS: CSSProperties = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  justifyContent: "center",
  marginTop: "4px",
};

const UNDERBOARD: CSSProperties = {
  width: "min(92vw, 460px)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "6px",
};

const HINT: CSSProperties = {
  margin: 0,
  fontSize: "clamp(0.7rem, 2.5vw, 0.82rem)",
  fontWeight: 600,
  color: "#97764c",
  textAlign: "center",
};

const SEED: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  flexWrap: "wrap",
  justifyContent: "center",
  fontSize: "clamp(0.68rem, 2.4vw, 0.8rem)",
  color: "#8a6a44",
};

const SEED_CODE: CSSProperties = {
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  fontWeight: 700,
  color: "#7a3b16",
  background: "rgba(226,185,59,0.24)",
  padding: "1px 7px",
  borderRadius: "6px",
};

const LINK: CSSProperties = {
  cursor: "pointer",
  border: "none",
  background: "none",
  padding: "2px 4px",
  fontFamily: "inherit",
  fontSize: "inherit",
  fontWeight: 800,
  color: "#c25e1a",
  textDecoration: "underline",
  textUnderlineOffset: "2px",
};

const CREDIT: CSSProperties = {
  maxWidth: "min(92vw, 460px)",
  marginTop: "auto",
  paddingTop: "6px",
  textAlign: "center",
  fontSize: "clamp(0.66rem, 2.3vw, 0.78rem)",
  lineHeight: 1.45,
  color: "#a4855c",
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={STAT}>
      <div style={STAT_LABEL}>{label}</div>
      <div style={STAT_VALUE}>{value.toLocaleString()}</div>
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

  if (state === undefined) return <div style={ROOT} />;

  const showWin = state.won && !state.keepGoing;
  const undoDisabled = state.history === null;

  return (
    <div style={ROOT}>
      <style>{CSS}</style>

      <header style={{ textAlign: "center" }}>
        <h1 style={TITLE}>2048</h1>
        <p style={SUBTITLE}>Stoke the embers — merge tiles to 2048.</p>
      </header>

      <div style={TOPBAR}>
        <div style={{ display: "flex", gap: "8px" }}>
          <Stat label="Score" value={state.score} />
          <Stat label="Best" value={state.best} />
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
          <button type="button" className="s2048-btn" style={btnStyle()} onClick={() => run("newGame")}>
            New Game
          </button>
          <button
            type="button"
            className="s2048-btn"
            style={btnStyle({ ghost: true, disabled: undoDisabled })}
            onClick={() => run("undo")}
            disabled={undoDisabled}
          >
            Undo
          </button>
          <SettingsTrigger className="s2048-btn flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#b3946b] text-base text-[#4b371f] shadow-[0_3px_8px_rgba(90,55,20,0.2),inset_0_1px_0_rgba(255,255,255,0.3)]" />
        </div>
      </div>

      <div style={BOARD_WRAP} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <Board tiles={state.tiles} />

        {showWin && (
          <div style={OVERLAY_WIN}>
            <div style={OVERLAY_TITLE}>You win!</div>
            <div style={OVERLAY_SUB}>You forged a 2048 tile.</div>
            <div style={OVERLAY_ACTIONS}>
              <button type="button" className="s2048-btn" style={btnStyle()} onClick={() => run("keepGoing")}>
                Keep going
              </button>
              <button type="button" className="s2048-btn" style={btnStyle({ ghost: true })} onClick={() => run("newGame")}>
                New Game
              </button>
            </div>
          </div>
        )}

        {state.over && (
          <div style={OVERLAY_OVER}>
            <div style={OVERLAY_TITLE}>Game over</div>
            <div style={OVERLAY_SUB}>No moves left — final score {state.score.toLocaleString()}.</div>
            <div style={OVERLAY_ACTIONS}>
              <button type="button" className="s2048-btn" style={btnStyle()} onClick={() => run("newGame")}>
                Try again
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={UNDERBOARD}>
        <p style={HINT}>
          {coarsePointer ? "Swipe across the board to slide the tiles." : "Arrow keys / WASD to slide · U to undo · N for a new game."}
        </p>
        <div style={SEED}>
          <span>
            Seed <code style={SEED_CODE}>{state.seed}</code>
          </span>
          <button type="button" className="s2048-link" style={LINK} onClick={copyLink}>
            {copied ? "Link copied" : "Copy share link"}
          </button>
        </div>
      </div>

      <footer style={CREDIT}>
        Based on 2048 by Gabriele Cirulli — inspired by Threes! (Asher Vollmer) and 1024!
      </footer>
    </div>
  );
}
