import { useEffect } from "@jgengine/core/ui/jsx";

/**
 * The first scenario's ring: the hint names its controls in order (`currentHint(ctx).ui`), each
 * control registers its key while it is on screen, and the first one present is ringed. Buttons read
 * `hintRing.pointed` from a bound border, so pointing never re-renders the HUD.
 */
export const hintRing: { pointed: string | null } = { pointed: null };
const mounted = new Map<string, number>();
let wanted: readonly string[] = [];

function recompute(): void {
  hintRing.pointed = wanted.find((key) => (mounted.get(key) ?? 0) > 0) ?? null;
}

/** The hint's controls, in the order the ring prefers them. */
export function pointHint(keys: readonly string[]): void {
  wanted = keys;
  recompute();
}

/** Register a control under its hint key while it is mounted. */
export function useHintTarget(key: string | undefined): void {
  useEffect(() => {
    if (key === undefined) return undefined;
    mounted.set(key, (mounted.get(key) ?? 0) + 1);
    recompute();
    return () => {
      mounted.set(key, (mounted.get(key) ?? 1) - 1);
      recompute();
    };
  }, [key]);
}
