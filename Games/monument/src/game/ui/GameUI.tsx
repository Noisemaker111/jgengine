import type { ReactNode } from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useGame, useGameClock, useGameStore } from "@jgengine/react/hooks";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";

import {
  activeCharter,
  activeEventId,
  activeLens,
  activeToast,
  activeTool,
  briefStage,
  cityBuildings,
  cityDecisions,
  cityPlazas,
  futureDepth,
  historyDepth,
  selectedBuilding,
  selectedPlaza,
  systemsPanelOpen,
} from "../city/state";
import { CITY_EVENTS, growthBriefs } from "../city/briefs";
import { resolveCityMetrics } from "../city/metrics";
import { keybinds } from "../keybinds";
import { BrandChip } from "./components/BrandChip";
import { Credit } from "./components/Credit";
import { EventModal } from "./components/EventModal";
import { HistoryControls } from "./components/HistoryControls";
import { Inspector } from "./components/Inspector";
import { Legend } from "./components/Legend";
import { ObjectivePanel } from "./components/ObjectivePanel";
import { StatsRibbon } from "./components/StatsRibbon";
import { SystemsPanel } from "./components/SystemsPanel";
import { TimeBar } from "./components/TimeBar";
import { Toast } from "./components/Toast";
import { ToolHint } from "./components/ToolHint";
import { ToolRail } from "./components/ToolRail";
import { ViewDock } from "./components/ViewDock";

export function GameUI(): ReactNode {
  const { paused, playSpeed, speeds, calendar, controls } = useGameClock();
  const { commands } = useGame();
  const layout = useHudLayout({ storageKey: "monument" });

  const tool = useGameStore(activeTool);
  const building = useGameStore(selectedBuilding);
  const plaza = useGameStore(selectedPlaza);
  const toast = useGameStore(activeToast);
  const canUndo = useGameStore(historyDepth) > 0;
  const canRedo = useGameStore(futureDepth) > 0;
  const lens = useGameStore(activeLens);
  const systemsOpen = useGameStore(systemsPanelOpen);
  const metrics = useGameStore((ctx) => resolveCityMetrics(cityBuildings(ctx), cityPlazas(ctx), activeCharter(ctx)));
  const stage = useGameStore(briefStage);
  const buildingsCount = useGameStore((ctx) => cityBuildings(ctx).length);
  const plazasCount = useGameStore((ctx) => cityPlazas(ctx).length);
  const decisions = useGameStore(cityDecisions);
  const eventId = useGameStore(activeEventId);

  const day = calendar.day + 1;
  const pauseKey = actionLabel(keybinds, "pauseToggle") ?? "";
  const hasSelection = building !== null || plaza !== null;
  const briefs = growthBriefs(metrics, buildingsCount, plazasCount);
  const activeEvent = eventId !== null ? (CITY_EVENTS.find((event) => event.id === eventId) ?? null) : null;

  return (
    <HudCanvas layout={layout} className="font-mono text-[#171916]">
      <HudPanel id="brand" anchor="top-left" order={1} compact="keep">
        <BrandChip day={day} hour={calendar.hour} minute={calendar.minute} />
      </HudPanel>

      <HudPanel id="history" anchor="top-left" order={2} compact="keep">
        <HistoryControls
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={() => commands.run("undo", {})}
          onRedo={() => commands.run("redo", {})}
        />
      </HudPanel>

      <HudPanel id="tools" anchor="top-left" order={3} compact="chip" chip="Tools">
        <ToolRail activeTool={tool} onSelect={(action) => commands.run(action, {})} />
      </HudPanel>

      <HudPanel id="objective" anchor="top-left" order={4} compact="hide">
        <ObjectivePanel briefs={briefs} stage={stage} />
      </HudPanel>

      <HudPanel id="stats" anchor="top" compact="hide">
        <StatsRibbon
          metrics={metrics}
          systemsActive={systemsOpen}
          onToggleSystems={() => commands.run("systems.toggle", {})}
        />
      </HudPanel>

      {hasSelection && (
        <HudPanel id="selection" anchor="top-right" compact="chip" chip="Selected">
          <Inspector building={building} plaza={plaza} />
        </HudPanel>
      )}

      {systemsOpen && (
        <HudPanel id="systems" anchor="top-right" compact="chip" chip="City life">
          <SystemsPanel metrics={metrics} decisions={decisions} onClose={() => commands.run("systems.toggle", {})} />
        </HudPanel>
      )}

      <HudPanel id="hint" anchor="bottom-left" order={2} compact="hide" interactive={false}>
        <ToolHint tool={tool} />
      </HudPanel>

      <HudPanel id="timebar" anchor="bottom-left" order={0} compact="keep">
        <TimeBar
          paused={paused}
          speed={playSpeed}
          speeds={speeds}
          day={day}
          hour={calendar.hour}
          minute={calendar.minute}
          pauseKey={pauseKey}
          onPauseToggle={() => commands.run("pauseToggle", {})}
          onSetSpeed={(value) => controls.setSpeed(value)}
        />
      </HudPanel>

      <HudPanel id="credit" anchor="bottom-left" order={1} compact="keep">
        <Credit />
      </HudPanel>

      <HudPanel id="viewdock" anchor="bottom" compact="chip" chip="Lens">
        <ViewDock lens={lens} onSelect={(next) => commands.run("site.lens", { lens: next })} />
      </HudPanel>

      {lens !== "material" && (
        <HudPanel id="legend" anchor="bottom-right" compact="hide" interactive={false}>
          <Legend lens={lens} />
        </HudPanel>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom,0px)+var(--jg-hud-dock-clearance,0px))] flex justify-center px-4">
        <Toast toast={toast} />
      </div>

      {activeEvent !== null && (
        <EventModal
          event={activeEvent}
          onChoose={(choice) => commands.run("charter.resolve", { eventId: activeEvent.id, choice })}
        />
      )}
    </HudCanvas>
  );
}
