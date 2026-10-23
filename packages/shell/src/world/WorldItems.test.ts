import { describe, expect, test } from "bun:test";
import { act, createRoot, extend } from "@react-three/fiber";
import { createElement, type ReactElement } from "react";
import * as THREE from "three";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { GameProvider } from "@jgengine/react/provider";
import { useWorldItems } from "@jgengine/react/hooks";

import { WorldItems } from "./WorldItems";
import { POINTER_ENTITY_KEY } from "../pointer/pointerService";

interface Stage {
  scene: THREE.Scene;
  /** Flushes one React act, then runs a frame so `useFrame` work lands. */
  advance(ms: number): Promise<void>;
  /** A store write inside act, the way the live loop's writes arrive. */
  mutate(write: () => void): Promise<void>;
}

function fixture(): GameContext {
  return createGameContext({
    definition: defineGameDefinition({ name: "World item markers", assets: createAssetCatalog(), multiplayer: "off", persist: false }),
    content: {},
    player: { userId: "player", isNew: true },
  });
}

async function mounted(ctx: GameContext, element: ReactElement, run: (stage: Stage) => Promise<void>) {
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
    let scene!: THREE.Scene;
    let store!: ReturnType<typeof root.render>;
    await act(async () => {
      store = root.render(createElement(GameProvider, { context: ctx }, element));
      scene = store.getState().scene;
    });
    const advance = async (ms: number) => act(async () => { store.getState().advance(ms); });
    const mutate = async (write: () => void) => act(async () => { write(); });
    await run({ scene, advance, mutate });
  } finally {
    await act(async () => root.unmount());
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
}

let renders = 0;

/** Stands where `WorldItems` reads the list: one row per record. */
function MarkerList() {
  const items = useWorldItems();
  renders += 1;
  return createElement("group", { userData: { rows: items.length } });
}

function markerGroup(scene: THREE.Scene, instanceId: string): THREE.Group | null {
  let found: THREE.Group | null = null;
  scene.traverse((node) => {
    if (found === null && node.userData[POINTER_ENTITY_KEY] === instanceId) found = node as THREE.Group;
  });
  return found;
}

describe("world item marker list", () => {
  test("a repeated identical world snapshot does not re-render the list, a changed one does", async () => {
    renders = 0;
    const ctx = fixture();
    const item = ctx.scene.worldItem.spawn({ itemId: "crate", position: [1, 0, 2] });
    await mounted(ctx, createElement(MarkerList), async ({ advance, mutate }) => {
      expect(renders).toBe(1);

      for (let tick = 0; tick < 20; tick += 1) {
        await mutate(() => ctx.scene.entity.setPose(item.instanceId, { position: [1 + tick, 0, 2] }));
      }
      await advance(0);
      expect(renders).toBe(1);

      await mutate(() => { ctx.scene.worldItem.spawn({ itemId: "rope", position: [3, 0, 4] }); });
      expect(renders).toBe(2);

      await mutate(() => { ctx.scene.worldItem.consume(item.instanceId); });
      expect(renders).toBe(3);
    });
  });

  test("markers appear, follow a moving item, and disappear on pickup", async () => {
    const ctx = fixture();
    const first = ctx.scene.worldItem.spawn({ itemId: "crate", position: [2, 0, -3] });
    const config = { rarityStyle: { common: { color: "#cfd6de" } } };
    await mounted(ctx, createElement(WorldItems, { config }), async ({ scene, advance, mutate }) => {
      const group = markerGroup(scene, first.instanceId);
      expect(group).not.toBeNull();
      await advance(16);
      expect([group!.position.x, group!.position.y, group!.position.z]).toEqual([2, 0, -3]);

      await mutate(() => ctx.scene.entity.setPose(first.instanceId, { position: [5, 1, 1] }));
      await advance(32);
      expect([group!.position.x, group!.position.y, group!.position.z]).toEqual([5, 1, 1]);

      await mutate(() => { ctx.scene.worldItem.consume(first.instanceId); });
      await advance(48);
      expect(markerGroup(scene, first.instanceId)).toBeNull();

      let second!: { instanceId: string };
      await mutate(() => { second = ctx.scene.worldItem.spawn({ itemId: "rope", position: [-4, 0, 6] }); });
      await advance(64);
      expect(markerGroup(scene, second.instanceId)).not.toBeNull();
    });
  });
});
