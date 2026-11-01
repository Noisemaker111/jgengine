import { createBreedingField, type BreedingField, type BreedingSnapshot, type BreedingSpeeds } from "@jgengine/core/breeding/breeding";
import { inheritValues } from "@jgengine/core/inheritance/inheritance";
import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { BAG, HOTBAR } from "./bags";
import { climateAt } from "./climate";
import { aimedCreature, creatureAlive, foodMaxOf, genesOf, setImprint, spawnBaby, takeFromCreatureInventory, tames, viewedCreature, type CreatureGenes } from "./creatures";
import {
  BABY_FOOD_DRAIN_SECONDS,
  breedingOf,
  BREEDING_STAGES,
  incubationBand,
  CARE_INTERVAL,
  CARE_KINDS,
  CREATURE_FOOD,
  litterOf,
  MUTATIONS,
  NEWBORN_FOOD,
  NEWBORN_SIZE,
  WALK_METRES,
} from "./data/breeding";
import { itemLabel } from "./data/items";
import { speciesDef, WILD_STATS } from "./data/species";

/** How close the survivor stands to a baby to cuddle or feed it. */
const CARE_REACH = 4;

/** What a hungry baby wants fed by hand: ARK's kibble, here its kind's favourite food. */
function favouriteFood(species: string): string {
  return speciesDef(species)?.diet === "carnivore" ? "raw_meat" : "mejoberry";
}

interface Nursery {
  field: BreedingField<CreatureGenes>;
  /** Each baby's food, while it grows. */
  food: Map<string, number>;
  /** Metres each baby asking for a walk has followed the survivor, and where it last stood. */
  walked: Map<string, { metres: number; x: number; z: number }>;
}

const nurseryOf = perContext(
  (ctx: GameContext): Nursery => ({
    field: createBreedingField<CreatureGenes>({
      species: (id) => {
        const def = speciesDef(id);
        return def === null ? null : breedingOf(id, def.radius);
      },
      conceive(mother, father, rng) {
        const mum = genesOf(ctx, mother)!;
        const dad = genesOf(ctx, father)!;
        const inherited = inheritValues(mum.wild, dad.wild, rng, { defaultRule: { pick: "either", higherChance: 0.55 }, mutation: { ...MUTATIONS, fields: WILD_STATS } });
        return { sex: rng() < 0.5 ? "female" : "male", wild: inherited.values, mutations: mum.mutations + dad.mutations + inherited.mutations.length };
      },
      careIntervalSeconds: CARE_INTERVAL,
      careKinds: CARE_KINDS,
      stages: BREEDING_STAGES,
      litter: litterOf,
    }),
    food: new Map(),
    walked: new Map(),
  }),
);

const label = (species: string) => speciesDef(species)?.label ?? species;

function bringIntoWorld(ctx: GameContext, species: string, at: readonly [number, number, number], genes: CreatureGenes): void {
  const nursery = nurseryOf(ctx);
  const id = spawnBaby(ctx, species, [at[0], at[2]], genes, NEWBORN_SIZE);
  if (id === null) return;
  nursery.field.raise(id, species, ctx.time.now());
  nursery.food.set(id, foodMaxOf(ctx, id) * NEWBORN_FOOD);
}

/** Baby food: it drains fast while small, the baby eats what it is given, and starves without. */
function feedBaby(ctx: GameContext, id: string, species: string, matured: number, dt: number): void {
  const nursery = nurseryOf(ctx);
  const max = foodMaxOf(ctx, id);
  let food = (nursery.food.get(id) ?? 0) - (max / BABY_FOOD_DRAIN_SECONDS) * (1 - matured) * dt;
  const diet = speciesDef(species)?.diet;
  for (const [item, value] of Object.entries(CREATURE_FOOD)) {
    if (value.diet !== diet) continue;
    while (food + value.food <= max && takeFromCreatureInventory(ctx, id, item)) food += value.food;
  }
  if (food <= 0) {
    food = 0;
    // Starving: about a hundredth of its health a second (approximate).
    const health = ctx.scene.entity.stats.get(id, "health");
    if (health !== null) ctx.scene.entity.stats.set(id, "health", { current: health.current - (health.max / 100) * dt });
  }
  nursery.food.set(id, food);
}

