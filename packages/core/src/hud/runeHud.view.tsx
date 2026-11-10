/** @jsxImportSource @jgengine/core/ui/jsx */
import { useMemo } from "../ui/jsx";
import { live } from "../ui/liveValue";
import type { RuneElementProps } from "../ui/rune/element";
import { RuneBox } from "../ui/rune/elements.view";
import { createHudAwakeClock } from "./hudAwakeClock";

/** Native HUD opacity bound to its watched readings, without component renders. */
export function RuneHudFade({ watch, hold, idleMs, dimTo, ...props }: RuneElementProps & { watch: () => unknown; hold?: () => boolean; idleMs: number; dimTo: number }) {
  const clock = useMemo(() => createHudAwakeClock(idleMs), [idleMs]);
  return <RuneBox {...props} opacity={live(() => clock.awake(watch(), hold?.() === true) ? 1 : dimTo)} />;
}
