import type { ActionStateTracker } from "@jgengine/core/input/actionBindings";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { InputFrame } from "@jgengine/core/runtime/hostedGameRunner";
import type { InputSink } from "./inputSink";
import { heldActionsFor } from "./boundActionDispatch";

type Change = "discrete" | "reset" | "analog";
/** Observes the actual shell tracker without moving command edges or changing binding behavior. @internal */
export function observableShellTracker(tracker: ActionStateTracker<string>) {
  const listeners = new Set<(change: Change) => void>();
  const notify = (change: Change) => { for (const listener of listeners) listener(change); };
  return {
    ...tracker,
    handleDown(code: string) { const result = tracker.handleDown(code); notify("discrete"); return result; },
    handleUp(code: string) { const result = tracker.handleUp(code); notify("discrete"); return result; },
    reset() { tracker.reset(); notify("reset"); },
    notify,
    subscribe(listener: (change: Change) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
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
  const publish = (change: Change) => {
    if (owners.get(ctx) !== owner) return;
    const enabled = active() && change !== "reset";
    const axes = enabled ? analog() : null;
    ctx.input.publish(enabled ? heldActionsFor(tracker, tracker.actions()) : []);
    ctx.input.publishPointer(enabled ? pointer() : null);
    ctx.input.publishAnalog(axes ?? null);
    const urgent = change !== "analog" || axes == null || Object.values(axes).every(value => value === 0);
    sink().send({ held: ctx.input.held(), pointer: ctx.input.pointer(), analog: ctx.input.analog(), tick: ctx.sim.tick() }, { urgent });
  };
  const detach = tracker.subscribe(publish);
  return () => {
    detach();
    if (owners.get(ctx) !== owner) return;
    publish("reset");
    owners.delete(ctx);
  };
}
