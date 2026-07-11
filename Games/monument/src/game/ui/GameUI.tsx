import { useState } from "react";
import type { ReactNode } from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useGame, useGameClock, useGameStore } from "@jgengine/react/hooks";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";

import {
  activeCharter,
  activeEventId,
  activeLens,
  activeMood,
  activeToast,
  activeTool,
  briefStage,
  cityBuildings,
  cityDay,
  cityDecisions,
  cityPlazas,
  focusMode,
  futureDepth,
  helpOpen,
  historyDepth,
  libraryRevision,
  selectedBuilding,
  selectedPlaza,
  systemsPanelOpen,
  welcomeOpen,
} from "../city/state";
import { CITY_EVENTS, growthBriefs } from "../city/briefs";
import { resolveCityMetrics } from "../city/metrics";
import { keybinds } from "../keybinds";
import { BrandChip } from "./components/BrandChip";
import { Credit } from "./components/Credit";
import { EventModal } from "./components/EventModal";
import { FocusButton } from "./components/FocusButton";
import { FocusDock } from "./components/FocusDock";
import { HelpModal } from "./components/HelpModal";
import { HistoryControls } from "./components/HistoryControls";
import { Inspector } from "./components/Inspector";
import { Legend } from "./components/Legend";
import { LibraryModal } from "./components/LibraryModal";
import { MenuBar } from "./components/MenuBar";
import { MoodRow } from "./components/MoodRow";
import { ObjectivePanel } from "./components/ObjectivePanel";
import { StatsRibbon } from "./components/StatsRibbon";
import { SystemsPanel } from "./components/SystemsPanel";
import { TimeBar } from "./components/TimeBar";
import { Toast } from "./components/Toast";
import { ToolHint } from "./components/ToolHint";
import { ToolRail } from "./components/ToolRail";
import { ViewDock } from "./components/ViewDock";
import { WelcomeModal } from "./components/WelcomeModal";

const TOAST_WRAP =
  "pointer-events-none absolute inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom,0px)+var(--jg-hud-dock-clearance,0px))] flex justify-center px-4";

