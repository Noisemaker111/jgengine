import type { ReactNode } from "react";
import type { GamePreviewProps, GamePreviewStates } from "@jgengine/react/preview";

import type { BrickBreakerSnapshot } from "./game/breakout/store";
import { Hud } from "./game/ui/components/Hud";
import { Overlays } from "./game/ui/components/Overlays";

const serveSnapshot: BrickBreakerSnapshot = {
  status: "serve",
  paused: false,
  bricks: [],
  balls: [],
  powerups: [],
  paddle: { cx: 0.5, y: 0.94, w: 0.16, h: 0.02, wide: false },
  score: 0,
  best: 4820,
  lives: 3,
  level: 1,
  levelName: "First Contact",
  totalLevels: 12,
  bricksLeft: 48,
  combo: 0,
  maxCombo: 0,
  wideMs: 0,
  slowMs: 0,
  ballSpeed: 0,
  bannerText: "Level 1 — First Contact",
  bannerMs: 1,
  message: null,
  newBest: false,
};

const gameOverSnapshot: BrickBreakerSnapshot = {
  ...serveSnapshot,
  status: "gameover",
  score: 12750,
  best: 18200,
  lives: 0,
  level: 7,
  levelName: "Glyph A",
  bricksLeft: 21,
  maxCombo: 9,
  bannerText: null,
  bannerMs: 0,
};

function BrickWall() {
  return (
    <div
      style={{
        position: "absolute",
        left: "6%",
        right: "6%",
        top: "8%",
        display: "grid",
        gridTemplateColumns: "repeat(12, 1fr)",
        gap: "0.7cqw",
      }}
    >
      {Array.from({ length: 48 }, (_, i) => (
        <span
          key={i}
          style={{
            height: "2.6cqw",
            borderRadius: "0.4cqw",
            background: "linear-gradient(#7be9fb, #0b8fb0)",
            boxShadow: "inset 0 0 0 1px #c8f7ff33",
          }}
        />
      ))}
    </div>
  );
}

