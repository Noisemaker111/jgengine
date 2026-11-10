import { expect, test } from "bun:test";
import { createElement } from "react";

import { createEmptyEditorDocument } from "@jgengine/core/editor/document";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { ENTITY_MARKER_KINDS } from "@jgengine/core/world/authoredObjects";
import { authoredSpawnPosition } from "@jgengine/core/world/authoredSpawn";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { GameProvider } from "@jgengine/react/provider";
import { mountTestDraws, type MountedTestDraws } from "@jgengine/core/frame/testEngineHost.draw";

import { defineGame } from "@jgengine/shell/defineGame";
import { AuthoredObjects } from "./AuthoredScene.draw";
import { resolveObjectModel } from "@jgengine/core/model/resolveModel";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import type { ComponentType } from "react";

function overlayOf(playable: ReturnType<typeof defineGame>): ComponentType<WorldOverlayProps> {
  const overlay = playable.scene?.WorldOverlay;
  if (overlay === undefined) throw new Error("defineGame mounted no WorldOverlay for the authored scene");
  return overlay;
}

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

const mountedDraws: MountedTestDraws[] = [];

async function mount(element: ReturnType<typeof createElement>) {
  const mounted = await mountTestDraws(element, { width: 100, height: 100 });
  mountedDraws.push(mounted);
  for (let i = 0; i < 5; i += 1) await mounted.advance(1 / 60);
  return mounted;
}

test("defineGame excludes a player-spawn catalog marker from static placement while retaining its authored rig association", async () => {
  const { document, assets } = fixture();
  const playable = defineGame({ name: "Authored player", assets, scene: { editorLayers: document },
    content: { entityById: () => ({ role: "player" }) },
    scenePlacement: { verticalOffset: 1, excludeKinds: [...ENTITY_MARKER_KINDS, "player_spawn"] } });
  const ctx = createGameContext({ definition: playable.game, content: playable.content, player: { userId: "player", isNew: true } });
  ctx.scene.entity.spawn("knight", { id: "player", position: authoredSpawnPosition(document)! });
  const mounted = await mount(createElement(GameProvider, { context: ctx }, createElement(overlayOf(playable), { ctx })));
  try {
    expect(ctx.scene.object.ids()).toEqual(["crate"]);
    expect(ctx.scene.object.get("crate")!.position).toEqual([2, 1.25, -3]);
    expect(ctx.scene.entity.ids()).toEqual(["player"]);
    expect(ctx.scene.entity.get("player")!.position).toEqual([0, 0, 0]);
    expect(document.markers[0]!.catalogId).toBe("knight");
    expect(document.markers[0]!.meta?.animation).toEqual({ states: { idle: "Idle", walk: "Walking_A" } });
    expect(playable.game.assets.resolve(document.markers[0]!.catalogId!)!.clips).toContain("Walking_A");
  } finally {
    await mounted?.unmount();
  }
});

test("default scene placement keeps its existing mob/boss exclusions", async () => {
  const { document, assets } = fixture();
  const playable = defineGame({ name: "Default placements", assets, scene: { editorLayers: document } });
  const ctx = createGameContext({ definition: playable.game, content: playable.content, player: { userId: "player", isNew: true } });
  const mounted = await mount(createElement(GameProvider, { context: ctx }, createElement(overlayOf(playable), { ctx })));
  try {
    expect(ctx.scene.object.ids()).toEqual(["spawn:player", "crate"]);
  } finally {
    await mounted?.unmount();
  }
});

test("changing the exclusion policy resolves newly eligible props without changing the document", async () => {
  const { document, assets } = fixture();
  const playable = defineGame({ name: "Placement policy", assets });
  const ctx = createGameContext({ definition: playable.game, content: playable.content, player: { userId: "player", isNew: true } });
  let mounted: MountedTestDraws | undefined;
  const render = async (excludeKinds: readonly string[]) => {
    const element = createElement(GameProvider, { context: ctx }, createElement(AuthoredObjects, { document, field: ctx.world.ground, excludeKinds }));
    if (mounted === undefined) mounted = await mount(element);
    else { await mounted.render(element); for (let i = 0; i < 3; i += 1) await mounted.advance(1 / 60); }
  };
  try {
    await render([...ENTITY_MARKER_KINDS, "player_spawn", "prop"]);
    expect(ctx.scene.object.ids()).toEqual([]);
    await render([...ENTITY_MARKER_KINDS, "player_spawn"]);
    expect(ctx.scene.object.ids()).toEqual(["crate"]);
  } finally {
    await mounted?.unmount();
  }
});

