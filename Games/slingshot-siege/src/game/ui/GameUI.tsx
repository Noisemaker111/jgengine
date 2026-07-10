import { AmmoCounter } from "@/components/ui/ammo-counter";
import { ResultsScreen, type ResultLine } from "@/components/ui/results-screen";
import { ScoreReadout } from "@/components/ui/score-readout";
import { WaveIndicator } from "@/components/ui/wave-indicator";
import { useDisplayProfile } from "@jgengine/react/display";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react";
import { LEVELS } from "../levels/catalog";
import { useSlingshotState, useSlingshotStore } from "../state/slingshotStore";
import { siegeVars } from "./theme";

function starGlyphs(stars: 0 | 1 | 2 | 3): string {
  return "★".repeat(stars) + "☆".repeat(3 - stars);
}

function ResultsOverlay() {
  const state = useSlingshotState();
  const store = useSlingshotStore();
  if (state.outcome === "playing") return null;
  const isFinalWin = state.outcome === "won";
  const outcome = state.outcome === "failed" ? "defeat" : "victory";
  const title = isFinalWin ? "Siege Complete" : state.outcome === "failed" ? "Out of Shots" : "Level Cleared";
  const lines: ResultLine[] = isFinalWin
    ? [{ label: "Final Score", value: state.totalScore, accent: true }]
    : [
        { label: "Targets Destroyed", value: `${state.targetsDestroyed} / ${state.targetsTotal}` },
        { label: "Level Score", value: state.levelScore, accent: state.outcome === "cleared" },
        { label: "Stars", value: starGlyphs(state.stars) },
        { label: "Total Score", value: state.totalScore },
      ];
  const actionLabel = state.outcome === "cleared" ? "Next Siege" : isFinalWin ? "Play Again" : "Retry Siege";
  return (
    <ResultsScreen
      outcome={outcome}
      title={title}
      lines={lines}
      entries={[{ id: "advance", label: actionLabel }]}
      onActivate={() => {
        if (isFinalWin) store.loadLevel(0, 0);
        else if (state.outcome === "cleared") store.nextLevel();
        else store.retryLevel();
      }}
    />
  );
}

function Hud() {
  const state = useSlingshotState();
  const { coarsePointer } = useDisplayProfile();
  const hint = coarsePointer ? "Drag back from the pouch, release to fling." : "Drag back from the sling pouch to aim, release to fire.";
  const layout = useHudLayout({ storageKey: "slingshot-siege" });
  return (
    <HudCanvas layout={layout} className="select-none">
      <HudPanel id="level-info" anchor="top-left" inset={{ x: 24, y: 24 }} className="flex flex-col gap-1">
        <span className="font-serif text-xs uppercase tracking-[0.3em] text-[#ab977a]">
          Siege {state.levelIndex + 1} / {LEVELS.length}
        </span>
        <span className="text-2xl font-bold text-[#f3e6cf]" style={{ textShadow: "0 2px 6px rgba(0,0,0,0.9)" }}>
          {state.levelName}
        </span>
      </HudPanel>
      <HudPanel id="score" anchor="top-right" inset={{ x: 24, y: 24 }}>
        <ScoreReadout value={state.totalScore} label="Score" size="lg" />
      </HudPanel>
      <HudPanel id="wave-indicator" anchor="top" inset={{ x: 0, y: 24 }}>
        <WaveIndicator wave={state.levelIndex + 1} totalWaves={LEVELS.length} remaining={state.targetsTotal - state.targetsDestroyed} remainingLabel="dummies" />
      </HudPanel>
      <HudPanel id="ammo" anchor="bottom-right" inset={{ x: 24, y: 24 }}>
        <AmmoCounter magazine={state.shotsLeft} lowAt={1} />
      </HudPanel>
      <HudPanel id="hint" anchor="bottom-left" inset={{ x: 24, y: 24 }} className="max-w-xs text-[11px] leading-4 text-[#ab977a]">
        {hint}
      </HudPanel>
      <ResultsOverlay />
    </HudCanvas>
  );
}

export function GameUI() {
  return (
    <div style={{ ...siegeVars, display: "contents" }}>
      <Hud />
    </div>
  );
}