function Cabinet({ snapshot, children }: { snapshot: BrickBreakerSnapshot; children?: ReactNode }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden bg-[#040313] font-sans text-white select-none"
      style={{ containerType: "size" }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(91,76,255,0.24),transparent_34%),linear-gradient(#07051e,#02020b)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:repeating-linear-gradient(to_bottom,transparent_0,transparent_3px,white_4px)]" />
      <div className="relative mx-auto flex h-full w-full max-w-5xl flex-col px-2 py-2 sm:px-5 sm:py-4">
        <header className="grid shrink-0 grid-cols-[auto_1fr] items-center gap-3 border-b border-violet-400/25 px-1 pb-2">
          <div className="hidden text-[9px] font-black uppercase tracking-[0.35em] text-fuchsia-300/75 sm:block">
            JG-76 cabinet
          </div>
          <div className="min-w-0">
            <Hud snapshot={snapshot} compact={false} />
          </div>
        </header>
        <div className="relative mt-2 min-h-0 flex-1 border-x-2 border-t-2 border-violet-500/55 bg-[#06051b] shadow-[0_0_40px_rgba(76,29,149,0.38),inset_0_0_38px_rgba(34,211,238,0.04)]">
          <div className="pointer-events-none absolute left-0 top-0 z-10 h-5 w-5 border-l-4 border-t-4 border-cyan-300/70" />
          <div className="pointer-events-none absolute right-0 top-0 z-10 h-5 w-5 border-r-4 border-t-4 border-cyan-300/70" />
          {children}
          <Overlays snapshot={snapshot} onRestart={() => undefined} coarsePointer={false} />
        </div>
        <div className="shrink-0 border-x-2 border-b-2 border-violet-500/55 bg-[#090721] px-3 py-2">
          <div className="flex items-center justify-between gap-3 text-[8px] uppercase tracking-[0.22em] text-slate-500">
            <span>A / D move · Space launch · P pause</span>
            <span className="hidden sm:inline">Breakout tribute · 1976</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export const states: GamePreviewStates = {
  stage_1: () => (
    <Cabinet snapshot={serveSnapshot}>
      <BrickWall />
    </Cabinet>
  ),
  game_over: () => <Cabinet snapshot={gameOverSnapshot} />,
};

export default function BrickBreakerPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#040313",
        color: "#fff",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 50% 10%, rgba(91,76,255,0.24), transparent 34%), linear-gradient(#07051e, #02020b)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.08,
          backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 3px, white 4px)",
        }}
      />

      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "2cqw",
            whiteSpace: "nowrap",
            overflow: "hidden",
            borderBottom: "1px solid rgba(167,139,250,0.25)",
            padding: "1.6cqw 2.4cqw",
          }}
        >
          <span
            style={{
              fontSize: "1.8cqw",
              fontWeight: 700,
              fontFamily: "ui-monospace, monospace",
              color: "#94a3b8",
            }}
          >
            Score <span style={{ color: "#e2e8f0" }}>0</span>
          </span>
          <span
            style={{
              fontSize: "1.8cqw",
              fontWeight: 700,
              fontFamily: "ui-monospace, monospace",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "#94a3b8",
            }}
          >
            <span style={{ color: "#e879f9" }}>LV 1/12</span>
            {" · "}
            <span style={{ color: "#f472b6" }}>♥♥♥</span>
          </span>
        </div>

        <div
          style={{
            position: "relative",
            flex: 1,
            margin: "0 2.4cqw",
            borderLeft: "2px solid rgba(139,92,246,0.55)",
            borderRight: "2px solid rgba(139,92,246,0.55)",
            borderTop: "2px solid rgba(139,92,246,0.55)",
            background: "linear-gradient(#12103a, #0a0928 50%, #050418)",
            boxShadow: "0 0 40px rgba(76,29,149,0.38), inset 0 0 38px rgba(34,211,238,0.04)",
          }}
        >
          <span style={{ position: "absolute", left: 0, top: 0, height: "3cqw", width: "3cqw", borderLeft: "4px solid rgba(103,232,249,0.7)", borderTop: "4px solid rgba(103,232,249,0.7)" }} />
          <span style={{ position: "absolute", right: 0, top: 0, height: "3cqw", width: "3cqw", borderRight: "4px solid rgba(103,232,249,0.7)", borderTop: "4px solid rgba(103,232,249,0.7)" }} />

          <div
            style={{
              position: "absolute",
              left: "6%",
              right: "6%",
              top: "8%",
              display: "grid",
              gridTemplateColumns: "repeat(12, 1fr)",
              gap: "0.7cqw",
            }}
          >
            {Array.from({ length: 48 }, (_, i) => (
              <span
                key={i}
                style={{
                  height: "2.6cqw",
                  borderRadius: "0.4cqw",
                  background: "linear-gradient(#7be9fb, #0b8fb0)",
                  boxShadow: "inset 0 0 0 1px #c8f7ff33",
                }}
              />
            ))}
          </div>

          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "56%",
              transform: "translate(-50%, -50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              borderTop: "1px solid rgba(240,171,252,0.45)",
              borderBottom: "1px solid rgba(240,171,252,0.45)",
              background: "rgba(5,4,20,0.88)",
              boxShadow: "0 0 35px rgba(232,121,249,0.18)",
              padding: "1.6cqw 3.2cqw",
              whiteSpace: "nowrap",
            }}
          >
            <span
              style={{
                fontSize: "2.8cqw",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.26em",
                color: "#f0abfc",
                textShadow: "0 0 12px rgba(232,121,249,0.65)",
              }}
            >
              Level 1 — First Contact
            </span>
          </div>

          <span
            style={{
              position: "absolute",
              left: "50%",
              bottom: "13%",
              transform: "translate(-50%, 0)",
              height: "1.6cqw",
              width: "1.6cqw",
              borderRadius: "50%",
              background: "radial-gradient(circle, #ffffff, #22d3ee)",
              boxShadow: "0 0 10px #a5f3fc",
            }}
          />
          <span
            style={{
              position: "absolute",
              left: "50%",
              bottom: "9%",
              transform: "translateX(-50%)",
              height: "1.7cqw",
              width: "14cqw",
              borderRadius: "1cqw",
              background: "linear-gradient(#7dd3fc, #1d4ed8)",
              boxShadow: "0 0 12px #38bdf8",
            }}
          />
        </div>
      </div>
    </div>
  );
}
