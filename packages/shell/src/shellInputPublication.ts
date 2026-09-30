import type { ActionStateTracker } from "@jgengine/core/input/actionBindings";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { InputFrame } from "@jgengine/core/runtime/hostedGameRunner";
import type { InputSink } from "./inputSink";
import { heldActionsFor } from "./boundActionDispatch";

type Change = "discrete" | "reset" | "analog";
let lastPressSeq = 0;
/** Observes the actual shell tracker without moving command edges or changing binding behavior. @internal */
export function observableShellTracker(tracker: ActionStateTracker<string>) {
  const listeners = new Set<(change: Change, presses: NonNullable<InputFrame["presses"]>) => void>();
  const notify = (change: Change, presses: NonNullable<InputFrame["presses"]> = []) => { for (const listener of listeners) listener(change, presses); };
  return {
    ...tracker,
    handleDown(code: string) {
      const result = tracker.handleDown(code);
      if (result !== null) {
        const now = typeof performance !== "undefined" ? performance.timeOrigin + performance.now() : Date.now();
        lastPressSeq = Math.max(now, lastPressSeq + 0.001);
        notify("discrete", [{ action: result, seq: lastPressSeq }]);
      }
      return result;
    },
    handleUp(code: string) { const result = tracker.handleUp(code); notify("discrete"); return result; },
    reset() { tracker.reset(); notify("reset"); },
    notify,
    subscribe(listener: (change: Change, presses: NonNullable<InputFrame["presses"]>) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
const owners = new WeakMap<GameContext, object>();
/** Publishes discrete input above Canvas, so release and failure leases survive stalled or unmounted rendering. @internal */
export function attachShellInputPublication({ ctx, tracker, active, analog, pointer, sink }: {
  ctx: GameContext;
  tracker: ReturnType<typeof observableShellTracker>;
  active: () => boolean;
  analog: () => InputFrame["analog"];
  pointer: () => InputFrame["pointer"];
  sink: () => InputSink;
}): () => void {
  const owner = {};
  owners.set(ctx, owner);
  const publish = (change: Change, presses: NonNullable<InputFrame["presses"]> = []) => {
    if (owners.get(ctx) !== owner) return;
    const enabled = active() && change !== "reset";
    const axes = enabled ? analog() : null;
    ctx.input.publish(enabled ? heldActionsFor(tracker, tracker.actions()) : [], enabled ? { pressed: presses.map(press => press.action) } : { reset: true });
    ctx.input.publishPointer(enabled ? pointer() : null);
    ctx.input.publishAnalog(axes ?? null);
    const urgent = change !== "analog" || axes == null || Object.values(axes).every(value => value === 0);
    sink().send({ held: ctx.input.held(), pointer: ctx.input.pointer(), analog: ctx.input.analog(), tick: ctx.sim.tick(), ...(enabled && presses.length > 0 ? { presses } : {}) }, { urgent, ...(!enabled ? { reset: true } : {}) });
  };
  const detach = tracker.subscribe(publish);
  return () => {
    detach();
    if (owners.get(ctx) !== owner) return;
    publish("reset");
    owners.delete(ctx);
  };
}