/** Mating, eggs, births and babies growing, each fixed tick. */
export function tickBreeding(ctx: GameContext, dt: number): void {
  const nursery = nurseryOf(ctx);
  const now = ctx.time.now();
  const all = tames(ctx);
  const growing = new Set(nursery.field.offspring().map((baby) => baby.id));
  const candidates = all.filter((tame) => tame.mating && !growing.has(tame.id));
  for (const event of nursery.field.mate(candidates, now, dt, ctx.rng)) {
    if (event.type === "conceived") {
      const carries = breedingOf(event.species, 1)?.egg === null;
      ctx.game.notices.push({ text: carries ? `Your ${label(event.species)} is pregnant` : `Your ${label(event.species)}s mated`, tone: "success" });
    } else if (event.type === "laid") {
      const band = incubationBand(event.egg.species)?.join("–") ?? "";
      ctx.game.notices.push({ text: `A fertilized ${label(event.egg.species)} egg was laid. Keep it ${band} °C`, tone: "success" });
    }
  }
  for (const event of nursery.field.tick(now, dt, (at) => climateAt(ctx, at).temperature, ctx.rng)) {
    if (event.type === "hatched") {
      bringIntoWorld(ctx, event.egg.species, event.egg.at, event.egg.offspring);
      ctx.game.notices.push({ text: `A baby ${label(event.egg.species)} hatched!`, tone: "success" });
    } else if (event.type === "eggLost") {
      const band = incubationBand(event.egg.species);
      const temperature = climateAt(ctx, event.egg.at).temperature;
      const tooCold = band !== null && temperature < band[0];
      ctx.game.notices.push({ text: `A ${label(event.egg.species)} egg was too ${tooCold ? "cold" : "hot"} and is lost`, tone: "deny" });
    } else if (event.type === "born") {
      // A mother who died carrying takes her baby with her.
      const mother = all.find((tame) => tame.id === event.mother);
      if (mother === undefined) continue;
      bringIntoWorld(ctx, event.species, mother.at, event.offspring);
      ctx.game.notices.push({ text: `A baby ${label(event.species)} was born!`, tone: "success" });
    } else if (event.type === "wants") {
      const baby = nursery.field.offspringOf(event.offspring);
      if (event.care === "walk") nursery.walked.delete(event.offspring);
      ctx.game.notices.push({ text: `Your baby ${label(baby?.species ?? "")} wants ${event.care === "feed" ? itemLabel(favouriteFood(baby?.species ?? "")) : `a ${event.care}`}`, tone: "info" });
    } else if (event.type === "grown") {
      ctx.scene.entity.update(event.offspring, { size: 1 });
      nursery.food.delete(event.offspring);
      nursery.walked.delete(event.offspring);
      ctx.game.notices.push({ text: `Your bred tame is fully grown, ${Math.round(event.bond * 100)}% imprinted`, tone: "success" });
    }
  }
  for (const baby of nursery.field.offspring()) {
    if (!creatureAlive(ctx, baby.id)) {
      nursery.field.forget(baby.id);
      nursery.food.delete(baby.id);
      nursery.walked.delete(baby.id);
      continue;
    }
    const size = NEWBORN_SIZE + (1 - NEWBORN_SIZE) * baby.matured;
    const entity = ctx.scene.entity.get(baby.id);
    if (entity !== null && Math.abs((entity.size ?? 1) - size) > 0.005) ctx.scene.entity.update(baby.id, { size });
    feedBaby(ctx, baby.id, baby.species, baby.matured, dt);
    if (baby.wants === "walk" && entity !== null && all.find((tame) => tame.id === baby.id)?.following === true) {
      const walk = nursery.walked.get(baby.id) ?? { metres: 0, x: entity.position[0], z: entity.position[2] };
      walk.metres += Math.hypot(entity.position[0] - walk.x, entity.position[2] - walk.z);
      walk.x = entity.position[0];
      walk.z = entity.position[2];
      nursery.walked.set(baby.id, walk);
      if (walk.metres >= WALK_METRES) giveCare(ctx, baby.id, "walk");
    }
  }
}

