/** @jsxImportSource @jgengine/core/ui/jsx */
import { KitVitals } from "@jgengine/core/hud/kitHud.view";
import { HudSlots } from "@jgengine/shell/gameKit";
import { useGameStore } from "@jgengine/ui/hooks";

import { run } from "./tour-loop";
import { rankOf } from "./tour-rules";

// JSX, but not React: the engine's own runtime, drawn on the game canvas by
// Rune (Rust compiled to wasm). A selector re-renders only when its value changes.
export function GameUI() {
  const energy = useGameStore((ctx) => Math.round(run.read(ctx).energy.pool.current));
  const rank = useGameStore((ctx) => rankOf(run.read(ctx)));
  const vitals = [{ label: "Energy", value: energy, max: 100 }];
  return (
    <HudSlots
      storageKey="tide-runner"
      slots={{ topLeft: <KitVitals eyebrow={rank} title="Tide Runner" vitals={vitals} /> }}
    />
  );
}
