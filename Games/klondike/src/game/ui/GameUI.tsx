import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useDisplayProfile } from "@jgengine/react/display";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";

import { keybinds } from "../keybinds";
import { SUITS, type Card, type CardSource, type MoveTarget } from "../klondike/engine";
import { shareUrl } from "../seed";
import { canAutoComplete, STORE_KEY, type KlondikeSession } from "../session";
import { CardBack, CardFace, EmptySlot, type CardMetrics } from "./components/Card";

const CREDIT = "Traditional patience · digital lineage: Microsoft Solitaire (Wes Cherry, 1990)";
const GOLD = "#e6c65a";
const FELT = "radial-gradient(120% 90% at 50% 0%,#1c7a48 0%,#136437 42%,#0c4a29 78%,#083a20 100%)";

function readSession(ctx: GameContext): KlondikeSession | null {
  return (ctx.game.store.get(STORE_KEY) as KlondikeSession | undefined) ?? null;
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
  const layout = useHudLayout({ storageKey: "klondike" });

  const [, forceTick] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const dragRef = useRef<DragRef | null>(null);
  const autoTicks = useRef(0);

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

  useEffect(() => {
    if (!autoRunning) return;
    if (won) {
      setAutoRunning(false);
      return;
    }
    autoTicks.current = 0;
    const id = setInterval(() => {
      autoTicks.current += 1;
      if (autoTicks.current > 320) {
        setAutoRunning(false);
        return;
      }
      commands.run("autoStep", {});
    }, 90);
    return () => clearInterval(id);
  }, [autoRunning, won, commands]);

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

  if (session === null) return <div style={{ position: "absolute", inset: 0, background: FELT }} />;

  const state = session.state;
  const w = display.compact ? 50 : 78;
  const metrics: CardMetrics = { w, h: Math.round(w * 1.42) };
  const gap = display.compact ? 8 : 14;
  const faceUpGap = Math.round(metrics.h * 0.3);
  const faceDownGap = Math.round(metrics.h * 0.15);
  const wasteGap = Math.round(metrics.w * 0.3);

  const elapsedMs = session.finishedMs ?? (session.startedAtMs === null ? 0 : Date.now() - session.startedAtMs);
  const showAuto = !won && canAutoComplete(state);

  const isDimmed = (source: CardSource): boolean => {
    if (drag === null) return false;
    const s = drag.source;
    if (s.zone !== source.zone) return false;
    if (s.zone === "waste") return true;
    if (s.zone === "foundation" && source.zone === "foundation") return s.suit === source.suit;
    if (s.zone === "tableau" && source.zone === "tableau") return s.pile === source.pile && source.index >= s.index;
    return false;
  };

  const share = (): void => {
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
  };

  const stockPile = (
    <div
      onClick={() => commands.run("draw", {})}
      style={{ cursor: "pointer" }}
      title="Draw from stock"
    >
      {state.stock.length > 0 ? (
        <CardBack metrics={metrics} />
      ) : (
        <EmptySlot metrics={metrics} glyph="↻" dashed={false} />
      )}
    </div>
  );

  const shownWaste = state.waste.slice(-3);
  const wastePile = (
    <div style={{ position: "relative", width: metrics.w + Math.max(0, shownWaste.length - 1) * wasteGap, height: metrics.h }}>
      {shownWaste.length === 0 ? (
        <EmptySlot metrics={metrics} />
      ) : (
        shownWaste.map((card, i) => {
          const isTop = i === shownWaste.length - 1;
          return (
            <div
              key={`${card.suit}-${card.rank}`}
              onPointerDown={isTop ? (e) => startDrag(e, { zone: "waste" }, [card]) : undefined}
              style={{ position: "absolute", left: i * wasteGap, top: 0, cursor: isTop ? "grab" : "default" }}
            >
              <CardFace card={card} metrics={metrics} dim={isTop && isDimmed({ zone: "waste" })} />
            </div>
          );
        })
      )}
    </div>
  );

  const foundations = SUITS.map((suit) => {
    const pile = state.foundations[suit];
    const top = pile[pile.length - 1];
    return (
      <div key={suit} data-drop={JSON.stringify({ zone: "foundation" })}>
        {top === undefined ? (
          <EmptySlot metrics={metrics} suit={suit} />
        ) : (
          <div
            onPointerDown={(e) => startDrag(e, { zone: "foundation", suit }, [top])}
            style={{ cursor: "grab" }}
          >
            <CardFace card={top} metrics={metrics} dim={isDimmed({ zone: "foundation", suit })} />
          </div>
        )}
      </div>
    );
  });

  const tableau = state.tableau.map((cards, pile) => {
    let offsetTop = 0;
    const positioned = cards.map((card, i) => {
      const y = offsetTop;
      offsetTop += card.faceUp ? faceUpGap : faceDownGap;
      return { card, i, y };
    });
    const lastTop = positioned.length > 0 ? positioned[positioned.length - 1].y : 0;
    const height = positioned.length > 0 ? lastTop + metrics.h : metrics.h;
    return (
      <div
        key={pile}
        data-drop={JSON.stringify({ zone: "tableau", pile })}
        style={{ position: "relative", width: metrics.w, height, minHeight: metrics.h }}
      >
        <div style={{ position: "absolute", inset: 0, height: metrics.h }}>
          <EmptySlot metrics={metrics} dashed />
        </div>
        {positioned.map(({ card, i, y }) => (
          <div
            key={`${card.suit}-${card.rank}`}
            onPointerDown={card.faceUp ? (e) => startDrag(e, { zone: "tableau", pile, index: i }, cards.slice(i)) : undefined}
            style={{ position: "absolute", top: y, left: 0, cursor: card.faceUp ? "grab" : "default" }}
          >
            {card.faceUp ? (
              <CardFace card={card} metrics={metrics} dim={isDimmed({ zone: "tableau", pile, index: i })} />
            ) : (
              <CardBack metrics={metrics} />
            )}
          </div>
        ))}
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
          paddingTop: display.compact ? 86 : 108,
          paddingBottom: 76,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: gap * 1.6, padding: `0 ${gap}px`, maxWidth: metrics.w * 7 + gap * 8, pointerEvents: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: gap * 2, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap }}>
              {stockPile}
              {wastePile}
            </div>
            <div style={{ display: "flex", gap }}>{foundations}</div>
          </div>
          <div style={{ display: "flex", gap, justifyContent: "center", alignItems: "flex-start" }}>{tableau}</div>
        </div>
      </div>

      <HudPanel id="brand" anchor="top-left" compact="keep">
        <div style={{ ...panelStyle, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontWeight: 800, letterSpacing: 1, color: GOLD, fontSize: 15 }}>KLONDIKE</div>
          <div style={{ fontSize: 11, color: "rgba(240,235,215,0.65)" }}>
            {session.seedSource === "daily" ? "Daily deal" : "Free play"} · {seedLabel(session.seed)}
          </div>
        </div>
      </HudPanel>

      <HudPanel id="stats" anchor="top" compact="keep">
        <div style={{ ...panelStyle, display: "flex", gap: 18, alignItems: "center" }}>
          <Stat label="Score" value={String(state.score)} />
          <Stat label="Time" value={formatTime(elapsedMs)} />
          <Stat label="Moves" value={String(state.moves)} />
          <div style={{ width: 1, height: 26, background: "rgba(255,255,255,0.16)" }} />
          <Stat label={`Best ${state.drawMode === 1 ? "◆" : "◆◆◆"}`} value={bestLabel(session)} muted />
        </div>
      </HudPanel>

      <HudPanel id="controls" anchor="top-right" compact="chip" chip="Menu">
        <div style={{ ...panelStyle, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", maxWidth: 360 }}>
          <Btn badge={kb("newDeal")} onClick={() => commands.run("newDeal", {})}>New</Btn>
          <Btn badge={kb("dailyDeal")} onClick={() => commands.run("dailyDeal", {})}>Daily</Btn>
          <Btn badge={kb("restart")} onClick={() => commands.run("restart", {})}>Restart</Btn>
          <Btn badge={kb("toggleDrawMode")} onClick={() => commands.run("toggleDrawMode", {})}>Draw {state.drawMode}</Btn>
          <Btn badge={kb("undo")} onClick={() => commands.run("undo", {})} disabled={session.history.length === 0 || won}>
            Undo
          </Btn>
          {showAuto ? (
            <Btn tone="primary" onClick={() => setAutoRunning(true)}>
              Auto
            </Btn>
          ) : null}
          <Btn onClick={share}>{copied ? "Copied" : "Share"}</Btn>
        </div>
      </HudPanel>

      <HudPanel id="credit" anchor="bottom" compact="keep" interactive={false}>
        <div style={{ fontSize: 11, color: "rgba(235,230,210,0.6)", textAlign: "center", padding: "4px 10px", textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>
          {CREDIT}
        </div>
      </HudPanel>

      {drag !== null ? (
        <div style={{ position: "fixed", left: drag.x - drag.offX, top: drag.y - drag.offY, zIndex: 60, pointerEvents: "none" }}>
          {drag.cards.map((card, i) => (
            <div key={`${card.suit}-${card.rank}`} style={{ position: "absolute", top: i * faceUpGap, left: 0 }}>
              <CardFace card={card} metrics={metrics} lifted />
            </div>
          ))}
        </div>
      ) : null}

      {won ? <WinOverlay session={session} onNew={() => commands.run("newDeal", {})} onDaily={() => commands.run("dailyDeal", {})} onShare={share} copied={copied} /> : null}
    </HudCanvas>
    </div>
  );
}

const panelStyle: CSSProperties = {
  background: "rgba(8,28,18,0.82)",
  border: "1px solid rgba(230,198,90,0.25)",
  borderRadius: 12,
  padding: "8px 12px",
  color: "#f3efdc",
  boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
  backdropFilter: "blur(6px)",
};

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }): ReactNode {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 44 }}>
      <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "rgba(240,235,215,0.55)" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: muted ? "rgba(240,235,215,0.75)" : "#fff", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function Btn({ children, onClick, disabled, tone, badge }: { children: ReactNode; onClick: () => void; disabled?: boolean; tone?: "primary"; badge?: string }): ReactNode {
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
        border: primary ? "1px solid rgba(255,230,140,0.7)" : "1px solid rgba(230,198,90,0.3)",
        borderRadius: 9,
        padding: "6px 12px",
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? "default" : "pointer",
        color: primary ? "#241c04" : "#f2eeda",
        background: primary
          ? "linear-gradient(180deg,#f4d874,#e0b63f)"
          : "rgba(255,255,255,0.06)",
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
            color: primary ? "#241c04" : "rgba(240,235,215,0.85)",
            background: primary ? "rgba(36,28,4,0.16)" : "rgba(255,255,255,0.09)",
            border: primary ? "1px solid rgba(36,28,4,0.28)" : "1px solid rgba(230,198,90,0.32)",
          }}
        >
          {badge}
        </kbd>
      ) : null}
    </button>
  );
}

