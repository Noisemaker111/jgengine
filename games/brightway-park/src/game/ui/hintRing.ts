import { useEffect } from "@jgengine/core/ui/jsx";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { useGameContext } from "@jgengine/ui/provider";

/**
 * The first scenario's ring: the hint names its controls in order (`currentHint(ctx).ui`), each
 * control registers its key while it is on screen, and the first one present is ringed. Buttons read
 * `hintRingOf(ctx).pointed` from a bound border, so pointing never re-renders the HUD.
 */
export const hintRingOf = perContext(() => ({ pointed: null as string | null, mounted: new Map<string, number>(), wanted: [] as readonly string[] }));

function recompute(ctx: GameContext): void {
  const ring = hintRingOf(ctx);
  ring.pointed = ring.wanted.find((key) => (ring.mounted.get(key) ?? 0) > 0) ?? null;
}

export function pointHint(ctx: GameContext, keys: readonly string[]): void {
  hintRingOf(ctx).wanted = keys;
  recompute(ctx);
}

export function useHintTarget(key: string | undefined): void {
  const ctx = useGameContext();
  useEffect(() => {
    if (key === undefined) return undefined;
    const { mounted } = hintRingOf(ctx);
    mounted.set(key, (mounted.get(key) ?? 0) + 1);
    recompute(ctx);
    return () => {
      mounted.set(key, (mounted.get(key) ?? 1) - 1);
      recompute(ctx);
    };
  }, [key]);
}
