import type { ReactNode } from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useGame, useGameClock, useGameStore } from "@jgengine/react/hooks";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";

import { activeToast, activeTool, selectedBuilding, selectedPlaza } from "../city/state";
import { keybinds } from "../keybinds";
import { BrandChip } from "./components/BrandChip";
import { Credit } from "./components/Credit";
import { SelectedCard } from "./components/SelectedCard";
import { TimeBar } from "./components/TimeBar";
import { Toast } from "./components/Toast";
import { ToolHint } from "./components/ToolHint";
import { ToolRail } from "./components/ToolRail";

export function GameUI(): ReactNode {
  const { paused, playSpeed, speeds, calendar, controls } = useGameClock();
  const { commands } = useGame();
  const layout = useHudLayout({ storageKey: "monument" });

  const tool = useGameStore(activeTool);
  const building = useGameStore(selectedBuilding);
  const plaza = useGameStore(selectedPlaza);
  const toast = useGameStore(activeToast);

  const day = calendar.day + 1;
  const pauseKey = actionLabel(keybinds, "pauseToggle") ?? "";
  const hasSelection = building !== null || plaza !== null;

  return (
    <HudCanvas layout={layout} className="font-mono text-[#171916]">
      <HudPanel id="brand" anchor="top-left" order={1} compact="keep">
        <BrandChip day={day} hour={calendar.hour} minute={calendar.minute} />
      </HudPanel>

      <HudPanel id="tools" anchor="top-left" order={2} compact="chip" chip="Tools">
        <ToolRail activeTool={tool} onSelect={(action) => commands.run(action, {})} />
      </HudPanel>

      {hasSelection && (
        <HudPanel id="selection" anchor="top-right" compact="chip" chip="Selected">
          <SelectedCard
            building={building}
            plaza={plaza}
            onRemove={(id) => commands.run("site.demolish", { id })}
          />
        </HudPanel>
      )}

      <HudPanel id="hint" anchor="bottom-left" order={2} compact="hide" interactive={false}>
        <ToolHint tool={tool} />
      </HudPanel>

      <HudPanel id="timebar" anchor="bottom-left" order={1} compact="keep">
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

      <HudPanel id="credit" anchor="bottom-left" order={0} compact="keep">
        <Credit />
      </HudPanel>

      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom,0px)+var(--jg-hud-dock-clearance,0px))] flex justify-center px-4">
        <Toast toast={toast} />
      </div>
    </HudCanvas>
  );
}
