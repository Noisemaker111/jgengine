import { expect, test } from "bun:test";
import { act, createRoot } from "@react-three/fiber";
import { createElement } from "react";
import type { WebGLRenderer } from "three";

import { createEmptyEditorDocument } from "@jgengine/core/editor/document";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { ENTITY_MARKER_KINDS } from "@jgengine/core/world/authoredObjects";
import { authoredSpawnPosition } from "@jgengine/core/world/authoredSpawn";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { GameProvider } from "@jgengine/react/provider";

import { defineGame } from "../defineGame";
import { AuthoredObjects } from "./AuthoredScene";
import { resolveObjectModel } from "../render/resolveModel";

function fixture() {
  const document = createEmptyEditorDocument();
  document.markers = [
    { id: "spawn:player", kind: "player_spawn", catalogId: "knight", position: { x: 0, y: 0, z: 0 }, meta: { animation: { states: { idle: "Idle", walk: "Walking_A" } } } },
    { id: "crate", kind: "prop", catalogId: "crate", position: { x: 2, y: 0, z: -3 }, meta: { verticalOffset: 0.25 } },
    { id: "mob", kind: "mob", catalogId: "knight", position: { x: 4, y: 0, z: 4 } },
    { id: "boss", kind: "boss", catalogId: "knight", position: { x: 8, y: 0, z: 8 } },
  ];
  const assets = createAssetCatalog();
  assets.register("knight", { url: "/knight.glb", clips: ["Idle", "Walking_A", "Running_A"] });
  assets.register("crate", { url: "/crate.glb" });
  return { document, assets };
}

async function renderer() {
  const root = createRoot({} as HTMLCanvasElement);
  await root.configure({ frameloop: "never", size: { width: 100, height: 100, top: 0, left: 0 }, dpr: 1,
    gl: () => ({ render() {}, setSize() {}, setPixelRatio() {} }) as unknown as WebGLRenderer });
  return root;
}