export function GameUI(): ReactNode {
  const { paused, playSpeed, speeds, calendar, controls } = useGameClock();
  const { commands } = useGame();
  const layout = useHudLayout({ storageKey: "monument" });
  const [libraryOpen, setLibraryOpen] = useState(false);

  const tool = useGameStore(activeTool);
  const building = useGameStore(selectedBuilding);
  const plaza = useGameStore(selectedPlaza);
  const toast = useGameStore(activeToast);
  const canUndo = useGameStore(historyDepth) > 0;
  const canRedo = useGameStore(futureDepth) > 0;
  const lens = useGameStore(activeLens);
  const mood = useGameStore(activeMood);
  const systemsOpen = useGameStore(systemsPanelOpen);
  const metrics = useGameStore((ctx) => resolveCityMetrics(cityBuildings(ctx), cityPlazas(ctx), activeCharter(ctx)));
  const stage = useGameStore(briefStage);
  const buildingsCount = useGameStore((ctx) => cityBuildings(ctx).length);
  const plazasCount = useGameStore((ctx) => cityPlazas(ctx).length);
  const decisions = useGameStore(cityDecisions);
  const eventId = useGameStore(activeEventId);
  const day = useGameStore((ctx) => cityDay(ctx) + 1);
  const focus = useGameStore(focusMode);
  const help = useGameStore(helpOpen);
  const welcome = useGameStore(welcomeOpen);
  const revision = useGameStore(libraryRevision);

  const run = (action: string, input: unknown = {}): void => {
    commands.run(action, input);
  };

  const hasSelection = building !== null || plaza !== null;
  const briefs = growthBriefs(metrics, buildingsCount, plazasCount);
  const activeEvent = eventId !== null ? (CITY_EVENTS.find((event) => event.id === eventId) ?? null) : null;

  const overlays = (
    <>
      <div className={TOAST_WRAP}>
        <Toast toast={toast} />
      </div>
      {activeEvent !== null && (
        <EventModal
          event={activeEvent}
          onChoose={(choice) => run("charter.resolve", { eventId: activeEvent.id, choice })}
        />
      )}
      {welcome && <WelcomeModal revision={revision} run={run} />}
    </>
  );

  if (focus) {
    return (
      <HudCanvas layout={layout} className="font-mono text-[#171916]">
        <HudPanel id="credit" anchor="bottom-left" compact="keep">
          <Credit />
        </HudPanel>
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] flex justify-center px-4">
          <FocusDock
            paused={paused}
            speed={playSpeed}
            speeds={speeds}
            day={day}
            hour={calendar.hour}
            minute={calendar.minute}
            run={run}
            onSetSpeed={(value) => controls.setSpeed(value)}
          />
        </div>
        {overlays}
      </HudCanvas>
    );
  }

  return (
    <HudCanvas layout={layout} className="font-mono text-[#171916]">
      <HudPanel id="brand" anchor="top-left" order={1} compact="keep">
        <BrandChip day={day} hour={calendar.hour} minute={calendar.minute} />
      </HudPanel>

      <HudPanel id="history" anchor="top-left" order={2} compact="keep">
        <HistoryControls
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={() => run("undo", {})}
          onRedo={() => run("redo", {})}
        />
      </HudPanel>

      <HudPanel id="menu" anchor="top-left" order={3} compact="keep">
        <MenuBar run={run} onLibrary={() => setLibraryOpen(true)} />
      </HudPanel>

      <HudPanel id="tools" anchor="top-left" order={4} compact="chip" chip="Tools">
        <ToolRail activeTool={tool} onSelect={(action) => run(action, {})} />
      </HudPanel>

      <HudPanel id="objective" anchor="top-left" order={5} compact="hide">
        <ObjectivePanel briefs={briefs} stage={stage} />
      </HudPanel>

      <HudPanel id="stats" anchor="top" compact="hide">
        <StatsRibbon
          metrics={metrics}
          systemsActive={systemsOpen}
          onToggleSystems={() => run("systems.toggle", {})}
        />
      </HudPanel>

      {hasSelection && (
        <HudPanel id="selection" anchor="top-right" compact="chip" chip="Selected">
          <Inspector building={building} plaza={plaza} />
        </HudPanel>
      )}

      {systemsOpen && (
        <HudPanel id="systems" anchor="top-right" compact="chip" chip="City life">
          <SystemsPanel metrics={metrics} decisions={decisions} onClose={() => run("systems.toggle", {})} />
        </HudPanel>
      )}

      <HudPanel id="timebar" anchor="bottom-left" order={0} compact="keep">
        <div className="flex flex-col items-start gap-1.5">
          <ToolHint tool={tool} />
          <TimeBar
          paused={paused}
          speed={playSpeed}
          speeds={speeds}
          day={day}
          hour={calendar.hour}
          minute={calendar.minute}
          pauseKey={actionLabel(keybinds, "pauseToggle") ?? ""}
          onPauseToggle={() => run("pauseToggle", {})}
          onSetSpeed={(value) => controls.setSpeed(value)}
          />
        </div>
      </HudPanel>

      <HudPanel id="focus" anchor="bottom-left" order={1} compact="keep">
        <FocusButton run={run} />
      </HudPanel>

      <HudPanel id="credit" anchor="bottom-left" order={2} compact="keep">
        <Credit />
      </HudPanel>

      <HudPanel id="viewdock" anchor="bottom" compact="chip" chip="Lens">
        <div className="flex flex-col items-center gap-2">
          <ViewDock lens={lens} onSelect={(next) => run("site.lens", { lens: next })} />
          <MoodRow mood={mood} run={run} />
        </div>
      </HudPanel>

      {lens !== "material" && (
        <HudPanel id="legend" anchor="bottom-right" compact="hide" interactive={false}>
          <Legend lens={lens} />
        </HudPanel>
      )}

      {overlays}

      {libraryOpen && <LibraryModal revision={revision} run={run} onClose={() => setLibraryOpen(false)} />}
      {help && <HelpModal run={run} onClose={() => run("helpToggle", {})} />}
    </HudCanvas>
  );
}
