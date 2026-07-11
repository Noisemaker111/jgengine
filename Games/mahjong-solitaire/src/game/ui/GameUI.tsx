import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { SettingsTrigger } from "@jgengine/react";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";

import { keybinds } from "../keybinds";
import { layoutBounds, TURTLE } from "../mahjong/layout";
import { shareUrl } from "../seed";
import {
  freeMatchPairs,
  isStuck,
  remainingPairs,
  STORE_KEY,
  tileStates,
  type Session,
} from "../session";
import { Tile } from "./components/Tile";

const CREDIT = "Mahjong solitaire — Brodie Lockard (1981)";
const GOLD = "#e6c65a";
const JADE =
  "radial-gradient(130% 100% at 50% 0%,#1e6f52 0%,#155a41 44%,#0e4631 76%,#0a3324 100%)";

const HALF_X = 18;
const HALF_Y = 24;
const DEPTH = 5;
const TILE_W = HALF_X * 2;
const TILE_H = HALF_Y * 2;
const BOUNDS = layoutBounds();
const BOARD_W = (BOUNDS.maxX - BOUNDS.minX) * HALF_X + BOUNDS.maxZ * DEPTH + 8;
const BOARD_H = (BOUNDS.maxY - BOUNDS.minY) * HALF_Y + BOUNDS.maxZ * DEPTH + 8;