test("live synchronization removes excluded static placements while preserving the same-id game entity", async () => {
  const { document, assets } = fixture();
  const playable = defineGame({ name: "Live placement policy", assets });
  const ctx = createGameContext({ definition: playable.game, content: playable.content, player: { userId: "player", isNew: true } });
  ctx.scene.entity.spawn("knight", { id: "spawn:player", position: [0, 0, 0] });
  let mounted: MountedTestDraws | undefined;
  const render = async (excludeKinds: readonly string[], current = document) => {
    const element = createElement(GameProvider, { context: ctx }, createElement(AuthoredObjects, { document: current, field: ctx.world.ground, synchronize: true, excludeKinds }));
    if (mounted === undefined) mounted = await mount(element);
    else { await mounted.render(element); for (let i = 0; i < 3; i += 1) await mounted.advance(1 / 60); }
  };
  try {
    await render(ENTITY_MARKER_KINDS);
    expect(ctx.scene.object.ids()).toEqual(["spawn:player", "crate"]);
    await render([...ENTITY_MARKER_KINDS, "player_spawn"]);
    expect(ctx.scene.object.ids()).toEqual(["crate"]);
    expect(ctx.scene.entity.ids()).toEqual(["spawn:player"]);
    expect(ctx.scene.entity.get("spawn:player")!.position).toEqual([0, 0, 0]);
    await render([...ENTITY_MARKER_KINDS, "player_spawn"], { ...document, markers: document.markers.filter((marker) => marker.id !== "crate") });
    expect(ctx.scene.object.ids()).toEqual([]);
    expect(ctx.scene.entity.ids()).toEqual(["spawn:player"]);
  } finally {
    await mounted?.unmount();
  }
});

test("static animation placement rejects malformed saved overrides with located repairs and retains catalog playback", async () => {
  const { document, assets } = fixture();
  document.markers = [{ id: "character", kind: "prop", catalogId: "knight", position: { x: 2, y: 0, z: -3 }, meta: { verticalOffset: 0.25, animation: { clock: "calendar", auto: false, clip: 3 } } }];
  const saved = JSON.stringify(document);
  const catalog: ModelConfig = { url: "/knight.glb", animation: { states: { idle: "Idle", walk: "Walking_A" }, timeScale: 0.75 } };
  const playable = defineGame({ name: "Validated static character", assets });
  const ctx = createGameContext({ definition: playable.game, content: playable.content, player: { userId: "player", isNew: true } });
  const cache = new Map();
  let mounted: MountedTestDraws | undefined;
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { const message = args.join(" "); if (!message.startsWith("THREE.Clock:")) warnings.push(message); };
  const render = async (current = document, verticalOffset = 1, context = ctx) => {
    const element = createElement(GameProvider, { context }, createElement(AuthoredObjects, { document: current, field: context.world.ground, synchronize: true, verticalOffset }));
    if (mounted === undefined) mounted = await mount(element);
    else { await mounted.render(element); for (let i = 0; i < 3; i += 1) await mounted.advance(1 / 60); }
  };
  try {
    await render();
    const object = ctx.scene.object.get("character")!;
    expect(object.position).toEqual([2, 1.25, -3]);
    expect(object.animation).toBeUndefined();
    expect(resolveObjectModel(object, { knight: catalog }, assets, cache)).toBe(catalog);
    expect(warnings).toHaveLength(3);
    expect(warnings.join("\n")).toContain("markers[0].meta.animation.clock");
    expect(warnings.join("\n")).toContain("markers[0].meta.animation.auto");
    expect(warnings.join("\n")).toContain("markers[0].meta.animation.clip");
    expect(warnings.join("\n")).toContain("remove the animation override");
    await render();
    await render(document, 2);
    const replacementContext = createGameContext({ definition: playable.game, content: playable.content, player: { userId: "replacement", isNew: true } });
    await render(document, 1, replacementContext);
    expect(replacementContext.scene.object.ids()).toEqual(["character"]);
    expect(replacementContext.scene.object.get("character")!.position).toEqual([2, 1.25, -3]);
    expect(warnings).toHaveLength(3);
    expect(JSON.stringify(document)).toBe(saved);
    const animation = { clock: "game" as const, auto: true as const, states: {}, timeScale: -0.5, paused: true };
    const valid = { ...document, markers: document.markers.map(marker => ({ ...marker, meta: { ...marker.meta, animation } })) };
    await render(valid, 1, replacementContext);
    expect(replacementContext.scene.object.get("character")!.animation).toBe(animation);
    expect(resolveObjectModel(replacementContext.scene.object.get("character")!, { knight: catalog }, assets, cache)!.animation).toBe(animation);
    expect(warnings).toHaveLength(3);
    expect(JSON.stringify(document)).toBe(saved);
  } finally {
    await mounted?.unmount();
    console.warn = originalWarn;
  }
});
