import { describe, expect, test } from "bun:test";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { runPlayScript } from "@jgengine/core/play/playRunner.draw";
import { game } from "../game.config";
import { TRACK_OBJECT } from "./objects/catalog";

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
});
