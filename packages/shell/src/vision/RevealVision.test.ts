import { describe, expect, test } from "bun:test";
import { act, createRoot, extend } from "@react-three/fiber";
import { createElement, Profiler, type ReactElement } from "react";
import * as THREE from "three";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { GameProvider } from "@jgengine/react/provider";

import { RevealHighlights } from "./RevealVision";

function fixture(): GameContext {
  return createGameContext({
    definition: defineGameDefinition({ name: "Reveal highlights", assets: createAssetCatalog(), multiplayer: "off", persist: false }),
    content: {},
    player: { userId: "player", isNew: true },
  });
}

interface Stage {
  scene: THREE.Scene;
  /** Runs one frame inside act, so `useFrame` state lands in a commit. */
  advance(ms: number): Promise<void>;
  mutate(write: () => void): Promise<void>;
}

let commits = 0;

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
      store = root.render(
        createElement(
          GameProvider,
          { context: ctx },
          createElement(Profiler, { id: "reveal", onRender: () => { commits += 1; } }, element),
        ),
      );
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

const tagsFor = (entity: SceneEntity): readonly string[] =>
  (entity.meta as { tags?: readonly string[] } | undefined)?.tags ?? [];

function highlightGroups(scene: THREE.Scene): THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  scene.traverse((node) => {
    if (node.type === "Mesh" && (node as THREE.Mesh).geometry?.type === "CapsuleGeometry") found.push(node.parent ?? node);
  });
  return found;
}

function reveal(enabled: boolean) {
  return createElement(RevealHighlights, { enabled, radius: 20, tags: ["culprit"], resolveTags: tagsFor });
}

describe("reveal highlights", () => {
  test("a disabled reveal mode does not re-render on pose writes", async () => {
    commits = 0;
    const ctx = fixture();
    const player = ctx.scene.entity.spawn("player", { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
    await mounted(ctx, reveal(false), async ({ advance, mutate }) => {
      await advance(0);
      const settled = commits;
      for (let tick = 0; tick < 20; tick += 1) {
        await mutate(() => ctx.scene.entity.setPose(player, { position: [tick, 0, 0], dt: 1 / 60 }));
        await advance(16);
      }
      expect(commits).toBe(settled);
    });
  });

  test("an enabled reveal mode follows the origin and its tagged targets each frame", async () => {
    const ctx = fixture();
    const player = ctx.scene.entity.spawn("player", { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
    const culprit = ctx.scene.entity.spawn("suspect", {
      position: [2, 0, 0],
      meta: { tags: ["culprit"] },
    });
    await mounted(ctx, reveal(true), async ({ scene, advance, mutate }) => {
      await advance(16);
      expect(highlightGroups(scene)).toHaveLength(1);
      expect(highlightGroups(scene)[0]!.position.x).toBeCloseTo(2, 5);

      await mutate(() => ctx.scene.entity.setPose(culprit, { position: [5, 0, 1] }));
      await advance(32);
      expect(highlightGroups(scene)[0]!.position.x).toBeCloseTo(5, 5);
      expect(highlightGroups(scene)[0]!.position.z).toBeCloseTo(1, 5);

      await mutate(() => ctx.scene.entity.setPose(player, { position: [80, 0, 0] }));
      await advance(48);
      expect(highlightGroups(scene)).toHaveLength(0);
    });
  });
});
