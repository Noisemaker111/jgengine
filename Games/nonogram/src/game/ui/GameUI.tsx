import { useGame } from "@jgengine/react/hooks";
import { HudCanvas, HudPanel, SettingsTrigger, useHudLayout } from "@jgengine/react";
import type { CSSProperties } from "react";
import { puzzleById } from "../puzzles/catalog";
import { Board } from "./components/Board";
import { Controls } from "./components/Controls";
import { Credit } from "./components/Credit";
import { Menu } from "./components/Menu";
import { FailOverlay, WinOverlay } from "./components/Overlays";
import { Stats } from "./components/Stats";
import { useApp } from "./hooks";
import { DESK, deskBackground, panelSurface } from "./theme";

const panelWrap: CSSProperties = { ...panelSurface, padding: 0, overflow: "hidden" };

export function GameUI() {
  const app = useApp();
  const layout = useHudLayout();
  const { commands } = useGame();

  if (app === undefined) return null;
  const puzzle = app.puzzleId !== null ? puzzleById(app.puzzleId) : undefined;
  const playing = app.view === "play" && puzzle !== undefined;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: DESK,
        backgroundImage: deskBackground,
      }}
      className="select-none"
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "76px 16px 100px",
        }}
      >
        {app.view === "menu" ? (
          <Menu commands={commands} completed={app.completed} mistakesMode={app.mistakesMode} />
        ) : puzzle !== undefined ? (
          <Board app={app} puzzle={puzzle} commands={commands} />
        ) : null}
      </div>

      <HudCanvas layout={layout} editChord={false} className="select-none">
        {playing && puzzle !== undefined && (
          <>
            <HudPanel id="settings" anchor="top-right" compact="keep">
              <SettingsTrigger className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-[14px] border border-[rgba(148,163,184,0.18)] bg-[rgba(15,20,28,0.82)] text-[#e6ecf3] shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md transition-colors hover:bg-[rgba(30,41,59,0.85)]" />
            </HudPanel>
            <HudPanel id="stats" anchor="top" compact="keep" interactive={false}>
              <div style={panelWrap}>
                <Stats app={app} puzzle={puzzle} />
              </div>
            </HudPanel>
            <HudPanel id="controls" anchor="bottom" compact="keep">
              <div style={panelWrap}>
                <Controls app={app} commands={commands} />
              </div>
            </HudPanel>
            <HudPanel id="credit" anchor="bottom-right" compact="chip" chip="Credit" interactive={false}>
              <Credit />
            </HudPanel>
          </>
        )}
      </HudCanvas>

      {app.status === "won" && puzzle !== undefined && (
        <WinOverlay app={app} puzzle={puzzle} commands={commands} />
      )}
      {app.status === "failed" && <FailOverlay app={app} commands={commands} />}
    </div>
  );
}
