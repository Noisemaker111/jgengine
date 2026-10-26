import { expect, test } from "bun:test";
import { createActionStateTracker, toActionStateBindingMap } from "@jgengine/core/input/actionBindings";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { suspendPlayControls, playControlsActive } from "@jgengine/core/game/controlGate";
import type { InputFrame } from "@jgengine/core/runtime/hostedGameRunner";
import { observableShellTracker, attachShellInputPublication } from "./shellInputPublication";
import { attachShellControlSuspension } from "./shellControlSuspension";
import { shellPointerInput } from "./shellPointerInput";

function fixture() {
  const definition = defineGameDefinition({ name: "discrete-input", assets: createAssetCatalog(), input: { moveForward: ["KeyW"], fire: ["mouse0"] } });
  const ctx = createGameContext({ definition, content: {}, player: { userId: "courier", isNew: true } });
  const tracker = observableShellTracker(createActionStateTracker<string>(toActionStateBindingMap(definition.input!)));
  const frames: Array<{ frame: InputFrame; urgent: boolean }> = [];
  const pointerAxisRef = { current: null };
  const analogRef = { current: null as Readonly<Record<string, number>> | null };
  const flag = () => ({ current: false });
  const detachSuspension = attachShellControlSuspension({ ctx, tracker, pointerAxisRef, analogRef, primaryClickRef: flag(), cameraDraggingRef: flag(), f2HeldRef: flag() });
  const attach = () => attachShellInputPublication({ ctx, tracker, active: () => playControlsActive(ctx), analog: () => analogRef.current, pointer: () => pointerAxisRef.current, sink: () => ({ send(frame, options) { frames.push({ frame, urgent: options?.urgent ?? false }); } }) });
  return { ctx, tracker, frames, analogRef, attach, detachSuspension };
}

test("a native down/up tap survives render starvation as one local press and an immutable wire identity", () => {
  const f = fixture(); const detach = f.attach();
  f.tracker.handleDown("KeyW");
  const down = f.frames.at(-1)!.frame;
  expect(down.presses).toHaveLength(1);
  f.tracker.handleDown("KeyW");
  expect(f.frames.at(-1)!.frame).toBe(down);
  f.tracker.handleUp("KeyW");
  f.ctx.input.beginStep();
  expect(f.ctx.input.isDown("moveForward")).toBe(false);
  expect(f.ctx.input.justPressed("moveForward")).toBe(true);
  f.ctx.input.beginStep();
  expect(f.ctx.input.justPressed("moveForward")).toBe(false);
  f.tracker.handleDown("KeyW");
  expect(f.frames.at(-1)!.frame.presses![0]!.seq).toBeGreaterThan(down.presses![0]!.seq);
  detach();
  f.ctx.input.beginStep();
  expect(f.ctx.input.justPressed("moveForward")).toBe(false);
  f.detachSuspension();
});

test("native tracker release and a failure lease publish neutral without any render frame", () => {
  const f = fixture(); const detach = f.attach();
  f.tracker.handleDown("KeyW");
  expect(f.frames.at(-1)?.frame.held).toEqual(["moveForward"]);
  f.tracker.handleUp("KeyW");
  expect(f.frames.at(-1)).toMatchObject({ frame: { held: [], pointer: null, analog: null }, urgent: true });
  f.tracker.handleDown("KeyW");
  f.analogRef.current = { forward: 1 };
  const release = suspendPlayControls(f.ctx);
  expect(f.frames.at(-1)).toMatchObject({ frame: { held: [], pointer: null, analog: null }, urgent: true });
  release();
  expect(f.ctx.input.held()).toEqual([]);
  f.ctx.input.beginStep();
  expect(f.ctx.input.justPressed("moveForward")).toBe(false);
  detach(); f.detachSuspension();
});

test("suspension retires owned pointer bookkeeping and pending presses before a fresh canvas click", () => {
  const f = fixture(); const detach = f.attach();
  const input = shellPointerInput(f.tracker, () => playControlsActive(f.ctx));
  let cleared = 0;
  const detachReset = input.attachReset(f.tracker, () => { cleared += 1; });
  input.down({ pointerId: 1, button: 0 }, true);
  const release = suspendPlayControls(f.ctx);
  release();
  expect(cleared).toBe(2);
  f.ctx.input.beginStep();
  expect(f.ctx.input.justPressed("fire")).toBe(false);
  expect(f.ctx.input.isDown("fire")).toBe(false);
  input.down({ pointerId: 2, button: 0 }, true);
  f.ctx.input.beginStep();
  expect(f.ctx.input.justPressed("fire")).toBe(true);
  expect(f.ctx.input.isDown("fire")).toBe(true);
  detachReset(); input.cancel(); detach(); f.detachSuspension();
});

test("old publication cleanup cannot neutralize a replacement owner, while final unmount does", () => {
  const f = fixture(); const detachOld = f.attach(); const detachNew = f.attach();
  f.tracker.handleDown("KeyW");
  const before = f.frames.length;
  detachOld();
  expect(f.frames.length).toBe(before);
  expect(f.ctx.input.held()).toEqual(["moveForward"]);
  detachNew();
  expect(f.frames.at(-1)?.frame.held).toEqual([]);
  f.tracker.handleDown("KeyW");
  expect(f.frames.length).toBe(before + 1);
  f.detachSuspension();
});

test("analog motion coalesces normally and releasing its final axis is urgent", () => {
  const f = fixture(); const detach = f.attach();
  f.analogRef.current = { forward: 0.7 }; f.tracker.notify("analog");
  expect(f.frames.at(-1)?.urgent).toBe(false);
  f.analogRef.current = null; f.tracker.notify("analog");
  expect(f.frames.at(-1)).toMatchObject({ frame: { analog: null }, urgent: true });
  detach(); f.detachSuspension();
});
