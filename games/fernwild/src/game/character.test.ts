import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { onboardingOf } from "@jgengine/core/onboarding/onboardingSystem";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { onNewPlayer, survivorStart, systems } from "../loop";
import { world } from "../world";
import { content } from "./content";
import { itemTraits } from "./data/items";
import { BAG, BAG_SLOTS, HOTBAR, HOTBAR_SLOTS } from "./bags";
import { characterSave, cleanLook, DEFAULT_LOOK, START_REGIONS, startArea, startRegion, survivorLook } from "./character";
import { bodies } from "./deathBody";
import { firstDay } from "./onboarding";

function runner(): HeadlessRunner {
  const definition = defineGameDefinition({
    name: "Fernwild (creator test)",
    multiplayer: "off",
    world,
    inventories: { [BAG]: { slots: BAG_SLOTS, traits: itemTraits }, [HOTBAR]: { slots: HOTBAR_SLOTS, traits: itemTraits } },
    systems: [...systems, firstDay],
    newGame: survivorStart,
    loop: { onNewPlayer },
  });
  return createHeadlessRunner({ definition, content, loop: definition.loop!, playerMovement: true, maxStepSeconds: 5 });
}

const tick = (game: HeadlessRunner, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) game.step(0.05);
};
const me = (game: HeadlessRunner) => game.ctx.scene.entity.get(game.userId)!;
const metresFrom = (game: HeadlessRunner, at: readonly number[]) => Math.hypot(me(game).position[0] - at[0]!, me(game).position[2] - at[2]!);

test("the spawn screen lists ARK's seven regions, easy in the south and hard in the north", () => {
  expect(START_REGIONS.map((region) => region.label)).toEqual(["South Zone 2", "South Zone 1", "South Zone 3", "East Zone 1", "East Zone 2", "North Zone 1", "North Zone 2"]);
  for (const region of START_REGIONS) {
    const expected = region.label.startsWith("South") ? "Easy" : region.label.startsWith("East") ? "Medium" : "Hard";
    expect(`${region.label}: ${region.difficulty}`).toBe(`${region.label}: ${expected}`);
  }
});

test("a made survivor wears the chosen body and height, wakes in the chosen region, and the path teaches there", () => {
  const game = runner();
  tick(game, 0.1);
  const north = startRegion("spawn_north_1")!;
  expect(metresFrom(game, north.position)).toBeGreaterThan(1000);

  game.ui.tryInvoke("createSurvivor", { name: "  Ada Lovelace ", body: "woman-1", height: 1.06, region: north.id });
  tick(game, 0.1);
  expect(survivorLook(game.ctx)).toEqual({ name: "Ada Lovelace", body: "woman-1", height: 1.06, region: north.id });
  expect(me(game).look).toBe("woman-1");
  expect(me(game).size).toBe(1.06);
  expect(metresFrom(game, north.position)).toBeLessThan(3);
  expect(me(game).rotationY).toBeCloseTo(north.rotationY, 3);
  expect(startArea(game.ctx).center).toEqual([north.position[0], north.position[2]]);

  // Far from that beach, the survivor's path points back to it, not to the south beach.
  game.ctx.scene.entity.setPose(game.userId, { position: [north.position[0] + 400, 5, north.position[2] + 300] });
  tick(game, 3);
  const pointing = onboardingOf(game.ctx)?.pointing();
  expect(pointing?.[0]).toBeCloseTo(north.position[0], 0);
  expect(pointing?.[2]).toBeCloseTo(north.position[2], 0);
});

test("after a death the survivor wakes back in the region they chose", () => {
  const game = runner();
  tick(game, 0.1);
  const east = startRegion("spawn_east_1")!;
  game.ui.tryInvoke("createSurvivor", { region: east.id });
  tick(game, 0.1);
  game.ui.tryInvoke("cheat", { goto: { cave: "cave_lower_south_cave", back: 30 } });
  tick(game, 0.1);
  expect(metresFrom(game, east.position)).toBeGreaterThan(300);
  game.ui.tryInvoke("cheat", { give: { stone: 5 }, kill: true });
  tick(game, 0.2);
  expect(bodies(game.ctx)).toHaveLength(1);
  expect(metresFrom(game, east.position)).toBeLessThan(3);
});

test("the save keeps who the survivor is and where they respawn", () => {
  const first = runner();
  tick(first, 0.1);
  first.ui.tryInvoke("createSurvivor", { name: "Rex", body: "man-2", height: 0.93, region: "spawn_south_3" });
  const saved = characterSave(first.ctx).snapshot();

  const second = runner();
  tick(second, 0.1);
  characterSave(second.ctx).hydrate(saved);
  expect(survivorLook(second.ctx)).toEqual({ name: "Rex", body: "man-2", height: 0.93, region: "spawn_south_3" });
  expect(me(second).look).toBe("man-2");
  second.ctx.scene.entity.resetToSpawn(second.userId);
  expect(metresFrom(second, startRegion("spawn_south_3")!.position)).toBeLessThan(3);
});

test("a creator choice is made safe: unknown body or region fall back, height stays on the slider, an empty name is Survivor", () => {
  expect(cleanLook({ name: "   ", body: "dragon" as never, height: 3, region: "moon" })).toEqual({ ...DEFAULT_LOOK, height: 1.1 });
  expect(cleanLook({ height: Number.NaN }).height).toBe(1);
  expect(cleanLook({ name: "x".repeat(60) }).name).toHaveLength(24);
});
