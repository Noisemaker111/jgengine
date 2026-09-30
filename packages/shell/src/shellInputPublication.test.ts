import { expect, test } from "bun:test";
import { createActionStateTracker, toActionStateBindingMap } from "@jgengine/core/input/actionBindings";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { suspendPlayControls, playControlsActive } from "@jgengine/core/game/controlGate";
import type { InputFrame } from "@jgengine/core/runtime/hostedGameRunner";
import { observableShellTracker, attachShellInputPublication } from "./shellInputPublication";
import { attachShellControlSuspension } from "./shellControlSuspension";

function fixture() {
  const definition = defineGameDefinition({ name: "discrete-input", assets: createAssetCatalog(), input: { moveForward: ["KeyW"] } });
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
  detach(); f.detachSuspension();
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