function giveCare(ctx: GameContext, id: string, kind: string): void {
  const nursery = nurseryOf(ctx);
  const gained = nursery.field.care(id, kind);
  if (gained <= 0) return;
  const isBaby = nursery.field.offspringOf(id);
  if (isBaby === null) return;
  setImprint(ctx, id, isBaby.bond);
  ctx.scene.entity.floatText({ instanceId: id, text: `Imprinting ${Math.round(isBaby.bond * 100)}%`, kind: "pickup" });
}

/** The baby in front of the survivor, close enough to cuddle or feed. */
function babyInReach(ctx: GameContext) {
  const id = aimedCreature(ctx);
  const baby = id === null ? null : nurseryOf(ctx).field.offspringOf(id);
  const me = ctx.scene.entity.get(ctx.player.userId);
  const entity = id === null ? null : ctx.scene.entity.get(id);
  if (baby === null || me === null || entity === null) return null;
  return Math.hypot(entity.position[0] - me.position[0], entity.position[2] - me.position[2]) <= CARE_REACH ? { baby, at: entity.position } : null;
}

/** E on a baby asking for a cuddle, or for food the survivor carries: give it. */
export function careForBaby(ctx: GameContext): void {
  const near = babyInReach(ctx);
  if (near === null || near.baby.wants === null) return;
  if (near.baby.wants === "cuddle") giveCare(ctx, near.baby.id, "cuddle");
  else if (near.baby.wants === "feed") {
    const food = favouriteFood(near.baby.species);
    const from = [BAG, HOTBAR].find((inventory) => ctx.player.inventory.count(inventory, food) > 0);
    if (from === undefined) {
      ctx.game.notices.push({ text: `It wants ${itemLabel(food)}, and you have none`, tone: "deny" });
      return;
    }
    ctx.player.inventory.take(from, food, 1);
    giveCare(ctx, near.baby.id, "feed");
  }
}

export function breedingPrompts(ctx: GameContext): PositionedPrompt[] {
  const near = babyInReach(ctx);
  if (near === null || (near.baby.wants !== "cuddle" && near.baby.wants !== "feed")) return [];
  const text = near.baby.wants === "cuddle" ? `Cuddle the baby ${label(near.baby.species)}` : `Feed the baby ${label(near.baby.species)} ${itemLabel(favouriteFood(near.baby.species))}`;
  return [{ id: `baby:${near.baby.id}`, position: { x: near.at[0], z: near.at[2] }, priority: 3, prompt: proximityPrompt({ radius: CARE_REACH + 1, display: keybind("interact", text), invoke: command("careForBaby") }) }];
}

/** Every egg lying in the world, for drawing. */
export function eggs(ctx: GameContext) {
  return nurseryOf(ctx).field.eggs();
}

/** ARK's breeding multipliers as an admin setting: hatch, maturation, mating interval and care all this much faster. */
export function setBreedingSpeed(ctx: GameContext, multiplier: number): void {
  const speed = Math.max(0.001, multiplier);
  const speeds: BreedingSpeeds = { pair: speed, carry: speed, grow: speed, bond: speed };
  nurseryOf(ctx).field.setSpeeds(speeds);
}

