import { describe, expect, test } from "bun:test";
import { act, createElement, Profiler, type ReactElement } from "react";
import * as THREE from "three";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { GameProvider } from "@jgengine/react/provider";
import { mountTestDraws } from "@jgengine/core/frame/testEngineHost.draw";

import { RevealHighlights } from "./RevealVision.draw";

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
  const m = await mountTestDraws(
    createElement(
      GameProvider,
      { context: ctx },
      createElement(
        Profiler,
        { id: "reveal", onRender: () => { commits += 1; } },
        element,
      ),
    ),
    { width: 400, height: 300 },
  );
  try {
    const advance = async (ms: number) => m.advance(ms / 1000);
    const mutate = async (write: () => void) => act(async () => { write(); });
    await run({ scene: m.scene, advance, mutate });
  } finally {
    await m.unmount();
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
