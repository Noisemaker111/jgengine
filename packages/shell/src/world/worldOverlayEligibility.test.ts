import { expect, test } from "bun:test";
import * as THREE from "three";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { collectNameplateSamples, collectWorldBarSamples, refreshWorldBarSamples, type NameplateSample, type WorldBarSample } from "./worldBarSamples";

const viewport = { width: 800, height: 600 };

function fixture() {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "Possessed overlay viewer", multiplayer: "off", persist: false }),
    content: { entityById: () => ({ stats: { health: { max: 10 } } }) },
    player: { userId: "account", isNew: true },
  });
  for (const [id, name] of [["account", "Account body"], ["pawn", "Current body"], ["reserve", "Reserve body"], ["remote", "Remote guard"]] as const) {
    ctx.scene.entity.spawn(name, { id, position: [0, 0, 0] });
  }
  ctx.player.possession.own("account", "pawn");
  ctx.player.possession.own("account", "reserve");
  const camera = new THREE.PerspectiveCamera(60, viewport.width / viewport.height, 0.1, 1000);
  camera.position.set(0, 2, 10);
  camera.lookAt(0, 2, 0);
  camera.updateMatrixWorld();
  return { ctx, camera };
}

test("health bars exclude the current possessed body and retain other owned or remote actors", () => {
  const { ctx, camera } = fixture();
  expect(ctx.player.possession.possess("account", "pawn")).toBeNull();
  const samples: WorldBarSample[] = [];
  collectWorldBarSamples(ctx, "health", 2, undefined, undefined, camera, viewport, samples, new THREE.Vector3());
  expect(samples.map((row) => row.entityId)).toEqual(["reserve", "remote"]);
});

test("explicit through-wall reveal still excludes the possessed body from nameplates", () => {
  const { ctx, camera } = fixture();
  expect(ctx.player.possession.possess("account", "pawn")).toBeNull();
  let rays = 0;
  const raycast = ctx.scene.raycast;
  ctx.scene.raycast = (input) => { rays++; return raycast(input); };
  const samples: NameplateSample[] = [];
  collectNameplateSamples(ctx, "health", 2, undefined, undefined, camera, viewport, samples, new THREE.Vector3(), 40, false);
  expect(samples.map((row) => row.id)).toEqual(["reserve", "remote"]);
  expect(rays).toBe(0);
});

test("retained health anchors drop a newly possessed body before the next visibility refresh", () => {
  const { ctx, camera } = fixture();
  const samples: WorldBarSample[] = [];
  collectWorldBarSamples(ctx, "health", 2, undefined, undefined, camera, viewport, samples, new THREE.Vector3());
  expect(samples.map((row) => row.entityId)).toEqual(["pawn", "reserve", "remote"]);
  expect(ctx.player.possession.possess("account", "pawn")).toBeNull();
  refreshWorldBarSamples(ctx, 2, camera, viewport, samples, new THREE.Vector3());
  expect(samples.map((row) => row.entityId)).toEqual(["reserve", "remote"]);
  expect(ctx.player.possession.possess("account", "reserve")).toBeNull();
  collectWorldBarSamples(ctx, "health", 2, undefined, undefined, camera, viewport, samples, new THREE.Vector3());
  expect(samples.map((row) => row.entityId)).toEqual(["pawn", "remote"]);
});
