import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "../game/defineGame";
import { createGameContext } from "../runtime/gameContext";
import { createAssetCatalog } from "../scene/assetCatalog";
import { createCellContent, sceneEntityCells, sceneObjectCells } from "./cellContent";
import { createCellStreaming } from "./cellStreaming";

function world() {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "Streamed", assets: createAssetCatalog(), multiplayer: "off" }),
    content: { entityById: () => ({}), objectById: () => ({}) },
    player: { userId: "user_a", isNew: true },
  });
  // Ten 100 m cells in a row, five props and one walker in each.
  for (let cell = 0; cell < 10; cell += 1) {
    for (let i = 0; i < 5; i += 1) ctx.scene.object.place("crate", cell * 100 + 10 + i * 15, 0, 50);
    ctx.scene.entity.spawn("walker", { id: `walker-${cell}`, position: [cell * 100 + 50, 0, 50], role: "npc" });
  }
  const objects = createCellContent({ rule: "despawn", adapter: sceneObjectCells(ctx.scene.object), restoresPerStep: 3 });
  const entities = createCellContent({ rule: "freeze", adapter: sceneEntityCells(ctx.scene.entity) });
  const streaming = createCellStreaming({
    area: { min: [0, 0], max: [1000, 100] },
    cellSize: 100,
    loadRadius: 60,
    keepRadius: 120,
    loadsPerUpdate: 1,
    unloadsPerUpdate: 1,
    content: [objects, entities],
  });
  return { ctx, objects, entities, streaming };
}

const at = (x: number) => ({ x, z: 50 });

describe("createCellStreaming", () => {
  test("start parks every cell out of reach before anything draws it", () => {
    const { ctx, streaming, entities } = world();
    streaming.start(at(50));
    expect(ctx.scene.object.ids().length).toBe(10);
    expect(streaming.state("0,0")).toBe("ready");
    expect(streaming.state("1,0")).toBe("ready");
    expect(streaming.state("5,0")).toBe("unloaded");
    expect(entities.isFrozen("walker-5")).toBe(true);
    expect(entities.isFrozen("walker-0")).toBe(false);
  });

  test("a cell loads within the budget and turns ready once its content is all back", () => {
    const { ctx, streaming } = world();
    streaming.start(at(50));
    streaming.tick(at(250));
    expect(streaming.state("2,0")).toBe("loading");
    expect(streaming.state("3,0")).toBe("unloaded");
    expect(streaming.stats().pending).toBeGreaterThan(0);
    streaming.tick(at(250));
    expect(streaming.state("2,0")).toBe("ready");
    expect(ctx.scene.object.inBox([200, -1, 0], [300, 1, 100]).length).toBe(5);
  });

  test("with a renderer a leaving cell keeps its props until the proxy is ready, and shows the proxy while loading", async () => {
    const { ctx, streaming } = world();
    const release = new Map<string, () => void>();
    const fetched: string[] = [];
    streaming.attachRenderer({
      prepare: (cell) => {
        fetched.push(cell);
        return new Promise((resolve) => void release.set(cell, resolve));
      },
    });
    streaming.start(at(50));
    for (let i = 0; i < 4; i += 1) streaming.tick(at(450));
    expect(streaming.leaving()).toContain("0,0");
    expect(streaming.holdsProxy(50, 50)).toBe(true);
    expect(ctx.scene.object.inBox([0, -1, 0], [100, 1, 100]).length).toBe(5);
    streaming.proxyReady("0,0");
    expect(ctx.scene.object.inBox([0, -1, 0], [100, 1, 100]).length).toBe(0);
    expect(fetched[0]).toBe("4,0");
    expect(streaming.state("4,0")).toBe("loading");
    expect(streaming.holdsProxy(450, 50)).toBe(true);
    streaming.tick(at(450));
    expect(ctx.scene.object.inBox([400, -1, 0], [500, 1, 100]).length).toBe(0);
    release.get("4,0")?.();
    await Promise.resolve();
    streaming.tick(at(450));
    streaming.tick(at(450));
    expect(streaming.state("4,0")).toBe("ready");
    expect(streaming.holdsProxy(450, 50)).toBe(false);
  });

  test("warms one never-seen cell at a time so the renderer can build its proxy", () => {
    const { ctx, streaming } = world();
    streaming.retune({ warmRadius: 400 });
    streaming.attachRenderer({});
    streaming.start(at(50));
    streaming.tick(at(50));
    expect(streaming.stats().warming).toBe(1);
    expect(streaming.state("2,0")).toBe("warming");
    streaming.tick(at(50));
    expect(streaming.state("2,0")).toBe("warming");
    streaming.tick(at(50));
    expect(streaming.state("2,0")).toBe("leaving");
    expect(ctx.scene.object.inBox([200, -1, 0], [300, 1, 100]).length).toBe(5);
    streaming.proxyReady("2,0");
    expect(streaming.state("2,0")).toBe("unloaded");
    streaming.tick(at(50));
    expect(streaming.state("3,0")).toBe("warming");
    expect(streaming.state("2,0")).toBe("unloaded");
  });

  test("stop brings every parked cell back so a rebuilt world can start streaming again", () => {
    const { ctx, streaming, entities } = world();
    streaming.start(at(50));
    expect(ctx.scene.object.ids().length).toBe(10);
    streaming.stop();
    expect(ctx.scene.object.ids().length).toBe(50);
    expect(entities.isFrozen("walker-5")).toBe(false);
    streaming.start(at(950));
    expect(ctx.scene.object.ids().length).toBe(10);
    expect(streaming.state("9,0")).toBe("ready");
  });

  test("snapshots residency as plain JSON", () => {
    const { streaming } = world();
    streaming.start(at(50));
    streaming.tick(at(250));
    const saved = JSON.parse(JSON.stringify(streaming.snapshot()));
    const copy = world().streaming;
    copy.restore(saved);
    expect(copy.snapshot().streamer).toEqual(streaming.snapshot().streamer);
    expect(copy.state("5,0")).toBe("unloaded");
    expect(copy.state("1,0")).toBe("ready");
  });
});
