import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useDisplayProfile } from "@jgengine/react/display";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";

import { keybinds } from "../keybinds";
import {
  canDeal,
  color,
  dealsRemaining,
  movableRun,
  RANK_LABEL,
  SUIT_GLYPH,
  type Card,
  type CardSource,
  type MoveTarget,
  type SuitCount,
} from "../spider/engine";
import { shareUrl } from "../seed";
import { STORE_KEY, type SpiderSession } from "../session";
import { CardBack, CardFace, EmptySlot, type CardMetrics } from "./components/Card";

const CREDIT = "Spider — traditional patience; popularized by Windows Spider Solitaire";
const SILVER = "#cfd3dc";
const FELT = "radial-gradient(120% 90% at 50% 0%,#7a2138 0%,#5e1729 42%,#40101d 78%,#2a0a14 100%)";
const DIFFICULTIES: readonly SuitCount[] = [1, 2, 4];

function readSession(ctx: GameContext): SpiderSession | null {
  return (ctx.game.store.get(STORE_KEY) as SpiderSession | undefined) ?? null;
}

function kb(action: string): string | undefined {
  return actionLabel(keybinds, action) ?? undefined;
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

function difficultyLabel(suits: SuitCount): string {
  return `${suits}-Suit`;
}

interface DragState {
  source: CardSource;
  cards: Card[];
  x: number;
  y: number;
  offX: number;
  offY: number;
}

interface DragRef {
  source: CardSource;
  cards: Card[];
  startX: number;
  startY: number;
  offX: number;
  offY: number;
  active: boolean;
}

function dropTargetAt(x: number, y: number): MoveTarget | null {
  const el = document.elementFromPoint(x, y);
  const dropEl = el === null ? null : (el.closest("[data-drop]") as HTMLElement | null);
  const raw = dropEl?.dataset.drop;
  if (raw === undefined) return null;
  try {
    return JSON.parse(raw) as MoveTarget;
  } catch {
    return null;
  }
}

export function GameUI(): ReactNode {
  const session = useGameStore(readSession);
  const { commands } = useGame();
  const display = useDisplayProfile();
  const layout = useHudLayout({ storageKey: "spider" });

  const [, forceTick] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [copied, setCopied] = useState(false);
  const dragRef = useRef<DragRef | null>(null);

  useEffect(() => {
    const move = (e: PointerEvent): void => {
      const d = dragRef.current;
      if (d === null) return;
      if (!d.active) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return;
        d.active = true;
      }
      setDrag({ source: d.source, cards: d.cards, x: e.clientX, y: e.clientY, offX: d.offX, offY: d.offY });
    };
    const up = (e: PointerEvent): void => {
      const d = dragRef.current;
      if (d === null) return;
      dragRef.current = null;
      setDrag(null);
      if (!d.active) {
        commands.run("smartMove", { source: d.source });
        return;
      }
      const target = dropTargetAt(e.clientX, e.clientY);
      if (target !== null) commands.run("moveCard", { source: d.source, target });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [commands]);

  const won = session?.state.won ?? false;
  const running = session !== null && session.startedAtMs !== null && session.finishedMs === null;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => forceTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [running]);

  const startDrag = useCallback((e: ReactPointerEvent, source: CardSource, cards: Card[]): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragRef.current = {
      source,
      cards,
      startX: e.clientX,
      startY: e.clientY,
      offX: e.clientX - rect.left,
      offY: e.clientY - rect.top,
      active: false,
    };
  }, []);

  const share = useCallback((): void => {
    if (session === null) return;
    const url = shareUrl(session.seed);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        })
        .catch(() => {});
    }
  }, [session]);

  if (session === null) return <div style={{ position: "absolute", inset: 0, background: FELT }} />;

  const state = session.state;
  const w = display.compact ? 36 : 58;
  const metrics: CardMetrics = { w, h: Math.round(w * 1.42) };
  const mini: CardMetrics = { w: Math.round(w * 0.66), h: Math.round(w * 0.66 * 1.42) };
  const gap = display.compact ? 5 : 10;
  const faceUpGap = Math.round(metrics.h * 0.28);
  const faceDownGap = Math.round(metrics.h * 0.14);
  const deals = dealsRemaining(state);
  const dealable = canDeal(state);

  const elapsedMs = session.finishedMs ?? (session.startedAtMs === null ? 0 : Date.now() - session.startedAtMs);

  const isDimmed = (source: CardSource): boolean => {
    if (drag === null) return false;
    const s = drag.source;
    return s.pile === source.pile && source.index >= s.index;
  };

  const stockFan = (
    <div
      onClick={() => commands.run("dealStock", {})}
      title={dealable ? "Deal a row to every pile" : "Deal blocked — fill every empty pile first"}
      style={{
        position: "relative",
        width: mini.w + Math.max(0, deals - 1) * Math.round(mini.w * 0.28) + 4,
        height: mini.h,
        cursor: deals > 0 && dealable ? "pointer" : "default",
        opacity: deals === 0 ? 0.35 : dealable ? 1 : 0.5,
      }}
    >
      {deals === 0 ? (
        <EmptySlot metrics={mini} glyph="✦" dashed={false} />
      ) : (
        Array.from({ length: deals }).map((_, i) => (
          <div key={i} style={{ position: "absolute", left: i * Math.round(mini.w * 0.28), top: 0 }}>
            <CardBack metrics={mini} />
          </div>
        ))
      )}
    </div>
  );

  const foundations = (
    <div style={{ display: "flex", gap: Math.round(gap * 0.6) }}>
      {Array.from({ length: 8 }).map((_, i) => {
        const suit = state.completed[i];
        return suit === undefined ? (
          <EmptySlot key={i} metrics={mini} />
        ) : (
          <CardFace key={i} card={{ id: -1 - i, suit, rank: 13, faceUp: true } satisfies Card} metrics={mini} />
        );
      })}
    </div>
  );

  const tableau = state.tableau.map((cards, pile) => {
    let offset = 0;
    const positioned = cards.map((card, i) => {
      const y = offset;
      offset += card.faceUp ? faceUpGap : faceDownGap;
      return { card, i, y };
    });
    const lastTop = positioned.length > 0 ? positioned[positioned.length - 1].y : 0;
    const height = positioned.length > 0 ? lastTop + metrics.h : metrics.h;
    return (
      <div
        key={pile}
        data-drop={JSON.stringify({ pile } satisfies MoveTarget)}
        style={{ position: "relative", width: metrics.w, height, minHeight: metrics.h }}
      >
        <div style={{ position: "absolute", inset: 0, height: metrics.h }}>
          <EmptySlot metrics={metrics} dashed />
        </div>
        {positioned.map(({ card, i, y }) => {
          const run = card.faceUp ? movableRun(cards, i) : null;
          return (
            <div
              key={card.id}
              onPointerDown={run !== null ? (e) => startDrag(e, { pile, index: i }, run) : undefined}
              style={{ position: "absolute", top: y, left: 0, cursor: run !== null ? "grab" : "default" }}
            >
              {card.faceUp ? (
                <CardFace card={card} metrics={metrics} dim={isDimmed({ pile, index: i })} />
              ) : (
                <CardBack metrics={metrics} />
              )}
            </div>
          );
        })}
      </div>
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, background: FELT }}>
      <HudCanvas layout={layout} className="select-none overflow-hidden">
        <div
          style={{
            position: "absolute",
            inset: 0,
            overflow: "auto",
            paddingTop: display.compact ? 92 : 116,
            paddingBottom: 74,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: gap * 1.6,
              padding: `0 ${gap}px`,
              maxWidth: metrics.w * 10 + gap * 12,
              pointerEvents: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: gap * 2, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
                {stockFan}
                <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "rgba(232,224,228,0.6)" }}>
                  {deals} deal{deals === 1 ? "" : "s"} left
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
                {foundations}
                <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "rgba(232,224,228,0.6)" }}>
                  {state.completed.length}/8 suits home
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap, justifyContent: "center", alignItems: "flex-start" }}>{tableau}</div>
          </div>
        </div>

        <HudPanel id="brand" anchor="top-left" compact="keep">
          <div style={{ ...panelStyle, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontWeight: 800, letterSpacing: 1.5, color: SILVER, fontSize: 15 }}>SPIDER ♠</div>
            <div style={{ fontSize: 11, color: "rgba(236,228,232,0.68)" }}>
              {difficultyLabel(state.suits)} · {session.seedSource === "daily" ? "Daily deal" : session.seedSource === "seed" ? "Shared deal" : "Free play"}
            </div>
            <div style={{ fontSize: 10, color: "rgba(236,228,232,0.42)" }}>{seedLabel(session.seed)}</div>
          </div>
        </HudPanel>

        <HudPanel id="stats" anchor="top" compact="keep">
          <div style={{ ...panelStyle, display: "flex", gap: display.compact ? 12 : 18, alignItems: "center" }}>
            <Stat label="Score" value={String(state.score)} />
            <Stat label="Time" value={formatTime(elapsedMs)} />
            <Stat label="Moves" value={String(state.moves)} />
            <div style={{ width: 1, height: 26, background: "rgba(255,255,255,0.16)" }} />
            <Stat label={`Best ${difficultyLabel(state.suits)}`} value={bestLabel(session)} muted />
          </div>
        </HudPanel>

        <HudPanel id="controls" anchor="top-right" compact="chip" chip="Menu">
          <div style={{ ...panelStyle, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", maxWidth: 380 }}>
            <div style={{ display: "flex", gap: 3, padding: 2, borderRadius: 9, background: "rgba(255,255,255,0.05)" }}>
              {DIFFICULTIES.map((suits) => (
                <SegButton key={suits} active={state.suits === suits} onClick={() => commands.run("setDifficulty", { suits })}>
                  {suits === 1 ? "1♠" : suits === 2 ? "2♠♥" : "4★"}
                </SegButton>
              ))}
            </div>
            <Btn badge={kb("newDeal")} onClick={() => commands.run("newDeal", {})}>New</Btn>
            <Btn badge={kb("dailyDeal")} onClick={() => commands.run("dailyDeal", {})}>Daily</Btn>
            <Btn badge={kb("restart")} onClick={() => commands.run("restart", {})}>Restart</Btn>
            <Btn badge={kb("dealStock")} onClick={() => commands.run("dealStock", {})} disabled={!dealable}>Deal</Btn>
            <Btn badge={kb("undo")} onClick={() => commands.run("undo", {})} disabled={session.history.length === 0 || won}>Undo</Btn>
            <Btn onClick={share}>{copied ? "Copied" : "Share"}</Btn>
          </div>
        </HudPanel>

        <HudPanel id="credit" anchor="bottom" compact="keep" interactive={false}>
          <div style={{ fontSize: 11, color: "rgba(236,228,232,0.6)", textAlign: "center", padding: "4px 10px", textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>
            {CREDIT}
          </div>
        </HudPanel>

        {drag !== null ? (
          <div style={{ position: "fixed", left: drag.x - drag.offX, top: drag.y - drag.offY, zIndex: 60, pointerEvents: "none" }}>
            {drag.cards.map((card, i) => (
              <div key={card.id} style={{ position: "absolute", top: i * faceUpGap, left: 0 }}>
                <CardFace card={card} metrics={metrics} lifted />
              </div>
            ))}
          </div>
        ) : null}

        {won ? (
          <WinOverlay
            session={session}
            onNew={() => commands.run("newDeal", {})}
            onDaily={() => commands.run("dailyDeal", {})}
            onShare={share}
            copied={copied}
          />
        ) : null}
      </HudCanvas>
    </div>
  );
}

const panelStyle: CSSProperties = {
  background: "rgba(30,9,15,0.84)",
  border: "1px solid rgba(207,211,220,0.26)",
  borderRadius: 12,
  padding: "8px 12px",
  color: "#f3eef0",
  boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
  backdropFilter: "blur(6px)",
};

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }): ReactNode {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 44 }}>
      <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "rgba(236,228,232,0.55)" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: muted ? "rgba(236,228,232,0.78)" : "#fff", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function SegButton({ children, active, onClick }: { children: ReactNode; active: boolean; onClick: () => void }): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        appearance: "none",
        border: "none",
        borderRadius: 7,
        padding: "5px 9px",
        fontSize: 12,
        fontWeight: 800,
        cursor: "pointer",
        color: active ? "#2a0a14" : "rgba(236,228,232,0.8)",
        background: active ? "linear-gradient(180deg,#eceef3,#c3c8d3)" : "transparent",
        transition: "background 0.15s",
      }}
    >
      {children}
    </button>
  );
}

