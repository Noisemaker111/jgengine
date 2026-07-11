import { describe, expect, test } from "bun:test";
import { defineGame } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { CELL, makeBuilding } from "../catalog";
import { content } from "../content";
import { controlDisabledReason } from "./applicability";
import {
  cityBuildings,
  cityPlazas,
  futureDepth,
  historyDepth,
  selectedBuilding,
  selectedId,
} from "./state";
import { onInit } from "../../loop";

function makeContext() {
  const ctx = createGameContext({
    definition: defineGame({ name: "Monument", assets: createAssetCatalog(), multiplayer: "off" }),
    content,
    player: { userId: "architect", isNew: true },
  });
  onInit(ctx);
  return ctx;
}

const sceneIds = (ctx: ReturnType<typeof makeContext>) =>
  new Set(ctx.scene.object.list().map((object) => object.instanceId));

describe("city state", () => {
  test("init seeds the starter district with scene-object mirrors", () => {
    const ctx = makeContext();
    expect(cityBuildings(ctx).length).toBe(11);
    const ids = sceneIds(ctx);
    for (const b of cityBuildings(ctx)) expect(ids.has(b.id)).toBe(true);
  });

  test("placing builds on a free lot and rejects a claimed one", () => {
    const ctx = makeContext();
    ctx.game.commands.run("toolHousing", {});
    ctx.game.commands.run("site.pointer", { point: { x: 4 * CELL, y: 0, z: 4 * CELL }, entity: null, object: null });
    expect(cityBuildings(ctx).length).toBe(12);
    expect(selectedBuilding(ctx)?.program).toBe("housing");
    const before = cityBuildings(ctx).length;
    ctx.game.commands.run("site.pointer", { point: { x: 4 * CELL, y: 0, z: 4 * CELL }, entity: null, object: null });
    expect(cityBuildings(ctx).length).toBe(before);
  });

  test("plaza kinds cycle garden, water, forum", () => {
    const ctx = makeContext();
    ctx.game.commands.run("toolPlaza", {});
    for (const [gx, gz] of [
      [4, 4],
      [-4, 4],
      [4, -4],
    ]) {
      ctx.game.commands.run("site.pointer", { point: { x: gx * CELL, y: 0, z: gz * CELL }, entity: null, object: null });
    }
    expect(cityPlazas(ctx).map((p) => p.kind)).toEqual(["garden", "water", "forum"]);
    expect(cityPlazas(ctx).every((p) => p.trees === 6)).toBe(true);
  });

  test("demolish and undo round-trip, including the scene mirror", () => {
    const ctx = makeContext();
    const victim = cityBuildings(ctx)[0];
    ctx.game.commands.run("site.demolish", { id: victim.id });
    expect(cityBuildings(ctx).length).toBe(10);
    expect(sceneIds(ctx).has(victim.id)).toBe(false);
    ctx.game.commands.run("undo", {});
    expect(cityBuildings(ctx).length).toBe(11);
    expect(sceneIds(ctx).has(victim.id)).toBe(true);
    ctx.game.commands.run("redo", {});
    expect(cityBuildings(ctx).length).toBe(10);
    expect(sceneIds(ctx).has(victim.id)).toBe(false);
  });

  test("a slider drag is one undo step", () => {
    const ctx = makeContext();
    const target = cityBuildings(ctx)[1];
    const initialHeight = target.height;
    const depthBefore = historyDepth(ctx);
    ctx.game.commands.run("building.update", { id: target.id, patch: {}, capture: true });
    for (const height of [40, 48, 56, 64]) {
      ctx.game.commands.run("building.update", { id: target.id, patch: { height }, capture: false });
    }
    expect(historyDepth(ctx)).toBe(depthBefore + 1);
    expect(cityBuildings(ctx).find((b) => b.id === target.id)?.height).toBe(64);
    ctx.game.commands.run("undo", {});
    expect(cityBuildings(ctx).find((b) => b.id === target.id)?.height).toBe(initialHeight);
    expect(futureDepth(ctx)).toBe(1);
  });

  test("grow sibling clones onto a clear lot with bounded variation", () => {
    const ctx = makeContext();
    const parent = cityBuildings(ctx)[3];
    ctx.game.commands.run("building.duplicate", { id: parent.id });
    const clone = selectedBuilding(ctx);
    if (clone === null) throw new Error("sibling did not grow");
    expect(clone.id).not.toBe(parent.id);
    expect(clone.typology).toBe(parent.typology);
    expect(Math.abs(clone.x - parent.x) + Math.abs(clone.z - parent.z)).toBeGreaterThan(0);
    expect(clone.height).toBeGreaterThanOrEqual(12);
    expect(clone.articulation).toBeGreaterThanOrEqual(0);
    expect(clone.articulation).toBeLessThanOrEqual(100);
    expect(sceneIds(ctx).has(clone.id)).toBe(true);
  });

  test("pointer select and demolish tools resolve object hits", () => {
    const ctx = makeContext();
    const target = cityBuildings(ctx)[2];
    ctx.game.commands.run("toolSelect", {});
    ctx.game.commands.run("site.pointer", { point: { x: target.x, y: 0, z: target.z }, entity: null, object: target.id });
    expect(selectedId(ctx)).toBe(target.id);
    ctx.game.commands.run("toolDemolish", {});
    ctx.game.commands.run("site.pointer", { point: { x: target.x, y: 0, z: target.z }, entity: null, object: target.id });
    expect(cityBuildings(ctx).some((b) => b.id === target.id)).toBe(false);
    expect(selectedId(ctx)).toBeNull();
  });
});

describe("control applicability", () => {
  test("mirrors the source contract", () => {
    const ctx = makeContext();
    const buildings = cityBuildings(ctx);
    const ring = makeBuilding("ring-probe", 0, 0, "culture", "forum", 0);
    const bar = buildings.find((b) => b.composition === "bar");
    if (bar === undefined) throw new Error("starter district lost its grammar spread");
    expect(controlDisabledReason(ring, "branches")).toBeDefined();
    expect(controlDisabledReason(ring, "rhythm")).toBeUndefined();
    expect(controlDisabledReason(bar, "voids")).toBeDefined();
    expect(controlDisabledReason(bar, "rhythm")).toBeDefined();
    expect(controlDisabledReason({ ...bar, profile: "straight" }, "taper")).toBeDefined();
    expect(controlDisabledReason({ ...bar, profile: "tapered" }, "taper")).toBeUndefined();
  });
});
