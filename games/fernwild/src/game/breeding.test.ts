import { describe, expect, test } from "bun:test";
import { createBreedingField } from "@jgengine/core/breeding/breeding";
import type { MateCandidate } from "@jgengine/core/breeding/breeding";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { editorLayers } from "../editorLayers";
import { onNewPlayer, survivorStart, systems } from "../loop";
import { time, world } from "../world";
import { BAG, BAG_SLOTS, HOTBAR, HOTBAR_SLOTS } from "./bags";
import { babyStage, breedingCard, breedingView, eggs } from "./breeding";
import { content } from "./content";
import { creatureCard, genesOf, tames } from "./creatures";
import { breedingOf, CARE_INTERVAL, CARE_KINDS, IMPRINT_BONUS, MULTIPLES, NEWBORN_SIZE } from "./data/breeding";
import { itemTraits } from "./data/items";
import { WILD_STATS } from "./data/species";

function runner(): HeadlessRunner {
  const definition = defineGameDefinition({
    name: "Fernwild (breeding test)",
    multiplayer: "off",
    world,
    time,
    authoredDocument: editorLayers,
    inventories: { [BAG]: { slots: BAG_SLOTS, traits: itemTraits }, [HOTBAR]: { slots: HOTBAR_SLOTS, traits: itemTraits } },
    systems,
    newGame: survivorStart,
    loop: { onNewPlayer },
  });
  return createHeadlessRunner({ definition, content, loop: definition.loop!, playerMovement: true });
}

const tick = (game: HeadlessRunner, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) game.step(0.05);
};

/** A tamed pair of `species` with mating on, side by side in front of the survivor. */
function pair(game: HeadlessRunner, species: string): { mother: string; father: string } {
  game.ui.tryInvoke("cheat", { summon: { species, level: 20, distance: 5, side: -1, sex: "female", tamed: true, mating: true } });
  game.ui.tryInvoke("cheat", { summon: { species, level: 20, distance: 5, side: 1, sex: "male", tamed: true, mating: true } });
  tick(game, 0.1);
  const pairOf = tames(game.ctx).filter((tame) => tame.species === species);
  return { mother: pairOf.find((tame) => tame.sex === "female")!.id, father: pairOf.find((tame) => tame.sex === "male")!.id };
}

/** Put an item in hotbar slot 1, hold it and place it ahead. */
function build(game: HeadlessRunner, itemId: string): void {
  game.ctx.player.inventory.put(HOTBAR, itemId, 1);
  game.ctx.item.use.use({ from: game.userId, itemId, inventoryId: HOTBAR });
  tick(game, 0.1);
  game.ui.tryInvoke("fire", { yaw: game.ctx.scene.entity.get(game.userId)!.rotationY });
  tick(game, 0.3);
}

/** Turn the survivor to look at a creature, so E reaches it. */
function face(game: HeadlessRunner, id: string): void {
  const me = game.ctx.scene.entity.get(game.userId)!;
  const it = game.ctx.scene.entity.get(id)!;
  game.ctx.scene.entity.setPose(game.userId, { position: me.position, rotationY: Math.atan2(it.position[0] - me.position[0], it.position[2] - me.position[2]) });
}

test("every Island species that breeds in ARK has its wiki times; the sterile and non-breeding ones do not", () => {
  expect(breedingOf("raptor", 1)).toMatchObject({ mode: "egg", incubation: [20, 28], carrySeconds: 7140, maturationSeconds: 133_320 });
  expect(breedingOf("phiomia", 1)).toMatchObject({ mode: "carry", incubation: null, carrySeconds: 35_700 });
  expect(breedingOf("rex", 1)?.incubation).toEqual([32, 34]);
  for (const sterile of ["titanoboa", "leech", "titanomyrma", "meganeura"]) expect(breedingOf(sterile, 1)).toBeNull();
});