test("defineGame excludes a player-spawn catalog marker from static placement while retaining its authored rig association", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const { document, assets } = fixture();
  const playable = defineGame({ name: "Authored player", assets, editorLayers: document,
    content: { entityById: () => ({ role: "player" }) },
    scenePlacement: { verticalOffset: 1, excludeKinds: [...ENTITY_MARKER_KINDS, "player_spawn"] } });
  const ctx = createGameContext({ definition: playable.game, content: playable.content, player: { userId: "player", isNew: true } });
  ctx.scene.entity.spawn("knight", { id: "player", position: authoredSpawnPosition(document)! });
  const root = await renderer();
  try {
    await act(async () => root.render(createElement(GameProvider, { context: ctx }, createElement(playable.WorldOverlay!, { ctx }))));
    expect(ctx.scene.object.ids()).toEqual(["crate"]);
    expect(ctx.scene.object.get("crate")!.position).toEqual([2, 1.25, -3]);
    expect(ctx.scene.entity.ids()).toEqual(["player"]);
    expect(ctx.scene.entity.get("player")!.position).toEqual([0, 0, 0]);
    expect(document.markers[0]!.catalogId).toBe("knight");
    expect(document.markers[0]!.meta?.animation).toEqual({ states: { idle: "Idle", walk: "Walking_A" } });
    expect(playable.game.assets.resolve(document.markers[0]!.catalogId!)!.clips).toContain("Walking_A");
  } finally {
    await act(async () => root.unmount());
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

test("default scene placement keeps its existing mob/boss exclusions", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const { document, assets } = fixture();
  const playable = defineGame({ name: "Default placements", assets, editorLayers: document });
  const ctx = createGameContext({ definition: playable.game, content: playable.content, player: { userId: "player", isNew: true } });
  const root = await renderer();
  try {
    await act(async () => root.render(createElement(GameProvider, { context: ctx }, createElement(playable.WorldOverlay!, { ctx }))));
    expect(ctx.scene.object.ids()).toEqual(["spawn:player", "crate"]);
  } finally {
    await act(async () => root.unmount());
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

test("changing the exclusion policy resolves newly eligible props without changing the document", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const { document, assets } = fixture();
  const playable = defineGame({ name: "Placement policy", assets });
  const ctx = createGameContext({ definition: playable.game, content: playable.content, player: { userId: "player", isNew: true } });
  const root = await renderer();
  const render = (excludeKinds: readonly string[]) => createElement(GameProvider, { context: ctx }, createElement(AuthoredObjects, { document, field: ctx.world.ground, excludeKinds }));
  try {
    await act(async () => root.render(render([...ENTITY_MARKER_KINDS, "player_spawn", "prop"])));
    expect(ctx.scene.object.ids()).toEqual([]);
    await act(async () => root.render(render([...ENTITY_MARKER_KINDS, "player_spawn"])));
    expect(ctx.scene.object.ids()).toEqual(["crate"]);
  } finally {
    await act(async () => root.unmount());
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

test("live synchronization removes excluded static placements while preserving the same-id game entity", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const { document, assets } = fixture();
  const playable = defineGame({ name: "Live placement policy", assets });
  const ctx = createGameContext({ definition: playable.game, content: playable.content, player: { userId: "player", isNew: true } });
  ctx.scene.entity.spawn("knight", { id: "spawn:player", position: [0, 0, 0] });
  const root = await renderer();
  const render = (excludeKinds: readonly string[], current = document) => createElement(GameProvider, { context: ctx }, createElement(AuthoredObjects, { document: current, field: ctx.world.ground, synchronize: true, excludeKinds }));
  try {
    await act(async () => root.render(render(ENTITY_MARKER_KINDS)));
    expect(ctx.scene.object.ids()).toEqual(["spawn:player", "crate"]);
    await act(async () => root.render(render([...ENTITY_MARKER_KINDS, "player_spawn"])));
    expect(ctx.scene.object.ids()).toEqual(["crate"]);
    expect(ctx.scene.entity.ids()).toEqual(["spawn:player"]);
    expect(ctx.scene.entity.get("spawn:player")!.position).toEqual([0, 0, 0]);
    await act(async () => root.render(render([...ENTITY_MARKER_KINDS, "player_spawn"], { ...document, markers: document.markers.filter((marker) => marker.id !== "crate") })));
    expect(ctx.scene.object.ids()).toEqual([]);
    expect(ctx.scene.entity.ids()).toEqual(["spawn:player"]);
  } finally {
    await act(async () => root.unmount());
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

test("static animation placement rejects malformed saved overrides with located repairs and retains catalog playback", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const { document, assets } = fixture();
  document.markers = [{ id: "character", kind: "prop", catalogId: "knight", position: { x: 2, y: 0, z: -3 }, meta: { verticalOffset: 0.25, animation: { clock: "calendar", auto: false, clip: 3 } } }];
  const saved = JSON.stringify(document);
  const catalog: ModelConfig = { url: "/knight.glb", animation: { states: { idle: "Idle", walk: "Walking_A" }, timeScale: 0.75 } };
  const playable = defineGame({ name: "Validated static character", assets });
  const ctx = createGameContext({ definition: playable.game, content: playable.content, player: { userId: "player", isNew: true } });
  const cache = new Map();
  const root = await renderer();
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args.join(" ")); };
  const render = (current = document, verticalOffset = 1, context = ctx) => createElement(GameProvider, { context }, createElement(AuthoredObjects, { document: current, field: context.world.ground, synchronize: true, verticalOffset }));
  try {
    await act(async () => root.render(render()));
    const object = ctx.scene.object.get("character")!;
    expect(object.position).toEqual([2, 1.25, -3]);
    expect(object.animation).toBeUndefined();
    expect(resolveObjectModel(object, { knight: catalog }, assets, cache)).toBe(catalog);
    expect(warnings).toHaveLength(3);
    expect(warnings.join("\n")).toContain("markers[0].meta.animation.clock");
    expect(warnings.join("\n")).toContain("markers[0].meta.animation.auto");
    expect(warnings.join("\n")).toContain("markers[0].meta.animation.clip");
    expect(warnings.join("\n")).toContain("remove the animation override");
    await act(async () => root.render(render()));
    await act(async () => root.render(render(document, 2)));
    const replacementContext = createGameContext({ definition: playable.game, content: playable.content, player: { userId: "replacement", isNew: true } });
    await act(async () => root.render(render(document, 1, replacementContext)));
    expect(replacementContext.scene.object.ids()).toEqual(["character"]);
    expect(replacementContext.scene.object.get("character")!.position).toEqual([2, 1.25, -3]);
    expect(warnings).toHaveLength(3);
    expect(JSON.stringify(document)).toBe(saved);
    const animation = { clock: "game" as const, auto: true as const, states: {}, timeScale: -0.5, paused: true };
    const valid = { ...document, markers: document.markers.map(marker => ({ ...marker, meta: { ...marker.meta, animation } })) };
    await act(async () => root.render(render(valid, 1, replacementContext)));
    expect(replacementContext.scene.object.get("character")!.animation).toBe(animation);
    expect(resolveObjectModel(replacementContext.scene.object.get("character")!, { knight: catalog }, assets, cache)!.animation).toBe(animation);
    expect(warnings).toHaveLength(3);
    expect(JSON.stringify(document)).toBe(saved);
  } finally {
    await act(async () => root.unmount());
    console.warn = originalWarn;
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
