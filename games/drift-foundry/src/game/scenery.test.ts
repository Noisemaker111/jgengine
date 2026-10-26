import { describe, expect, test } from "bun:test";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { runPlayScript } from "@jgengine/core/play/playRunner.draw";
import { game } from "../game.config";
import { EXIT_GATE_ARCH, GATE_BARRICADE_JUMP, GATE_BARRICADE_PLOW, PROP_YARD_LAMP, PROP_YARD_TOWER, TRACK_OBJECT, ZONE_PROP_IDS } from "./objects/catalog";

const TRACK_KINDS = new Set<string>(Object.values(TRACK_OBJECT));

describe("Drift Foundry's standing yard scenery", () => {
  test("every track prop is scenery, so the renderer batches it instead of drawing each one", () => {
    let ctx: GameContext | null = null;
    runPlayScript(game, { seed: "drift-scenery", dt: 1 / 60, ticks: 2, setup: (context) => { ctx = context; }, expect: [] });
    const scene = (ctx as GameContext | null)!.scene.object;
    const track = scene.ids().filter((id) => TRACK_KINDS.has(scene.get(id)!.catalogId));
    expect(track.length).toBeGreaterThan(1000);
    expect(track.filter((id) => scene.catalog(id)?.scenery !== true)).toEqual([]);
  });

  test("zone clutter, yard lamps and towers, barricades and the exit arch batch too, while pickups stay individual", () => {
    let ctx: GameContext | null = null;
    runPlayScript(game, { seed: "drift-scenery", dt: 1 / 60, ticks: 2, setup: (context) => { ctx = context; }, expect: [] });
    const scene = (ctx as GameContext | null)!.scene.object;
    const standing = new Set<string>([EXIT_GATE_ARCH, GATE_BARRICADE_JUMP, GATE_BARRICADE_PLOW, PROP_YARD_LAMP, PROP_YARD_TOWER, ...ZONE_PROP_IDS]);
    const placed = scene.ids().map((id) => scene.get(id)!);
    const dressing = placed.filter((object) => standing.has(object.catalogId));
    expect(dressing.length).toBeGreaterThan(50);
    expect(dressing.filter((object) => scene.catalog(object.instanceId)?.scenery !== true).map((object) => object.catalogId)).toEqual([]);
    const pickups = placed.filter((object) => object.catalogId.startsWith("pickup_"));
    expect(pickups.length).toBeGreaterThan(0);
    expect(pickups.filter((object) => scene.catalog(object.instanceId)?.scenery === true)).toEqual([]);
  });
});
