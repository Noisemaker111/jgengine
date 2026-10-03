import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { ANIM_PARAMS_KEY, createAnimGraphRuntime, type AnimGraph, type AnimParamValue } from "@jgengine/core/anim/animGraph";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { playerMovementTelemetry, resolvePlayerMovementTuning, stepPlayerMovement } from "@jgengine/core/movement/playerMovement";
import { createGraphPose, readModelAnimationParams } from "./useModelAnimation";

const DT = 1 / 60;

function context() {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "physical-animation", assets: createAssetCatalog(), multiplayer: "off", features: { players: true } }),
    content: { entityById: () => ({ movement: { walkSpeed: 3, poses: ["standing", "running", "crouch"] } }) },
    player: { userId: "knight", isNew: true },
  });
  ctx.game.players?.join("knight", true);
  ctx.scene.entity.spawn("hero", { id: "knight", position: [0, 0, 0] });
  return ctx;
}

function knightGraph(): AnimGraph {
  return { layers: [{ id: "base", entry: "locomotion", states: {
    locomotion: { kind: "blend1D", param: "speed", points: [{ at: 0, clip: "Idle" }, { at: 0.5, clip: "Walking_A" }, { at: 6, clip: "Running_A" }] },
    jumpStart: { kind: "clip", clip: "Jump_Start", loop: false, speed: 2 },
    airborne: { kind: "clip", clip: "Jump_Idle" },
    land: { kind: "clip", clip: "Jump_Land", loop: false, speed: 2 },
  }, transitions: [
    { from: "locomotion", to: "jumpStart", when: [{ param: "grounded", op: "==", value: false }, { param: "verticalSpeed", op: ">", value: 0 }], duration: 0.06 },
    { from: "locomotion", to: "airborne", when: [{ param: "grounded", op: "==", value: false }, { param: "verticalSpeed", op: "<", value: 0 }], duration: 0.08 },
    { from: "jumpStart", to: "land", when: [{ param: "grounded", op: "==", value: true }], duration: 0.06 },
    { from: "jumpStart", to: "airborne", when: [{ param: "verticalSpeed", op: "<=", value: 0 }], duration: 0.06 },
    { from: "airborne", to: "land", when: [{ param: "grounded", op: "==", value: true }], duration: 0.06 },
    { from: "airborne", to: "jumpStart", when: [{ param: "grounded", op: "==", value: false }, { param: "verticalSpeed", op: ">", value: 0 }], duration: 0.06 },
    { from: "land", to: "jumpStart", when: [{ param: "grounded", op: "==", value: false }, { param: "verticalSpeed", op: ">", value: 0 }], duration: 0.06 },
    { from: "land", to: "airborne", when: [{ param: "grounded", op: "==", value: false }, { param: "verticalSpeed", op: "<", value: 0 }], duration: 0.06 },
    { from: "land", to: "locomotion", exitTime: 1, duration: 0.1 },
  ] }] };
}

async function knight() {
  const bytes = readFileSync(new URL("../../../../apps/dev/public/models/kaykit-adventurers/Knight.glb", import.meta.url));
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
}

