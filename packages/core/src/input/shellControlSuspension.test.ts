import { describe, expect, test } from "bun:test";
import { createActionStateTracker, toActionStateBindingMap } from "@jgengine/core/input/actionBindings";
import { actionContextStack, playControlsActive, suspendPlayControls } from "@jgengine/core/game/controlGate";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { normalizePointerToAxis, type PointerAxisState } from "@jgengine/core/input/pointerAxis";
import { attachShellControlSuspension } from "./shellControlSuspension";

function fixture() {
  const definition = defineGameDefinition({ name: "suspension", assets: createAssetCatalog(), input: { move: ["KeyW"] } });
  const ctx = createGameContext({ definition, content: {}, player: { userId: "courier", isNew: true } });
  const tracker = createActionStateTracker<string>(toActionStateBindingMap(definition.input!));
  const pointerAxisRef = { current: null as PointerAxisState | null };
  const analogRef = { current: null as Readonly<Record<string, number>> | null };
  const primaryClickRef = { current: false };
  const cameraDraggingRef = { current: false };
  const f2HeldRef = { current: false };
  const options = { ctx, tracker, pointerAxisRef, analogRef, primaryClickRef, cameraDraggingRef, f2HeldRef };
  const hold = () => {
    tracker.handleDown("KeyW");
    pointerAxisRef.current = normalizePointerToAxis(25, 75, { left: 0, top: 0, width: 100, height: 100 });
    analogRef.current = { move: 0.8 };
    primaryClickRef.current = cameraDraggingRef.current = f2HeldRef.current = true;
    ctx.input.publish(["move"]);
    ctx.input.publishPointer(pointerAxisRef.current);
    ctx.input.publishAnalog(analogRef.current);
  };
  return { ...options, hold, attach: () => attachShellControlSuspension(options) };
}

describe("shell control suspension", () => {
  test("clears real tracker and published input before the next action, including final release", () => {
    const state = fixture();
    const detach = state.attach();
    state.hold();
    const release = suspendPlayControls(state.ctx);
    expect(state.tracker.isDown("move")).toBe(false);
    expect(state.tracker.wasPressed("move")).toBe(false);
    expect(state.ctx.input.held()).toEqual([]);
    expect(state.ctx.input.pointer()).toBeNull();
    expect(state.ctx.input.analog()).toBeNull();
    expect(state.pointerAxisRef.current).toBeNull();
    expect(state.analogRef.current).toBeNull();
    expect([state.primaryClickRef.current, state.cameraDraggingRef.current, state.f2HeldRef.current]).toEqual([false, false, false]);
    state.hold();
    release();
    expect(playControlsActive(state.ctx)).toBe(true);
    expect(state.tracker.isDown("move")).toBe(false);
    expect(state.ctx.input.held()).toEqual([]);
    state.tracker.handleDown("KeyW");
    expect(state.tracker.isDown("move")).toBe(true);
    expect(state.tracker.wasPressed("move")).toBe(true);
    detach();
  });

  test("ordinary binding swaps retain held keys and detached old contexts cannot clear a replacement", () => {
    const previous = fixture();
    const detach = previous.attach();
    previous.hold();
    actionContextStack(previous.ctx).push({ id: "driving", codes: { steer: ["KeyW"] }, passthrough: false });
    previous.tracker.rebind(toActionStateBindingMap({ steer: ["KeyW"] }));
    expect(previous.tracker.isDown("steer")).toBe(true);
    detach();
    const replacement = fixture();
    const detachReplacement = replacement.attach();
    replacement.hold();
    const releaseOld = suspendPlayControls(previous.ctx);
    releaseOld();
    expect(replacement.tracker.isDown("move")).toBe(true);
    expect(replacement.ctx.input.held()).toEqual(["move"]);
    detachReplacement();
  });
});
