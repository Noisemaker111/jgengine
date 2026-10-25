import type { PerceptionService, PerceptionStimulus } from "@jgengine/core/sensor/perception";
import { distance, HAZARDS, inside, lineOfSight, type HazardKind, type Point } from "../world";
import { advanceRoute, createNavigator, type Navigator } from "./navigation";
import { creatureIntent, diverVisibility, SPECIES, type Creature, type Species } from "./fauna";
import { STRATA, type Stratum } from "./strata";
import type { Dive } from "./state";

/**
 * One tick of Bellwether's living floors: the creatures of the stratum the diver stands in sense,
 * decide (engine temperament) and move (engine navigation), and a lure on the floor pulls predators
 * off the diver. The game's own parts are only the numbers each species carries and what a strike
 * costs the suit.
 */
export interface Senses {
  of(species: Species): PerceptionService;
  route(id: string): Navigator;
}

export function createSenses(make: (species: Species) => PerceptionService): Senses {
  const services = new Map<Species, PerceptionService>();
  const routes = new Map<string, Navigator>();
  return {
    of(species) {
      let service = services.get(species);
      if (service === undefined) { service = make(species); services.set(species, service); }
      return service;
    },
    route(id) {
      let route = routes.get(id);
      if (route === undefined) { route = createNavigator(); routes.set(id, route); }
      return route;
    },
  };
}

/** A noise, a smell or a wound, delivered to every species' senses at once. */
export function broadcast(senses: Senses, stimulus: PerceptionStimulus): void {
  for (const species of Object.keys(SPECIES) as Species[]) senses.of(species).pushStimulus(stimulus);
}

/** Which hazard patches the diver is standing in on this floor. */
export function hazardsAt(at: Point, stratum: Stratum, steamOn: boolean): Set<HazardKind> {
  const out = new Set<HazardKind>();
  for (const hazard of HAZARDS) {
    if (hazard.place !== stratum || !inside(at[0], at[2], hazard)) continue;
    if (hazard.hazard === "steam" && !steamOn) continue;
    out.add(hazard.hazard);
  }
  return out;
}

export interface DiverPose { id: string; at: Point; lamp: boolean }
export interface CreatureTick { fauna: Dive["fauna"]; thrown: Dive["thrown"]; damage: number; hint: string | null; windup: boolean; struck: string | null }

/**
 * Advance every creature on the diver's floor by `dt`. A creature's target can be the diver or a
 * lure; reaching a lure ends it (the blood is eaten), reaching the diver after a visible windup lands
 * the species' strike.
 */
export function tickCreatures(dive: Dive, diver: DiverPose, senses: Senses, dt: number, nowMs: number): CreatureTick {
  const stratum = dive.stratum, ambient = STRATA[stratum].ambient;
  const fauna: Dive["fauna"] = { ...dive.fauna };
  let thrown = dive.thrown, damage = 0, hint: string | null = null, windup = false, struck: string | null = null;
  const lures = thrown.map(lure => ({ id: lure.id, position: [lure.at[0], 0.4, lure.at[2]] as const, visibility: 0.6 }));
  for (const creature of Object.values(dive.fauna)) {
    if (creature.place !== stratum || creature.health <= 0) continue;
    const def = SPECIES[creature.species], service = senses.of(creature.species);
    service.observe({ id: creature.id, position: [creature.at[0], 1, creature.at[2]], yaw: creature.facing },
      [{ id: diver.id, position: [diver.at[0], 1.2, diver.at[2]], visibility: diverVisibility(diver.lamp, ambient) }, ...lures], nowMs);
    const memories = service.memory(creature.id).filter(memory => memory.targetId === diver.id || thrown.some(lure => lure.id === memory.targetId));
    const intent = creatureIntent(creature, memories, id => (id === diver.id ? (diver.lamp ? 1 : ambient * 0.5) : 0));
    let next: Creature = { ...creature, cooldown: Math.max(0, creature.cooldown - dt), target: intent.targetId, reason: intent.reason };
    const onDiver = intent.targetId === diver.id;
    if (creature.mode === "winding") {
      next.windup = Math.max(0, creature.windup - dt);
      if (next.windup === 0) {
        if (def.strike !== null && distance(creature.at, diver.at) <= def.strike.reach && lineOfSight(creature.at, diver.at, stratum)) {
          damage += def.strike.damage; struck = creature.id;
          hint = `${def.name} struck / ${def.strike.damage} damage.`;
        }
        next = { ...next, mode: "stalk", cooldown: def.strike?.cooldown ?? 1 };
      } else windup = windup || onDiver;
    } else if (intent.mode === "attack" && def.strike !== null && onDiver && next.cooldown === 0) {
      next = { ...next, mode: "winding", windup: def.strike.windup };
      windup = true;
      hint = `${def.name} rears up / get clear!`;
    } else if (!onDiver && intent.targetId !== null && def.strike !== null && (intent.mode === "attack" || (intent.goal !== null && distance(creature.at, intent.goal) <= def.strike.reach))) {
      // A predator that reaches a lure eats it, and the blood stops calling.
      thrown = thrown.filter(lure => lure.id !== intent.targetId);
      service.forget(creature.id, intent.targetId);
      next = { ...next, mode: "idle" };
    } else {
      next.mode = intent.mode;
      const goal = intent.goal;
      if (goal !== null) {
        const fast = intent.mode === "flee" || intent.mode === "stalk" || intent.mode === "attack";
        const speed = fast ? def.run : def.walk;
        const stop = intent.mode === "stalk" || intent.mode === "attack" ? Math.max(0, (def.strike?.reach ?? 1.5) * 0.7) : 0;
        const budget = Math.max(0, Math.min(speed * dt, distance(creature.at, goal) - stop));
        const from = creature.at;
        let at = advanceRoute(senses.route(creature.id), from, [goal[0], 0, goal[2]], budget, stratum);
        // A fleeing print backed into shelving turns along the wall instead of freezing against it.
        if (at[0] === from[0] && at[2] === from[2] && budget > 0 && intent.mode === "flee") at = sidestep(senses.route(creature.id), from, goal, budget, stratum);
        if (at[0] !== from[0] || at[2] !== from[2]) next = { ...next, at, facing: Math.atan2(at[0] - from[0], at[2] - from[2]) };
      }
    }
    fauna[creature.id] = next;
  }
  thrown = thrown.map(lure => ({ ...lure, remaining: lure.remaining - dt })).filter(lure => lure.remaining > 0);
  return { fauna, thrown, damage, hint, windup, struck };
}