function Btn({ children, onClick, disabled, tone, badge }: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary";
  badge?: string;
}): ReactNode {
  const primary = tone === "primary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        appearance: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: primary ? "1px solid rgba(230,234,244,0.75)" : "1px solid rgba(207,211,220,0.3)",
        borderRadius: 9,
        padding: "6px 12px",
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? "default" : "pointer",
        color: primary ? "#2a0a14" : "#f2eef0",
        background: primary ? "linear-gradient(180deg,#eceef3,#c3c8d3)" : "rgba(255,255,255,0.06)",
        opacity: disabled ? 0.4 : 1,
        transition: "background 0.15s",
      }}
    >
      <span>{children}</span>
      {badge !== undefined ? (
        <kbd
          style={{
            fontSize: 10,
            fontWeight: 800,
            lineHeight: 1,
            padding: "2px 5px",
            borderRadius: 5,
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            color: primary ? "#2a0a14" : "rgba(236,228,232,0.85)",
            background: primary ? "rgba(42,10,20,0.14)" : "rgba(255,255,255,0.09)",
            border: primary ? "1px solid rgba(42,10,20,0.28)" : "1px solid rgba(207,211,220,0.34)",
          }}
        >
          {badge}
        </kbd>
      ) : null}
    </button>
  );
}

