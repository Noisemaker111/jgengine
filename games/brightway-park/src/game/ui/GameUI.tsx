import { type CSSProperties, useState } from "react";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/core/hud/hudLayout.view";
import { useGame, useGameClock, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { usePanels } from "@jgengine/core/ui/panels.view";
import { KitButton } from "@jgengine/core/ui/kit/uiKitRoot.view";

import { BuildBar } from "./components/BuildBar";
import { CameraPad } from "./components/CameraPad";
import { Inspector } from "./components/Inspector";
import { ParkBooks, ParkGoal, ParkStatus } from "./components/ParkDashboard";
import { ParkFlow, resultOpen } from "./components/ParkFlow";
import { ParkMenu } from "./menu/ParkMenu";
import { BUILD_PANEL, PARK_PANELS, RESEARCH_PANEL } from "./panels";
import { ResearchPanel } from "./components/ResearchPanel";
import { ParkHint } from "./components/ParkHint";
import { currentHint } from "../onboarding";
import { session } from "../session";
import { usePark } from "./usePark";

const MOTION_KEY = "brightway-park.reduced-motion";
function savedMotion(): boolean { try { return localStorage.getItem(MOTION_KEY) === "true"; } catch { return false; } }

export function GameUI() {
  const { commands } = useGame(); const clock = useGameClock();
  const started = useGameStore(() => session.started);
  const inspecting = useGameStore((ctx) => session.selectedObject !== null || ctx.scene.entity.selection.list().length > 0);
  // The world holds game over, the ribbon and the scenario result; re-read them when it changes.
  const w = usePark();
  const hinting = currentHint(w) !== null;
  const ctx = useGameContext();
  const [reducedMotion, setReducedMotion] = useState(savedMotion);
  const layout = useHudLayout({ storageKey: "brightway-park" });
  // While the pause board or a result screen is up it owns the keys, so the palette hotkeys stand down.
  const panels = usePanels(PARK_PANELS, { hotkeys: started && !clock.paused && !resultOpen(ctx) });
  const onReducedMotion = (next: boolean) => {
    setReducedMotion(next);
    try { localStorage.setItem(MOTION_KEY, String(next)); } catch { /* Preferences remain usable for this session. */ }
    commands.run("park.motion", { reduced: next });
  };
  return (
    <div className="bw-hud" style={reducedMotion ? ({ "--kit-motion": "0.01" } as CSSProperties) : undefined}>
      {started && <HudCanvas layout={layout} editChord={false}>
        <HudPanel id="status" anchor="top-left" priority="critical"><ParkStatus /></HudPanel>
        <HudPanel id="goal" anchor="top-left" order={1} chip="goal"><ParkGoal /></HudPanel>
        {hinting ? <HudPanel id="hint" anchor="top" priority="critical"><ParkHint /></HudPanel> : null}
        <HudPanel id="time" anchor="top-right" priority="critical">
          <nav className="bw-time" aria-label="Simulation controls">
            <KitButton size="sm" pressed={clock.paused} aria-label="Pause park" onClick={() => commands.run("pauseToggle", {})}>Ⅱ</KitButton>
            {clock.speeds.map((s) => <KitButton key={s} size="sm" pressed={!clock.paused && clock.speed === s} onClick={() => commands.run("park.speed", { speed: s })}>{s}×</KitButton>)}
            <KitButton size="sm" variant="ghost" data-hint="build" pressed={panels.isOpen("build")} icon="🏗" onClick={() => panels.toggle("build")}><span className="bw-wide">Build</span></KitButton>
            <KitButton size="sm" variant="ghost" pressed={panels.isOpen(RESEARCH_PANEL)} icon="🔬" onClick={() => panels.toggle(RESEARCH_PANEL)}><span className="bw-wide">Lab</span></KitButton>
            <KitButton size="sm" variant="ghost" pressed={panels.isOpen("books")} icon="📒" onClick={() => panels.toggle("books")}><span className="bw-wide">Books</span></KitButton>
          </nav>
        </HudPanel>
        {inspecting || panels.isOpen("books") || panels.isOpen(RESEARCH_PANEL) ? <HudPanel id="side" anchor="top-right" order={1} priority="critical">
          <div className="bw-side">{inspecting ? <Inspector /> : panels.isOpen("books") ? <ParkBooks onClose={() => panels.close("books")} /> : <ResearchPanel onClose={() => panels.close(RESEARCH_PANEL)} />}</div>
        </HudPanel> : null}
        {panels.isOpen(BUILD_PANEL) && <HudPanel id="build" anchor="bottom" priority="critical"><BuildBar onClose={() => panels.close(BUILD_PANEL)} onResearch={() => { panels.close("books"); panels.open(RESEARCH_PANEL); }} /></HudPanel>}
        {!clock.paused && <HudPanel id="camera" anchor="bottom-right" priority="critical"><CameraPad /></HudPanel>}
      </HudCanvas>}
      <ParkMenu reducedMotion={reducedMotion} onReducedMotion={onReducedMotion} />
      <ParkFlow />
    </div>
  );
}
