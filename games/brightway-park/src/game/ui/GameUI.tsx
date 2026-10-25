import { type CSSProperties, useRef, useState } from "react";
import { useRegisterLayoutRegion } from "@jgengine/react/gameViewport";
import { useGame, useGameClock, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { usePanels } from "@jgengine/react/panels";
import { KitButton } from "@jgengine/react/uiKitRoot";

import { BuildBar } from "./components/BuildBar";
import { CameraPad } from "./components/CameraPad";
import { Inspector } from "./components/Inspector";
import { ParkBooks, ParkGoal, ParkStatus } from "./components/ParkDashboard";
import { ParkFlow, resultOpen } from "./components/ParkFlow";
import { ParkMenu } from "./menu/ParkMenu";
import { BUILD_PANEL, PARK_PANELS, RESEARCH_PANEL } from "./panels";
import { ResearchPanel } from "./components/ResearchPanel";
import { session } from "../session";
import { usePark } from "./usePark";

const MOTION_KEY = "brightway-park.reduced-motion";
function savedMotion(): boolean { try { return localStorage.getItem(MOTION_KEY) === "true"; } catch { return false; } }

export function GameUI() {
  const { commands } = useGame(); const clock = useGameClock();
  const started = useGameStore(() => session.started);
  const inspecting = useGameStore((ctx) => session.selectedObject !== null || ctx.scene.entity.selection.list().length > 0);
  // The world holds game over, the ribbon and the scenario result; re-read them when it changes.
  usePark();
  const ctx = useGameContext();
  const [reducedMotion, setReducedMotion] = useState(savedMotion);
  // Toasts step clear of the status column: on phones it spans the top, so they land below it, under the pause rows too.
  const left = useRef<HTMLDivElement>(null);
  useRegisterLayoutRegion({ id: "brightway.status", kind: "hud", collisionPolicy: "allow" }, left, started);
  // While the pause board or a result screen is up it owns the keys, so the palette hotkeys stand down.
  const panels = usePanels(PARK_PANELS, { hotkeys: started && !clock.paused && !resultOpen(ctx) });
  const onReducedMotion = (next: boolean) => {
    setReducedMotion(next);
    try { localStorage.setItem(MOTION_KEY, String(next)); } catch { /* Preferences remain usable for this session. */ }
    commands.run("park.motion", { reduced: next });
  };
  return (
    <div className="bw-hud" style={reducedMotion ? ({ "--kit-motion": "0.01" } as CSSProperties) : undefined}>
      {started && <>
        <div className="bw-left" ref={left}><ParkStatus /><ParkGoal /></div>
        <nav className="bw-time" aria-label="Simulation controls">
          <KitButton size="sm" pressed={clock.paused} aria-label="Pause park" onClick={() => commands.run("pauseToggle", {})}>Ⅱ</KitButton>
          {clock.speeds.map((s) => <KitButton key={s} size="sm" pressed={!clock.paused && clock.speed === s} onClick={() => commands.run("park.speed", { speed: s })}>{s}×</KitButton>)}
          <KitButton size="sm" variant="ghost" pressed={panels.isOpen("build")} icon="🏗" onClick={() => panels.toggle("build")}><span className="bw-wide">Build</span></KitButton>
          <KitButton size="sm" variant="ghost" pressed={panels.isOpen(RESEARCH_PANEL)} icon="🔬" onClick={() => panels.toggle(RESEARCH_PANEL)}><span className="bw-wide">Lab</span></KitButton>
          <KitButton size="sm" variant="ghost" pressed={panels.isOpen("books")} icon="📒" onClick={() => panels.toggle("books")}><span className="bw-wide">Books</span></KitButton>
        </nav>
        <div className="bw-side">{inspecting ? <Inspector /> : panels.isOpen("books") ? <ParkBooks onClose={() => panels.close("books")} /> : panels.isOpen(RESEARCH_PANEL) ? <ResearchPanel onClose={() => panels.close(RESEARCH_PANEL)} /> : null}</div>
        <div className="bw-bottom">{!clock.paused && <CameraPad />}{panels.isOpen(BUILD_PANEL) && <BuildBar onClose={() => panels.close(BUILD_PANEL)} onResearch={() => { panels.close("books"); panels.open(RESEARCH_PANEL); }} />}</div>
      </>}
      <ParkMenu reducedMotion={reducedMotion} onReducedMotion={onReducedMotion} />
      <ParkFlow />
    </div>
  );
}
