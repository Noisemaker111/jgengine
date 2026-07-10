import { type ReactNode } from "react";

import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";

import type { MatchState } from "../match/state";
import { getMatch, REV_KEY } from "../match/store";
import { Court } from "./Court";
import { CREDIT_LINE } from "./credit";
import { Menu } from "./Menu";
import { FONT, PHOSPHOR, PHOSPHOR_BRIGHT, textGlow } from "./theme";
import { WinScreen } from "./WinScreen";

function modeLabel(m: MatchState): string {
  switch (m.mode) {
    case "two-player":
      return "2 Player";
    case "ai-easy":
      return "CPU · Easy";
    case "ai-medium":
      return "CPU · Medium";
    case "ai-hard":
      return "CPU · Hard";
    default:
      return "";
  }
}

function panelBox(children: ReactNode): ReactNode {
  return (
    <div
      className="rounded-sm border px-3 py-2"
      style={{
        fontFamily: FONT,
        color: PHOSPHOR,
        borderColor: "rgba(88,255,150,0.28)",
        background: "rgba(4,10,7,0.62)",
        textShadow: textGlow(0.5),
      }}
    >
      {children}
    </div>
  );
}

function HudButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pointer-events-auto rounded-sm border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors duration-150 hover:bg-[rgba(88,255,150,0.16)] focus:outline-none"
      style={{ borderColor: "rgba(88,255,150,0.42)", color: PHOSPHOR_BRIGHT, textShadow: textGlow(0.6) }}
    >
      {children}
    </button>
  );
}

function StatusPanel({ m }: { m: MatchState }) {
  const line =
    m.phase === "serve"
      ? `Serve · ${m.server === "L" ? "Left" : "Right"}`
      : `Rally ×${m.volley}`;
  return panelBox(
    <div className="flex flex-col gap-0.5 text-[11px] uppercase tracking-[0.18em]">
      <span className="font-semibold" style={{ color: PHOSPHOR_BRIGHT }}>
        {modeLabel(m)}
      </span>
      <span className="opacity-80">{line}</span>
      <span className="opacity-55">Spd {Math.round(m.ballSpeed)}</span>
    </div>,
  );
}

function PauseOverlay() {
  const ctx = useGameContext();
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/70"
      style={{ fontFamily: FONT }}
    >
      <div className="flex flex-col items-center gap-5 text-center" style={{ color: PHOSPHOR }}>
        <h2
          className="text-3xl font-black uppercase tracking-[0.34em]"
          style={{ color: PHOSPHOR_BRIGHT, textShadow: textGlow(1.2) }}
        >
          Paused
        </h2>
        <div className="flex gap-3">
          <HudButton onClick={() => ctx.game.commands.run("pause", {})}>Resume</HudButton>
          <HudButton onClick={() => ctx.game.commands.run("backToMenu", {})}>Menu</HudButton>
        </div>
      </div>
    </div>
  );
}

export function GameUI() {
  const ctx = useGameContext();
  useGameStore((c) => c.game.store.get(REV_KEY) ?? 0);
  const m = getMatch(ctx);
  const layout = useHudLayout({ storageKey: "paddle-duel" });
  const inMatch = m.phase === "serve" || m.phase === "rally";

  return (
    <div className="absolute inset-0 overflow-hidden bg-black" style={{ fontFamily: FONT }}>
      <div className="absolute inset-0 flex items-center justify-center p-3">
        <Court />
      </div>

      <HudCanvas layout={layout} className="select-none">
        {inMatch ? (
          <HudPanel id="status" anchor="top-left" order={0} compact="chip" chip="INFO" interactive={false} inset={{ x: 14, y: 14 }}>
            <StatusPanel m={m} />
          </HudPanel>
        ) : null}

        {inMatch ? (
          <HudPanel id="controls" anchor="top-right" order={0} compact="keep" inset={{ x: 14, y: 14 }}>
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-2">
                <HudButton onClick={() => ctx.game.commands.run("pause", {})}>Pause</HudButton>
                <HudButton onClick={() => ctx.game.commands.run("backToMenu", {})}>Menu</HudButton>
              </div>
              <div
                className="hidden text-right text-[10px] uppercase leading-relaxed tracking-[0.16em] opacity-55 sm:block"
                style={{ color: PHOSPHOR }}
              >
                <div>Left W / S · drag</div>
                <div>{m.mode === "two-player" ? "Right ↑ / ↓" : "Right CPU"}</div>
                <div>P pause · Space serve</div>
              </div>
            </div>
          </HudPanel>
        ) : null}

        <HudPanel id="credit" anchor="bottom" order={0} compact="keep" interactive={false} inset={{ x: 0, y: 10 }}>
          <div
            className="text-center text-[10px] uppercase tracking-[0.22em]"
            style={{ color: PHOSPHOR, opacity: 0.5, textShadow: textGlow(0.4) }}
          >
            {CREDIT_LINE}
          </div>
        </HudPanel>
      </HudCanvas>

      {m.phase === "menu" ? <Menu /> : null}
      {m.phase === "gameover" ? <WinScreen /> : null}
      {inMatch && m.paused ? <PauseOverlay /> : null}
    </div>
  );
}