function WinOverlay({ session, onNew, onDaily, onShare, copied }: {
  session: KlondikeSession;
  onNew: () => void;
  onDaily: () => void;
  onShare: () => void;
  copied: boolean;
}): ReactNode {
  const improved = session.improved.length > 0;
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(4,18,10,0.7)", zIndex: 70, pointerEvents: "auto" }}>
      <div
        style={{
          ...panelStyle,
          padding: "26px 34px",
          textAlign: "center",
          maxWidth: 400,
          border: "1px solid rgba(230,198,90,0.5)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ fontSize: 34, letterSpacing: 4, color: GOLD }}>♠ ♥ ♦ ♣</div>
        <div style={{ fontSize: 28, fontWeight: 900, margin: "6px 0 2px", color: "#fff" }}>You win</div>
        <div style={{ fontSize: 13, color: "rgba(240,235,215,0.7)", marginBottom: 14 }}>
          Draw {session.state.drawMode} solved
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 26, marginBottom: 16 }}>
          <Stat label="Score" value={String(session.state.score)} />
          <Stat label="Time" value={session.finishedMs === null ? "—" : formatTime(session.finishedMs)} />
          <Stat label="Moves" value={String(session.state.moves)} />
        </div>
        {improved ? (
          <div style={{ display: "inline-block", padding: "4px 12px", borderRadius: 20, background: "linear-gradient(180deg,#f4d874,#e0b63f)", color: "#241c04", fontWeight: 800, fontSize: 12, marginBottom: 14 }}>
            New personal best
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
          <Btn tone="primary" onClick={onNew}>
            New deal
          </Btn>
          <Btn onClick={onDaily}>Daily</Btn>
          <Btn onClick={onShare}>{copied ? "Copied" : "Share seed"}</Btn>
        </div>
      </div>
    </div>
  );
}

function seedLabel(seed: string): string {
  return seed.length > 16 ? `${seed.slice(0, 16)}…` : seed;
}

function bestLabel(session: KlondikeSession): string {
  const { time, moves } = session.bests;
  if (time === null && moves === null) return "—";
  const timePart = time === null ? "—" : formatTime(time);
  const movePart = moves === null ? "—" : `${moves}m`;
  return `${timePart} / ${movePart}`;
}