/** Try the flee heading turned further from straight on, and take the step that opens the most distance from the threat behind it. */
function sidestep(route: Navigator, from: Point, goal: Point, budget: number, stratum: Stratum): Point {
  const dx = goal[0] - from[0], dz = goal[2] - from[2], length = Math.hypot(dx, dz) || 1, heading = Math.atan2(dx, dz);
  const threat: Point = [from[0] - dx / length * 3, 0, from[2] - dz / length * 3];
  let best = from, gain = distance(from, threat) + 1e-3;
  for (const turn of [0.6, -0.6, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2]) {
    const aim: Point = [from[0] + Math.sin(heading + turn) * 4, 0, from[2] + Math.cos(heading + turn) * 4];
    const probe = createNavigator();
    const at = advanceRoute(probe, from, aim, budget, stratum);
    if (distance(at, threat) > gain) { best = at; gain = distance(at, threat); }
  }
  if (best !== from) { route.goal = null; route.path = []; }
  return best;
}

/** The nearest live creature the diver is looking at, inside `reach` and in plain sight. */
export function creatureInSight(dive: Dive, at: Point, aim: Point, reach: number): Creature | null {
  let best: { creature: Creature; along: number } | null = null;
  const flat = Math.hypot(aim[0], aim[2]) || 1;
  for (const creature of Object.values(dive.fauna)) {
    if (creature.place !== dive.stratum || creature.health <= 0) continue;
    const dx = creature.at[0] - at[0], dz = creature.at[2] - at[2];
    const along = (dx * aim[0] + dz * aim[2]) / flat;
    if (along <= 0 || along > reach) continue;
    const miss = Math.abs(dx * aim[2] - dz * aim[0]) / flat;
    if (miss > Math.max(0.8, SPECIES[creature.species].size)) continue;
    if (!lineOfSight(at, creature.at, dive.stratum)) continue;
    if (best === null || along < best.along) best = { creature, along };
  }
  return best?.creature ?? null;
}

/** Where a thrown lure lands: up to `range` metres along the aim, stopped short of the first wall. */
export function lureLanding(at: Point, aim: Point, stratum: Stratum, range = 7): Point {
  const flat = Math.hypot(aim[0], aim[2]) || 1;
  const dir: Point = [aim[0] / flat, 0, aim[2] / flat];
  let landed: Point = at;
  for (let step = 0.5; step <= range; step += 0.5) {
    const next: Point = [at[0] + dir[0] * step, 0, at[2] + dir[2] * step];
    if (!lineOfSight(at, next, stratum)) break;
    landed = next;
  }
  return landed;
}