describe("physical movement animation parameters", () => {
  test("rejects output aliases before changing authored or physical state", () => {
    const ctx = context();
    const extras = { grounded: false, verticalSpeed: 12, aiming: true };
    ctx.scene.entity.blackboard.set("knight", ANIM_PARAMS_KEY, extras);
    expect(() => readModelAnimationParams(ctx, "knight", 0, extras)).toThrow("caller-owned output dictionary");
    expect(extras).toEqual({ grounded: false, verticalSpeed: 12, aiming: true });
    stepPlayerMovement(ctx, "knight", { held: [], pointer: null }, DT, resolvePlayerMovementTuning({}));
    const motion = playerMovementTelemetry(ctx, "knight")!;
    const before = { ...motion };
    expect(() => readModelAnimationParams(ctx, "knight", 0, motion as unknown as Record<string, AnimParamValue>)).toThrow("caller-owned output dictionary");
    expect(motion).toEqual(before);
    expect(ctx.scene.entity.blackboard.get("knight", ANIM_PARAMS_KEY)).toBe(extras);
  });

  test("known movement overrides authored physics values without changing the blackboard or other actors", () => {
    const ctx = context();
    const extras = { grounded: false, verticalSpeed: 100, crouched: false, aiming: true, speed: 90 };
    ctx.scene.entity.blackboard.set("knight", ANIM_PARAMS_KEY, extras);
    const params: Record<string, AnimParamValue> = { stale: true };
    expect(readModelAnimationParams(ctx, "knight", 3, params)).toBe(params);
    expect(params).toEqual({ ...extras, speed: 3 });
    const tuning = resolvePlayerMovementTuning({ physics: { gravity: -16, jumpVelocity: 6 } });
    stepPlayerMovement(ctx, "knight", { held: ["crouch"], pointer: null }, DT, tuning);
    readModelAnimationParams(ctx, "knight", 0, params);
    expect(params).toEqual({ grounded: true, verticalSpeed: 0, crouched: true, aiming: true, speed: 0 });
    expect(ctx.scene.entity.blackboard.get("knight", ANIM_PARAMS_KEY)).toBe(extras);
    expect(extras).toEqual({ grounded: false, verticalSpeed: 100, crouched: false, aiming: true, speed: 90 });
    ctx.scene.entity.spawn("hero", { id: "custom", position: [0, 0, 0] });
    ctx.scene.entity.blackboard.set("custom", ANIM_PARAMS_KEY, { grounded: false, verticalSpeed: -2 });
    const other: Record<string, AnimParamValue> = {};
    readModelAnimationParams(ctx, "custom", 4, other);
    expect(other).toEqual({ grounded: false, verticalSpeed: -2, speed: 4 });
    expect(params.crouched).toBe(true);
    ctx.scene.entity.blackboard.delete("knight", ANIM_PARAMS_KEY);
    readModelAnimationParams(ctx, "knight", 0, params);
    expect(params.aiming).toBeUndefined();
  });

  test("a policy-blocked jump retains custom parameters instead of overriding them with rejected motion", () => {
    const ctx = context();
    const extras = { grounded: true, verticalSpeed: 0, crouched: false };
    ctx.scene.entity.blackboard.set("knight", ANIM_PARAMS_KEY, extras);
    const tuning = resolvePlayerMovementTuning({ movement: { beforeCommit: () => [0, 0, 0] } });
    stepPlayerMovement(ctx, "knight", { held: ["jump"], pointer: null }, DT, tuning);
    expect(ctx.scene.entity.get("knight")!.position).toEqual([0, 0, 0]);
    const params: Record<string, AnimParamValue> = {};
    readModelAnimationParams(ctx, "knight", 0, params);
    expect(params).toEqual({ ...extras, speed: 0 });
    expect(ctx.scene.entity.blackboard.get("knight", ANIM_PARAMS_KEY)).toBe(extras);
  });

  test("the real Knight graph follows physical takeoff, apex, landing and a buffered second jump", async () => {
    const gltf = await knight();
    const graph = knightGraph();
    const pose = createGraphPose(gltf.scene, graph, gltf.animations);
    const runtime = createAnimGraphRuntime(graph);
    const ctx = context();
    const tuning = resolvePlayerMovementTuning({ physics: { gravity: -16, jumpVelocity: 6 }, movement: { feel: { jumpBufferMs: 120 } } });
    const params: Record<string, AnimParamValue> = {};
    const states: string[] = [];
    const unknown = readModelAnimationParams(ctx, "knight", 0, params);
    runtime.advance(DT, unknown, pose.durations);
    expect(runtime.stateOf("base")).toBe("locomotion");
    const tick = (held: string[], skipGroundedPose = false) => {
      stepPlayerMovement(ctx, "knight", { held, pointer: null }, DT, tuning);
      const entity = ctx.scene.entity.get("knight")!;
      readModelAnimationParams(ctx, "knight", Math.hypot(entity.velocity[0], entity.velocity[2]), params);
      const output = skipGroundedPose && params.grounded === true ? { clips: [], events: [] } : runtime.advance(DT, params, pose.durations);
      pose.apply(output.clips, output.rootMotion);
      const state = runtime.stateOf("base")!;
      if (states.at(-1) !== state) states.push(state);
      return output;
    };
    expect(tick([]).clips[0]!.clip).toBe("Idle");
    let walk = tick(["moveForward"]);
    expect(walk.clips.some((clip) => clip.clip === "Walking_A" && clip.weight > 0)).toBe(true);
    for (let i = 0; i < 60; i++) walk = tick(["moveForward", "sprint"]);
    expect(walk.clips).toEqual([{ clip: "Running_A", weight: 1, time: walk.clips[0]!.time, layer: "base" }]);
    tick(["jump"]);
    for (let i = 0; i < 100 && runtime.stateOf("base") !== "land"; i++) tick([]);
    expect(states).toEqual(["locomotion", "jumpStart", "airborne", "land"]);
    expect(playerMovementTelemetry(ctx, "knight")!.grounded).toBe(true);
    for (let i = 0; i < 40; i++) tick([]);
    expect(runtime.stateOf("base")).toBe("locomotion");
    tick(["jump"]);
    for (let i = 0; i < 100 && !(params.verticalSpeed < 0 && ctx.scene.entity.get("knight")!.position[1] < 0.25); i++) tick([]);
    tick(["jump"]);
    let secondJump = false;
    for (let i = 0; i < 12; i++) {
      tick(["jump"]);
      if (params.verticalSpeed > 0 && !params.grounded) { secondJump = true; break; }
    }
    expect(secondJump).toBe(true);
    expect(runtime.stateOf("base")).toBe("jumpStart");
    expect(states.slice(-4)).toEqual(["jumpStart", "airborne", "land", "jumpStart"]);
    for (let i = 0; i < 100 && !params.grounded; i++) tick([], true);
    expect(params.grounded).toBe(true);
    expect(runtime.stateOf("base")).toBe("airborne");
    tick(["jump"]);
    expect(params.verticalSpeed).toBeGreaterThan(0);
    expect(runtime.stateOf("base")).toBe("jumpStart");
    expect(states.slice(-3)).toEqual(["jumpStart", "airborne", "jumpStart"]);
    pose.dispose();
  });
});