function readSession(ctx: GameContext): Session | null {
  return (ctx.game.store.get(STORE_KEY) as Session | undefined) ?? null;
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

export function GameUI(): ReactNode {
  const session = useGameStore(readSession);
  const { commands } = useGame();
  const layout = useHudLayout({ storageKey: "mahjong-solitaire" });

  const [, forceTick] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [scale, setScale] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  const pick = useCallback((id: number) => commands.run("pick", { slotId: id }), [commands]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el === null) return;
    const compute = (): void => {
      const avail = el.clientWidth - 28;
      setScale(Math.min(1.2, Math.max(0.4, avail / BOARD_W)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const running = session !== null && session.startedAtMs !== null && session.finishedMs === null;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => forceTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [running]);

  const hintActive = session?.hint ?? null;
  useEffect(() => {
    if (hintActive === null) return;
    const id = setTimeout(() => commands.run("clearHint", {}), 1400);
    return () => clearTimeout(id);
  }, [hintActive, commands]);

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

  if (session === null) return <div style={{ position: "absolute", inset: 0, background: JADE }} />;

  const states = tileStates(session);
  const won = session.status === "won";
  const stuck = isStuck(session);
  const elapsedMs = session.finishedMs ?? (session.startedAtMs === null ? 0 : Date.now() - session.startedAtMs);
  const pairsLeft = remainingPairs(session);
  const freePairs = freeMatchPairs(session);

  return (
    <div style={{ position: "absolute", inset: 0, background: JADE }}>
      <HudCanvas layout={layout} style={{ userSelect: "none", overflow: "hidden" }}>
        <div
          ref={scrollRef}
          style={{
            position: "absolute",
            inset: 0,
            overflow: "auto",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            paddingTop: 96,
            paddingBottom: 64,
            pointerEvents: "auto",
          }}
        >
          <div style={{ width: BOARD_W * scale, height: BOARD_H * scale, flex: "none" }}>
            <div style={{ width: BOARD_W, height: BOARD_H, position: "relative", transform: `scale(${scale})`, transformOrigin: "top left" }}>
              {TURTLE.map((s) => {
                const face = session.faces[s.id];
                if (face === null) return null;
                const st = states[s.id] ?? "blocked";
                return (
                  <Tile
                    key={s.id}
                    id={s.id}
                    faceId={face}
                    w={TILE_W}
                    h={TILE_H}
                    left={(s.x - BOUNDS.minX) * HALF_X + (BOUNDS.maxZ - s.z) * DEPTH}
                    top={(s.y - BOUNDS.minY) * HALF_Y + (BOUNDS.maxZ - s.z) * DEPTH}
                    zIndex={s.z * 1000 + s.y * 30 + s.x}
                    state={st}
                    hovered={hovered === s.id}
                    onPick={pick}
                    onHover={setHovered}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <HudPanel id="brand" anchor="top-left" compact="keep">
          <div style={{ ...panelStyle, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontWeight: 800, letterSpacing: 2, color: GOLD, fontSize: 15 }}>MAHJONG 麻將</div>
            <div style={{ fontSize: 11, color: "rgba(240,235,215,0.66)" }}>
              {sourceLabel(session)} · {seedLabel(session.seed)}
            </div>
          </div>
        </HudPanel>

        <HudPanel id="stats" anchor="top" compact="keep">
          <div style={{ ...panelStyle, display: "flex", gap: 16, alignItems: "center" }}>
            <Stat label="Pairs" value={String(pairsLeft)} />
            <Stat label="Free" value={String(freePairs)} tone={freePairs === 0 ? "warn" : undefined} />
            <div style={{ width: 1, height: 26, background: "rgba(255,255,255,0.16)" }} />
            <Stat label="Time" value={formatTime(elapsedMs)} />
            <Stat label="Best" value={session.best === null ? "—" : formatTime(session.best)} muted />
          </div>
        </HudPanel>

        <HudPanel id="settings" anchor="top-right" compact="keep">
          <SettingsTrigger className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-xl border border-[rgba(230,198,90,0.28)] bg-[rgba(9,32,22,0.84)] text-[#f2eeda] shadow-[0_6px_18px_rgba(0,0,0,0.4)] backdrop-blur-md transition hover:bg-white/10" />
        </HudPanel>

        <HudPanel id="controls" anchor="top-right" compact="chip" chip="Menu">
          <div style={{ ...panelStyle, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", maxWidth: 340 }}>
            <Btn tone="primary" badge={kb("hint")} onClick={() => commands.run("hint", {})} disabled={won}>
              Hint{session.hintsUsed > 0 ? ` ·${session.hintsUsed}` : ""}
            </Btn>
            <Btn badge={kb("undo")} onClick={() => commands.run("undo", {})} disabled={session.history.length === 0}>
              Undo
            </Btn>
            <Btn
              badge={kb("reshuffle")}
              onClick={() => commands.run("reshuffle", {})}
              disabled={won || session.reshufflesLeft === 0}
            >
              Shuffle ·{session.reshufflesLeft}
            </Btn>
            <Btn badge={kb("newDeal")} onClick={() => commands.run("newDeal", {})}>New</Btn>
            <Btn badge={kb("dailyDeal")} onClick={() => commands.run("dailyDeal", {})}>Daily</Btn>
            <Btn badge={kb("restart")} onClick={() => commands.run("restart", {})}>Restart</Btn>
            <Btn onClick={share}>{copied ? "Copied" : "Share"}</Btn>
          </div>
        </HudPanel>

        <HudPanel id="credit" anchor="bottom" compact="keep" interactive={false}>
          <div style={{ fontSize: 11, color: "rgba(235,230,210,0.62)", textAlign: "center", padding: "4px 10px", textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>
            {CREDIT}
          </div>
        </HudPanel>

        {stuck && !won ? (
          <StuckBanner
            reshufflesLeft={session.reshufflesLeft}
            onShuffle={() => commands.run("reshuffle", {})}
            onNew={() => commands.run("newDeal", {})}
          />
        ) : null}

        {won ? (
          <WinOverlay
            session={session}
            time={formatTime(session.finishedMs ?? 0)}
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
  background: "rgba(9,32,22,0.84)",
  border: "1px solid rgba(230,198,90,0.28)",
  borderRadius: 12,
  padding: "8px 12px",
  color: "#f3efdc",
  boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
  backdropFilter: "blur(6px)",
};

function Stat({ label, value, muted, tone }: { label: string; value: string; muted?: boolean; tone?: "warn" }): ReactNode {
  const color = tone === "warn" ? "#f0a23a" : muted ? "rgba(240,235,215,0.75)" : "#fff";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 40 }}>
      <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "rgba(240,235,215,0.55)" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
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
        border: primary ? "1px solid rgba(255,230,140,0.7)" : "1px solid rgba(230,198,90,0.3)",
        borderRadius: 9,
        padding: "6px 12px",
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? "default" : "pointer",
        color: primary ? "#241c04" : "#f2eeda",
        background: primary ? "linear-gradient(180deg,#f4d874,#e0b63f)" : "rgba(255,255,255,0.06)",
        opacity: disabled ? 0.4 : 1,
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

function StuckBanner({ reshufflesLeft, onShuffle, onNew }: {
  reshufflesLeft: number;
  onShuffle: () => void;
  onNew: () => void;
}): ReactNode {
  return (
    <HudPanel id="stuck" anchor="center" compact="keep">
      <div style={{ ...panelStyle, textAlign: "center", padding: "18px 24px", border: "1px solid rgba(240,162,58,0.6)" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#f0a23a", marginBottom: 4 }}>No moves left</div>
        <div style={{ fontSize: 12, color: "rgba(240,235,215,0.7)", marginBottom: 12 }}>
          {reshufflesLeft > 0 ? `Reshuffle the board or start fresh — ${reshufflesLeft} left.` : "Out of reshuffles — start a new deal."}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          {reshufflesLeft > 0 ? (
            <Btn tone="primary" onClick={onShuffle}>
              Reshuffle ·{reshufflesLeft}
            </Btn>
          ) : null}
          <Btn onClick={onNew}>New deal</Btn>
        </div>
      </div>
    </HudPanel>
  );
}

function WinOverlay({ session, time, onNew, onDaily, onShare, copied }: {
  session: Session;
  time: string;
  onNew: () => void;
  onDaily: () => void;
  onShare: () => void;
  copied: boolean;
}): ReactNode {
  const improved = session.improved.length > 0;
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(5,22,14,0.72)", zIndex: 80, pointerEvents: "auto" }}>
      <div style={{ ...panelStyle, padding: "26px 34px", textAlign: "center", maxWidth: 380, border: "1px solid rgba(230,198,90,0.5)", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ fontSize: 30, letterSpacing: 6, color: GOLD }}>麻 將</div>
        <div style={{ fontSize: 27, fontWeight: 900, margin: "6px 0 2px", color: "#fff" }}>Board cleared</div>
        <div style={{ fontSize: 13, color: "rgba(240,235,215,0.7)", marginBottom: 14 }}>Every tile matched away</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 26, marginBottom: 16 }}>
          <Stat label="Time" value={time} />
          <Stat label="Hints" value={String(session.hintsUsed)} />
          <Stat label="Best" value={session.best === null ? "—" : formatTime(session.best)} muted />
        </div>
        {improved ? (
          <div style={{ display: "inline-block", padding: "4px 12px", borderRadius: 20, background: "linear-gradient(180deg,#f4d874,#e0b63f)", color: "#241c04", fontWeight: 800, fontSize: 12, marginBottom: 14 }}>
            New best time
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

function sourceLabel(session: Session): string {
  if (session.source === "daily") return "Daily deal";
  if (session.source === "seed") return "Shared deal";
  return "Free play";
}

function seedLabel(seed: string): string {
  return seed.length > 16 ? `${seed.slice(0, 16)}…` : seed;
}