test("a raptor pair left together mates and lays an egg that a campfire keeps warm; the baby hatches small, grows, eats and imprints", () => {
  const game = runner();
  tick(game, 0.1);
  // Night on the beach: too cold for a raptor egg without a fire.
  game.ui.tryInvoke("cheat", { clock: 3500 });
  const { mother, father } = pair(game, "raptor");
  expect(creatureCard(game.ctx, mother)?.sex).toBe("female");
  tick(game, 30);
  expect(breedingCard(game.ctx, mother)?.mating).toBeGreaterThan(0.3);
  expect(breedingView(game.ctx).mating).toBe(true);
  tick(game, 32);
  expect(eggs(game.ctx).length).toBeGreaterThanOrEqual(1);
  expect(breedingCard(game.ctx, mother)!.cooldown).toBeGreaterThan(18 * 3600 - 100);
  expect(breedingView(game.ctx).egg!.temperature).toBeLessThan(20);
  // Out of its temperature the egg goes nowhere and loses health.
  game.ui.tryInvoke("cheat", { breedingSpeed: 1000 });
  tick(game, 5);
  expect(breedingView(game.ctx).egg!.progress).toBe(0);
  expect(breedingView(game.ctx).egg!.health).toBeLessThan(1);
  // A campfire a few metres off brings it into range (right beside, a raptor egg is too hot); at a thousandfold speed
  // it hatches in seconds.
  const egg = eggs(game.ctx)[0]!;
  game.ctx.scene.entity.setPose(game.userId, { position: [egg.at[0] + 8, egg.at[1], egg.at[2]], rotationY: -Math.PI / 2 });
  build(game, "campfire");
  tick(game, 1);
  const warm = breedingView(game.ctx).egg!.temperature;
  expect(warm).toBeGreaterThanOrEqual(20);
  expect(warm).toBeLessThanOrEqual(28);
  for (let t = 0; t < 30 && breedingView(game.ctx).babies === 0; t += 0.5) tick(game, 0.5);
  const view = breedingView(game.ctx);
  expect(view.babies).toBeGreaterThanOrEqual(1);
  const baby = view.baby!;
  expect(baby.size).toBeLessThan(0.4);
  expect(baby.size).toBeGreaterThanOrEqual(NEWBORN_SIZE);

  // Each stat whole from one parent (or two levels up by a mutation).
  const mum = genesOf(game.ctx, mother)!;
  const dad = genesOf(game.ctx, father)!;
  const genes = genesOf(game.ctx, baby.id)!;
  for (const stat of WILD_STATS) expect([mum.wild[stat], dad.wild[stat], mum.wild[stat] + 2, dad.wild[stat] + 2]).toContain(genes.wild[stat]);
  expect(creatureCard(game.ctx, baby.id)?.tamed).toBe(true);

  // A newborn starts nearly empty and starves without meat; meat put in its inventory feeds it. At ARK's speed so it
  // stays a newborn while its food runs out.
  game.ui.tryInvoke("cheat", { breedingSpeed: 1 });
  const before = game.ctx.scene.entity.stats.get(baby.id, "health")!.current;
  for (let t = 0; t < 300 && breedingCard(game.ctx, baby.id)!.baby!.food > 0; t += 1) tick(game, 1);
  tick(game, 2);
  expect(breedingCard(game.ctx, baby.id)!.baby!.food).toBe(0);
  const starving = game.ctx.scene.entity.stats.get(baby.id, "health")!.current;
  expect(starving).toBeLessThan(before);
  game.ctx.scene.entity.setPose(baby.id, { position: [game.ctx.scene.entity.get(game.userId)!.position[0], egg.at[1], game.ctx.scene.entity.get(game.userId)!.position[2] + 2.5] });
  face(game, baby.id);
  tick(game, 0.2);
  game.ui.tryInvoke("creatureUse", {});
  tick(game, 0.1);
  game.ctx.player.inventory.put(BAG, "raw_meat", 10);
  const meatSlot = game.ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot?.itemId === "raw_meat");
  game.ui.tryInvoke("giveCreature", { inventoryId: BAG, slot: meatSlot });
  tick(game, 1);
  expect(breedingCard(game.ctx, baby.id)!.baby!.food).toBeGreaterThan(0);
  expect(game.ctx.scene.entity.stats.get(baby.id, "health")!.current).toBe(starving);
  game.ui.tryInvoke("closeCreature", {});
  game.ui.tryInvoke("cheat", { breedingSpeed: 1000 });

  // It asks for care; a cuddle when it wants one adds imprint, and the imprint lifts its health.
  for (let t = 0; t < 60 && breedingCard(game.ctx, baby.id)!.baby!.wants === null; t += 0.5) tick(game, 0.5);
  const wants = breedingCard(game.ctx, baby.id)!.baby!.wants;
  expect(wants).not.toBeNull();
  const healthMax = game.ctx.scene.entity.stats.get(baby.id, "health")!.max;
  const me = game.ctx.scene.entity.get(game.userId)!.position;
  if (wants!.startsWith("A walk")) {
    // Whistled to follow, it trails the survivor along the beach.
    game.ui.tryInvoke("whistleFollow", {});
    for (let step = 0; step < 40 && breedingCard(game.ctx, baby.id)!.baby!.wants !== null; step += 1) {
      const at = game.ctx.scene.entity.get(game.userId)!.position;
      game.ctx.scene.entity.setPose(game.userId, { position: [at[0] - 1.5, at[1], at[2]], rotationY: -Math.PI / 2 });
      tick(game, 0.5);
    }
  } else {
    // A cuddle, or its favourite food from the survivor's bag: E in front of it.
    game.ctx.player.inventory.put(BAG, "raw_meat", 5);
    game.ctx.scene.entity.setPose(baby.id, { position: [me[0], egg.at[1], me[2] + 2] });
    face(game, baby.id);
    tick(game, 0.2);
    game.ui.tryInvoke("careForBaby", {});
    tick(game, 0.1);
  }
  const imprint = breedingCard(game.ctx, baby.id)!.baby!.imprint;
  expect(imprint).toBeCloseTo(28_800 / 133_320, 3);
  expect(game.ctx.scene.entity.stats.get(baby.id, "health")!.max).toBeCloseTo(healthMax * (1 + IMPRINT_BONUS * imprint), 0);
  // At this speed it grows up within its 37 hours / 1000.
  for (let t = 0; t < 200 && breedingView(game.ctx).babies > 0; t += 1) {
    game.ctx.scene.entity.stats.set(baby.id, "health", { current: 1e9 });
    tick(game, 1);
  }
  expect(game.ctx.scene.entity.get(baby.id)?.size).toBe(1);
});

