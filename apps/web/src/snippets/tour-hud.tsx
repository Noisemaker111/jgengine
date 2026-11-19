/** @jsxImportSource @jgengine/core/ui/jsx */
import { bind, type RuneTheme } from "@jgengine/core/ui/rune/primitives";
import { RuneLabel, RuneRoot, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useGameStore } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";

import { run } from "./tour-loop";
import { rankOf } from "./tour-rules";

const theme = {
  colors: { panel: "#10202ae6", track: "#ffffff22", energy: "#4fd1c5" },
  text: { body: { size: 14, color: "#e6f4f1" }, title: { size: 18, weight: 700, color: "#ffffff" } },
  variants: { panel: { padding: 16, gap: 8, fill: "#10202ae6", radius: 10 } },
  motion: { duration: 160, distance: 8, bounce: 0 },
} satisfies RuneTheme;

// JSX, but not React: the engine's own runtime, drawn on the game canvas by Rune (Rust compiled to
// wasm). The rank re-renders only when it changes; the energy bar is bound, so it moves with no render.
export function GameUI() {
  const ctx = useGameContext();
  const rank = useGameStore((game) => rankOf(run.read(game)));
  const energy = () => run.read(ctx).energy.pool.current / 100;
  return (
    <RuneRoot context={ctx} theme={theme}>
      <RuneView anchor="top-left" safe inset={16} variant="panel" width={220}>
        <RuneLabel textStyle="title" value="Tide Runner" />
        <RuneLabel value={rank} />
        <RuneView height={6} radius={3} fill={theme.colors.track}>
          <RuneView height={6} radius={3} fill={theme.colors.energy} width={bind(() => ({ fraction: Math.max(0, Math.min(1, energy())) }))} />
        </RuneView>
      </RuneView>
    </RuneRoot>
  );
}