/** Breeding for one creature, for its inventory screen: mating, pregnancy, or a baby's growing and imprint. */
export function breedingCard(ctx: GameContext, id: string) {
  const nursery = nurseryOf(ctx);
  const now = ctx.time.now();
  const tame = tames(ctx).find((entry) => entry.id === id);
  if (tame === undefined) return null;
  const def = breedingOf(tame.species, tame.radius);
  const baby = nursery.field.offspringOf(id);
  const pregnancy = nursery.field.pregnancy(id);
  const speeds = nursery.field.speeds();
  return {
    breeds: def !== null,
    mode: def === null ? null : def.egg === null ? "carry" : "egg",
    incubation: incubationBand(tame.species),
    mating: nursery.field.matingProgress(id),
    cooldown: Math.ceil(nursery.field.cooldown(id)),
    pregnancy: pregnancy === null || def === null ? null : { progress: pregnancy.progress, secondsLeft: Math.ceil(((1 - pregnancy.progress) * def.carrySeconds) / speeds.carry) },
    baby:
      baby === null || def === null
        ? null
        : {
            stage: baby.stage,
            matured: baby.matured,
            secondsLeft: Math.ceil(((1 - baby.matured) * def.maturationSeconds) / speeds.grow),
            imprint: baby.bond,
            wants: baby.wants === "feed" ? `Feed it ${itemLabel(favouriteFood(baby.species))}` : baby.wants === "cuddle" ? "A cuddle" : baby.wants === "walk" ? `A walk: whistle it to follow and walk ${WALK_METRES} m` : null,
            nextCare: Math.max(0, Math.ceil(baby.nextCareAt - now)),
            food: Math.round(nursery.food.get(id) ?? 0),
            foodMax: Math.round(foodMaxOf(ctx, id)),
          },
  };
}

export type BreedingCard = NonNullable<ReturnType<typeof breedingCard>>;

/** The open creature screen's breeding card, for the UI. */
export function viewedBreeding(ctx: GameContext): BreedingCard | null {
  const id = viewedCreature(ctx);
  return id === null ? null : breedingCard(ctx, id);
}

/** For probes and the HUD: eggs lying, the nearest one's incubation and health, and babies growing with their imprint. */
export function breedingView(ctx: GameContext) {
  const nursery = nurseryOf(ctx);
  const me = ctx.scene.entity.get(ctx.player.userId);
  let nearest: { progress: number; health: number; temperature: number } | null = null;
  let best = Infinity;
  for (const egg of nursery.field.eggs()) {
    const distance = me === null ? 0 : Math.hypot(egg.at[0] - me.position[0], egg.at[2] - me.position[2]);
    if (distance < best) {
      best = distance;
      nearest = { progress: egg.progress, health: egg.health, temperature: climateAt(ctx, egg.at).temperature };
    }
  }
  const babies = nursery.field.offspring();
  return {
    eggs: nursery.field.eggs().length,
    egg: nearest,
    babies: babies.length,
    baby: babies[0] === undefined ? null : { id: babies[0].id, matured: babies[0].matured, imprint: babies[0].bond, wants: babies[0].wants, size: ctx.scene.entity.get(babies[0].id)?.size ?? 1 },
    mating: tames(ctx).some((tame) => (nursery.field.matingProgress(tame.id) ?? 0) > 0),
  };
}

interface BreedingSave {
  field: BreedingSnapshot<CreatureGenes>;
  food: Record<string, number>;
  walked: Record<string, { metres: number; x: number; z: number }>;
}

export function breedingSave(ctx: GameContext) {
  return {
    key: "fernwild.breeding2",
    snapshot: (): BreedingSave => {
      const nursery = nurseryOf(ctx);
      return { field: nursery.field.snapshot(), food: Object.fromEntries(nursery.food), walked: structuredClone(Object.fromEntries(nursery.walked)) };
    },
    hydrate: (data: BreedingSave) => {
      const nursery = nurseryOf(ctx);
      nursery.field.restore(data.field);
      nursery.food = new Map(Object.entries(data.food));
      nursery.walked = new Map(Object.entries(data.walked));
    },
  };
}

export function resetBreeding(ctx: GameContext): void {
  const nursery = nurseryOf(ctx);
  nursery.field.reset();
  nursery.food.clear();
  nursery.walked.clear();
}
