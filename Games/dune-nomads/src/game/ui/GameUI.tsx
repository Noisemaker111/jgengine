import { SettingsTrigger } from "@jgengine/react";
import { useActivePrompt, useGame, useGameStore } from "@jgengine/react/hooks";
import { KeybindBadge } from "@/components/ui/keybind-badge";

import { WIND_SHIFT_SECONDS, windStateAt } from "../wind/schedule";
import { WIND_SCHEDULE } from "../run/deps";
import type { RunState } from "../run/runState";
import { PROVERBS } from "../proverbs";
import { OASIS_PROMPTS } from "../world/prompts";
import { CaravanStrip } from "./components/CaravanStrip";
import { DockPanel } from "./components/DockPanel";
import { EndOverlay } from "./components/EndOverlay";
import { MapPanel } from "./components/MapPanel";
import { PaceGlyph } from "./components/PaceGlyph";
import { ProverbsTicker } from "./components/ProverbsTicker";
import { StartOverlay } from "./components/StartOverlay";
import { WaterGauge } from "./components/WaterGauge";
import { duneVars } from "./theme";
import { CITY, oasisNameById } from "../world/sites";

function distanceToCity(state: RunState): number {
  return Math.hypot(state.player.x - CITY.x, state.player.z - CITY.z);
}

function proverbFor(state: RunState): string {
  if (state.dockChoice !== null) return PROVERBS.dockOpen!;
  if (state.dock !== null) return state.dock.kind === "full" ? PROVERBS.dockFull! : PROVERBS.dockQuick!;
  if (state.water < 20) return PROVERBS.waterCritical!;
  if (state.water < 40) return PROVERBS.waterLow!;
  if (state.stragglers.some(Boolean)) return PROVERBS.straggler!;
  if (state.paceMultiplier > 1.5) return PROVERBS.crest!;
  if (state.paceMultiplier < 0.7) return PROVERBS.headwind!;
  return PROVERBS.start!;
}

function PlayingHud({ state }: { state: RunState }) {
  const { commands } = useGame();
  const wind = windStateAt(WIND_SCHEDULE, WIND_SHIFT_SECONDS, state.elapsed);
  const distance = distanceToCity(state);
  const activePrompt = useActivePrompt(OASIS_PROMPTS);
  const showDockPrompt = activePrompt !== null && state.dockChoice === null && state.dock === null;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
      <div className="relative flex items-start justify-end gap-4">
        <div className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-1">
          <WaterGauge water={state.water} />
          <span className="font-mono text-[11px]" style={{ color: "var(--jg-text-dim)" }}>
            {Math.round(distance)}m to Meridaan
          </span>
        </div>
        <div className="pointer-events-auto">
          <MapPanel
            state={state}
            windVector={wind.vector}
            windSpeed={wind.speed}
            windSecondsUntilNext={wind.secondsUntilNext}
            onPin={(point) => commands.run("map.pin", point)}
            onUnpin={(index) => commands.run("map.unpin", { index })}
            onToggle={() => commands.run("toggleMap", undefined)}
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        {showDockPrompt && (
          <div
            className="pointer-events-none flex items-center gap-2 px-3 py-1.5"
            style={{ background: "rgba(22,15,9,0.85)", border: "1px solid var(--jg-edge)" }}
          >
            <KeybindBadge label="E" />
            <span className="text-[12px]" style={{ color: "var(--jg-text)" }}>
              Dock at {oasisNameById(activePrompt!.id)}
            </span>
          </div>
        )}
        {(state.dockChoice !== null || state.dock !== null) && (
          <div className="pointer-events-auto">
            <DockPanel
              choice={state.dockChoice}
              dock={state.dock}
              onCommit={(kind) => commands.run("dock.commit", { kind })}
              onCancel={() => commands.run("dock.cancel", undefined)}
            />
          </div>
        )}
        <div className="pointer-events-none">
          <ProverbsTicker text={proverbFor(state)} />
        </div>
        <div className="flex items-center gap-8">
          <PaceGlyph multiplier={state.paceMultiplier} resting={state.dock !== null} />
          <CaravanStrip stragglers={state.stragglers} />
        </div>
      </div>
    </div>
  );
}

function HudLayer() {
  const state = useGameStore((ctx) => ctx.game.store.get("run") as RunState);
  const { commands } = useGame();

  if (state.phase === "start") {
    return (
      <div className="pointer-events-none absolute inset-0">
        <StartOverlay onStart={() => commands.run("start", undefined)} />
      </div>
    );
  }

  if (state.phase === "won" || state.phase === "stranded") {
    return (
      <div className="pointer-events-none absolute inset-0">
        <EndOverlay state={state} onRestart={() => commands.run("restart", undefined)} />
      </div>
    );
  }

  return <PlayingHud state={state} />;
}

export function GameUI() {
  return (
    <div style={{ ...duneVars, display: "contents" }}>
      <HudLayer />
    </div>
  );
}
