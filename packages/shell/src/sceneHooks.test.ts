import { describe, expect, test } from "bun:test";
import { act, createRoot, extend } from "@react-three/fiber";
import { createElement, type ReactElement } from "react";
import * as THREE from "three";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { GameProvider } from "@jgengine/react/provider";
import { useSceneEntities, useSceneObjects } from "@jgengine/react/hooks";

function fixture(): GameContext {
  return createGameContext({
    definition: defineGameDefinition({ name: "Scene hook renders", assets: createAssetCatalog(), multiplayer: "off", persist: false }),
    content: {},
    player: { userId: "player", isNew: true },
  });
}

async function mounted(ctx: GameContext, element: ReactElement, run: () => Promise<void>) {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  extend(THREE);
  const root = createRoot({} as HTMLCanvasElement);
  await root.configure({
    frameloop: "never",
    size: { width: 400, height: 300, top: 0, left: 0 },
    dpr: 1,
    gl: () => ({ render() {}, setSize() {}, setPixelRatio() {} }) as unknown as THREE.WebGLRenderer,
  });
  try {
    await act(async () => {
      root.render(createElement(GameProvider, { context: ctx }, element));
    });
    await run();
  } finally {
    await act(async () => root.unmount());
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
}

/** A store write inside act, the way the live loop's writes arrive. */
async function write(change: () => void): Promise<void> {
  await act(async () => { change(); });
}

let renders = 0;

function EntityRows() {
  const entities = useSceneEntities();
  renders += 1;
  return createElement("group", { userData: { rows: entities.length } });
}

function ObjectRows() {
  const objects = useSceneObjects();
  renders += 1;
  return createElement("group", { userData: { rows: objects.length } });
}

describe("scene store hooks", () => {
  test("useSceneEntities keeps one list through pose writes and re-renders on spawn, replace and despawn", async () => {
    renders = 0;
    const ctx = fixture();
    const actor = ctx.scene.entity.spawn("actor", { position: [0, 0, 0] });
    await mounted(ctx, createElement(EntityRows), async () => {
      expect(renders).toBe(1);

      for (let tick = 0; tick < 20; tick += 1) {
        await write(() => ctx.scene.entity.setPose(actor, { position: [tick, 0, 0], dt: 1 / 60 }));
      }
      expect(renders).toBe(1);
      expect(ctx.scene.entity.get(actor)?.position).toEqual([19, 0, 0]);

      await write(() => { ctx.scene.entity.spawn("actor", { id: actor, position: [0, 0, 0], onExisting: "replace" }); });
      expect(renders).toBe(2);

      let spawned = "";
      await write(() => { spawned = ctx.scene.entity.spawn("crate", { position: [4, 0, 4] }); });
      expect(renders).toBe(3);

      await write(() => { ctx.scene.entity.despawn(spawned); });
      expect(renders).toBe(4);
    });
  });

  test("useSceneObjects keeps one list through pose writes and re-renders on place, state and remove", async () => {
    renders = 0;
    const ctx = fixture();
    const crate = ctx.scene.object.place("crate", 1, 0, 2);
    await mounted(ctx, createElement(ObjectRows), async () => {
      expect(renders).toBe(1);

      for (let tick = 0; tick < 20; tick += 1) {
        await write(() => ctx.scene.object.move(crate, 1 + tick, 0, 2));
      }
      expect(renders).toBe(1);
      expect(ctx.scene.object.get(crate)?.position).toEqual([20, 0, 2]);

      await write(() => ctx.scene.object.patchState(crate, { open: true }));
      expect(renders).toBe(2);

      let placed = "";
      await write(() => { placed = ctx.scene.object.place("rope", 3, 0, 4); });
      expect(renders).toBe(3);

      await write(() => { ctx.scene.object.remove(placed); });
      expect(renders).toBe(4);
    });
  });
});
