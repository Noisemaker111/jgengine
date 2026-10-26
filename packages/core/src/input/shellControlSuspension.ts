import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { actionContextStack, playControlsActive } from "@jgengine/core/game/controlGate";
import type { PointerAxisState } from "@jgengine/core/input/pointerAxis";

type Ref<T> = { current: T };

/** Clears held input synchronously on play-gate transitions; ordinary context swaps retain it. @internal */
export function attachShellControlSuspension({
  ctx, tracker, pointerAxisRef, analogRef, primaryClickRef, cameraDraggingRef, f2HeldRef,
}: {
  ctx: GameContext;
  tracker: { reset(): void };
  pointerAxisRef: Ref<PointerAxisState | null>;
  analogRef: Ref<Readonly<Record<string, number>> | null>;
  primaryClickRef: Ref<boolean>;
  cameraDraggingRef: Ref<boolean>;
  f2HeldRef: Ref<boolean>;
}): () => void {
  const reset = () => {
    tracker.reset();
    pointerAxisRef.current = null;
    analogRef.current = null;
    primaryClickRef.current = false;
    cameraDraggingRef.current = false;
    f2HeldRef.current = false;
    ctx.input.publish([]);
    ctx.input.publishPointer(null);
    ctx.input.publishAnalog(null);
  };
  let active = playControlsActive(ctx);
  if (!active) reset();
  const changed = () => {
    const next = playControlsActive(ctx);
    if (next === active) return;
    active = next;
    reset();
  };
  const detachStack = actionContextStack(ctx).subscribe(changed);
  const detachContext = ctx.subscribe(changed);
  return () => { detachStack(); detachContext(); };
}