test("a phiomia carries her young and gives birth beside her", () => {
  const game = runner();
  tick(game, 0.1);
  const { mother } = pair(game, "phiomia");
  tick(game, 62);
  expect(eggs(game.ctx)).toHaveLength(0);
  expect(breedingCard(game.ctx, mother)!.pregnancy).not.toBeNull();
  game.ui.tryInvoke("cheat", { breedingSpeed: 1000 });
  for (let t = 0; t < 60 && breedingView(game.ctx).babies === 0; t += 0.5) tick(game, 0.5);
  expect(breedingView(game.ctx).babies).toBeGreaterThanOrEqual(1);
  expect(breedingCard(game.ctx, mother)!.pregnancy).toBeNull();
  expect(breedingCard(game.ctx, mother)!.cooldown).toBeGreaterThan(0);
});

/** A fixed rng stream, so the same field gives the same eggs and care requests. */
function rngOf(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

/** ARK's breeding on paper, with Fernwild's own species times and care kinds; no world. */
const field = (multiples = { twins: 0, triplets: 0 }) =>
  createBreedingField<{ from: string }>({
    species: (id) => breedingOf(id, 1),
    conceive: (mother, father) => ({ from: `${mother}+${father}` }),
    careIntervalSeconds: CARE_INTERVAL,
    careKinds: CARE_KINDS,
    multiples,
  });

const mates = (gap: number, species = "raptor", who = "her", mate = "him"): MateCandidate[] => [
  { id: who, species, sex: "female", at: [0, 0, 0] },
  { id: mate, species, sex: "male", at: [gap, 0, 0] },
];

describe("breeding field", () => {
  test("a raptor pair kept together for the mating time lays an egg; apart, the bar starts over; then she rests", () => {
    const breeding = field();
    const rng = rngOf(3);
    breeding.mate(mates(3), 0, 30, rng);
    expect(breeding.matingProgress("her")).toBeCloseTo(0.5, 6);
    // Walked apart: the bar is gone.
    breeding.mate(mates(10), 30, 1, rng);
    expect(breeding.matingProgress("her")).toBeNull();
    // A male of another kind does nothing.
    expect(breeding.mate([{ id: "her", species: "raptor", sex: "female", at: [0, 0, 0] }, { id: "x", species: "phiomia", sex: "male", at: [1, 0, 0] }], 31, 60, rng)).toEqual([]);
    breeding.mate(mates(3), 40, 30, rng);
    const events = breeding.mate(mates(3), 70, 30, rng);
    expect(events.map((event) => event.type)).toEqual(["conceived", "laid"]);
    expect(breeding.eggs()).toHaveLength(1);
    expect(breeding.eggs()[0]?.baby).toEqual({ from: "her+him" });
    // ARK's 18 to 48 hours before she mates again.
    expect(breeding.cooldown("her", 70)).toBeGreaterThanOrEqual(64_800);
    expect(breeding.cooldown("her", 70)).toBeLessThanOrEqual(172_800);
    expect(breeding.mate(mates(3), 100, 120, rng)).toEqual([]);
  });

  test("a raptor egg hatches only in its temperature, and out of it loses health until it is lost", () => {
    const breeding = field();
    const rng = rngOf(5);
    breeding.mate(mates(2), 0, 61, rng);
    const warm = () => 24;
    for (let t = 0; t < 3570; t += 10) expect(breeding.tick(t, 10, warm, rng)).toEqual([]);
    expect(breeding.eggs()[0]?.progress).toBeCloseTo(0.5, 2);
    // Too cold: no progress, health falls.
    breeding.tick(3570, 300, () => 10, rng);
    expect(breeding.eggs()[0]?.progress).toBeCloseTo(0.5, 2);
    expect(breeding.eggs()[0]?.health).toBeCloseTo(0.5, 6);
    let hatched: string | null = null;
    for (let t = 3870; t < 8000 && hatched === null; t += 10) hatched = breeding.tick(t, 10, warm, rng).find((event) => event.type === "hatched")?.type ?? null;
    expect(hatched).toBe("hatched");
    expect(breeding.eggs()).toHaveLength(0);
    // A second egg left in the snow is lost after its ten minutes.
    breeding.mate(mates(2), 200_000, 61, rng);
    const lost = breeding.tick(200_100, 600, () => -10, rng);
    expect(lost.map((event) => event.type)).toEqual(["eggLost"]);
  });

  test("a phiomia carries for its gestation and gives birth, then rests", () => {
    const breeding = field();
    const rng = rngOf(7);
    const events = breeding.mate(mates(4, "phiomia"), 0, 61, rng);
    expect(events.map((event) => event.type)).toEqual(["conceived"]);
    expect(breeding.eggs()).toHaveLength(0);
    expect(breeding.pregnancy("her")?.progress).toBe(0);
    expect(breeding.tick(35_000, 35_000, () => 0, rng)).toEqual([]);
    const born = breeding.tick(35_700, 700, () => 0, rng);
    expect(born).toEqual([{ type: "born", mother: "her", species: "phiomia", baby: { from: "her+him" } }]);
    expect(breeding.pregnancy("her")).toBeNull();
    expect(breeding.cooldown("her", 35_700)).toBeGreaterThan(0);
  });

  test("a baby grows through ARK's stages, asks for care every interval, and answering every request imprints it fully", () => {
    const breeding = field();
    const rng = rngOf(11);
    breeding.raise("baby", "raptor", 0);
    expect(babyStage(0.05)).toBe("baby");
    expect(babyStage(0.2)).toBe("juvenile");
    expect(babyStage(0.7)).toBe("adolescent");
    let asked = 0;
    let imprint = 0;
    let grown: number | null = null;
    for (let t = 0; t <= 140_000 && grown === null; t += 60) {
      for (const event of breeding.tick(t, 60, () => 0, rng)) {
        if (event.type === "wants") {
          asked += 1;
          // Wrong care does nothing; the asked one adds interval / maturation.
          expect(breeding.care("baby", event.care === "cuddle" ? "walk" : "cuddle")).toBe(0);
          imprint += breeding.care("baby", event.care);
        }
        if (event.type === "grown") grown = event.bond;
      }
    }
    // 37 hours of growing, a request every 8: four asked, each 28800 / 133320 of the whole.
    expect(asked).toBe(4);
    expect(imprint).toBeCloseTo((4 * 28_800) / 133_320, 6);
    expect(grown).toBeCloseTo(imprint, 6);
    expect(breeding.baby("baby")).toBeNull();
  });

  test("faster paces shorten everything, and the save keeps eggs, pregnancies and babies", () => {
    const breeding = field();
    const rng = rngOf(13);
    breeding.setSpeeds({ carry: 10, grow: 10, bond: 10, pair: 10 });
    breeding.mate(mates(2), 0, 61, rng);
    expect(breeding.cooldown("her", 0)).toBeLessThanOrEqual(17_280);
    const hatched = breeding.tick(714, 714, () => 25, rng);
    expect(hatched.map((event) => event.type)).toEqual(["hatched"]);
    breeding.raise("baby", "raptor", 714);
    breeding.mate(mates(2, "phiomia", "her2", "him2"), 714, 61, rng);
    const copy = field();
    copy.restore(breeding.snapshot());
    expect(copy.baby("baby")?.nextCareAt).toBeCloseTo(714 + 2880, 6);
    expect(copy.pregnancy("her2")?.species).toBe("phiomia");
    expect(copy.speeds().grow).toBe(10);
    copy.forget("baby");
    expect(copy.babies()).toHaveLength(0);
    expect(() => breeding.raise("x", "titanoboa", 0)).toThrow("cannot breed");
  });

  test("twins and triplets come at ARK's odds", () => {
    const breeding = field(MULTIPLES);
    const rng = rngOf(17);
    const litters = [0, 0, 0];
    for (let n = 0; n < 4000; n += 1) {
      const conceived = breeding.mate(mates(2), n * 1e7, 61, rng).find((event) => event.type === "conceived");
      if (conceived?.type === "conceived") {
        const index = conceived.count - 1;
        litters[index] = (litters[index] ?? 0) + 1;
      }
    }
    expect((litters[1] ?? 0) / 4000).toBeGreaterThan(0.08);
    expect((litters[1] ?? 0) / 4000).toBeLessThan(0.12);
    expect((litters[2] ?? 0) / 4000).toBeGreaterThan(0.01);
    expect((litters[2] ?? 0) / 4000).toBeLessThan(0.03);
  });
});