function WinOverlay({ session, onNew, onDaily, onShare, copied }: {
  session: SpiderSession;
  onNew: () => void;
  onDaily: () => void;
  onShare: () => void;
  copied: boolean;
}): ReactNode {
  const improved = session.improved.length > 0;
  const suits: string[] = ["♠", "♥", "♦", "♣", "♠", "♥", "♦", "♣"];
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(24,6,12,0.72)", zIndex: 70, pointerEvents: "auto" }}>
      <style>{"@keyframes spider-rise{0%{transform:translateY(8px) scale(0.9);opacity:0.2}50%{opacity:1}100%{transform:translateY(-6px) scale(1.08);opacity:0.85}}"}</style>
      <div
        style={{
          ...panelStyle,
          padding: "26px 34px",
          textAlign: "center",
          maxWidth: 420,
          border: "1px solid rgba(207,211,220,0.5)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", gap: 10, fontSize: 30, color: SILVER, marginBottom: 4 }}>
          {suits.map((g, i) => (
            <span key={i} style={{ display: "inline-block", color: g === "♥" || g === "♦" ? "#e28a94" : SILVER, animation: `spider-rise 1.1s ease-in-out ${i * 0.09}s infinite alternate` }}>
              {g}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, margin: "8px 0 2px", color: "#fff" }}>All eight home</div>
        <div style={{ fontSize: 13, color: "rgba(236,228,232,0.7)", marginBottom: 14 }}>{difficultyLabel(session.state.suits)} solved</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 26, marginBottom: 16 }}>
          <Stat label="Score" value={String(session.state.score)} />
          <Stat label="Time" value={session.finishedMs === null ? "—" : formatTime(session.finishedMs)} />
          <Stat label="Moves" value={String(session.state.moves)} />
        </div>
        {improved ? (
          <div style={{ display: "inline-block", padding: "4px 12px", borderRadius: 20, background: "linear-gradient(180deg,#eceef3,#c3c8d3)", color: "#2a0a14", fontWeight: 800, fontSize: 12, marginBottom: 14 }}>
            New personal best
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
          <Btn tone="primary" onClick={onNew}>New deal</Btn>
          <Btn onClick={onDaily}>Daily</Btn>
          <Btn onClick={onShare}>{copied ? "Copied" : "Share seed"}</Btn>
        </div>
      </div>
    </div>
  );
}

function seedLabel(seed: string): string {
  return seed.length > 18 ? `${seed.slice(0, 18)}…` : seed;
}

function bestLabel(session: SpiderSession): string {
  const { score, time } = session.bests;
  if (score === null && time === null) return "—";
  const scorePart = score === null ? "—" : String(score);
  const timePart = time === null ? "—" : formatTime(time);
  return `${scorePart} / ${timePart}`;
}
