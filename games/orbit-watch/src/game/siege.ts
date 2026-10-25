import { createEncounter, type EncounterGroup, type EncounterOrder, type EncounterWave } from "@jgengine/core/ai/director/encounter";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { advancePathFollow, createPathFollow, type PathFollowState, type Waypoint } from "@jgengine/core/nav/pathFollow";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { selectAutoTarget } from "@jgengine/core/scene/autoTarget";
import { defineSystem } from "@jgengine/shell/gameKit";

import { editorLayers } from "../editorLayers";
import { idea } from "./idea";
import type { CreepWord, TowerWord } from "./kindShape";
import { coreMarker, lanes } from "./places";
import { fact, hold } from "./spec";

const LANES = lanes(editorLayers);
const CORE = coreMarker(editorLayers);
const CORE_ID = "core";

const creepOf = (id: string) => idea.creeps.find((creep) => creep.id === id) ?? null;
export const towerOf = (id: string) => idea.towers.find((tower) => tower.id === id) ?? null;

/** A tower's numbers at a level: each level hits 60% harder and reaches 10% further. */
export function towerStats(tower: TowerWord, level: number): { damage: number; range: number } {
  return { damage: Math.round(tower.damage * (1 + 0.6 * (level - 1))), range: Math.round(tower.range * (1 + 0.1 * (level - 1)) * 10) / 10 };
}

/**
 * Wave `n`, one marcher at a time down alternating lanes: more of them and closer together each
 * wave, the tougher kinds joining as they unlock, and a boss closing every fifth wave.
 */
export function waveOf(n: number): EncounterWave {
  const open = idea.creeps.filter((creep) => creep.boss !== true && creep.from <= n);
  const marchers = open.length > 0 ? open : idea.creeps.filter((creep) => creep.boss !== true);
  const count = 5 + n * 2;
  const gap = Math.max(0.55, 1.5 - n * 0.08);
  const groups: EncounterGroup[] = Array.from({ length: count }, (_, index) => ({
    unit: marchers[(index * 5 + n) % marchers.length]!.id,
    entry: LANES[index % LANES.length]!.id,
    count: 1,
    at: Math.round(index * gap * 100) / 100,
  }));
  const boss = n % 5 === 0 ? idea.creeps.find((creep) => creep.boss === true) : undefined;
  if (boss !== undefined) groups.push({ unit: boss.id, entry: LANES[0]!.id, count: 1, at: count * gap + 2 });
  const last = groups.reduce((latest, group) => Math.max(latest, group.at ?? 0), 0);
  return { id: `wave-${n}`, label: `${idea.wave} ${n}`, groups, durationSeconds: last + 0.5 };
}

interface Marcher {
  id: string;
  word: CreepWord;
  route: readonly Waypoint[];
  path: PathFollowState;
  slowUntil: number;
  slowBy: number;
}

const field = perContext((_ctx: GameContext) => ({
  encounter: createEncounter({ definition: { id: idea.spec, waves: Array.from({ length: idea.waves }, (_, index) => waveOf(index + 1)) } }),
  open: false,
  marchers: new Map<string, Marcher>(),
  cooldown: new Map<string, number>(),
  routes: new Map<string, Waypoint[]>(),
  clock: 0,
  calm: -1,
  serial: 0,
}));

/** A lane as waypoints on the ground, ending at the core. */
function routeOf(ctx: GameContext, laneId: string): readonly Waypoint[] {
  const run = field(ctx);
  const known = run.routes.get(laneId);
  if (known !== undefined) return known;
  const lane = LANES.find((entry) => entry.id === laneId) ?? LANES[0]!;
  const points = [...lane.points, CORE];
  const route = points.map((point): Waypoint => [point.x, ctx.world.groundHeightAt(point.x, point.z), point.z]);
  run.routes.set(laneId, route);
  return route;
}

function march(ctx: GameContext, order: EncounterOrder, wave: number): void {
  const word = creepOf(order.unit);
  if (word === null) return;
  const run = field(ctx);
  run.serial += 1;
  const id = `${word.id}-${wave}-${run.serial}`;
  const route = routeOf(ctx, order.entry);
  ctx.scene.entity.spawn(word.id, { id, position: [...route[0]!], role: "npc" });
  const health = Math.round(word.health * (1 + 0.15 * (wave - 1)));
  ctx.scene.entity.stats.set(id, "health", { current: health, max: health, min: 0 });
  run.marchers.set(id, { id, word, route, path: createPathFollow({ waypoints: route, speed: word.speed }), slowUntil: 0, slowBy: 1 });
  if (word.boss === true) ctx.game.notices.push({ text: `${word.label} is coming`, tone: "warn" });
}

/** Send the next wave now; calling it before the calm runs out pays the time left. */
export function sendWave(ctx: GameContext, early: boolean): boolean {
  const world = hold.of(ctx);
  if (world.fact(fact("raiding")) === true || world.fact(fact("won")) === true || world.fact(fact("lost")) === true) return false;
  const n = world.num(fact("wave")) + 1;
  if (n > idea.waves) return false;
  const run = field(ctx);
  const bonus = early ? Math.floor(Math.max(0, run.calm) / 2) : 0;
  world.change({ [fact("wave")]: 1, ...(bonus > 0 ? { [fact("coin")]: bonus } : {}) });
  world.set(fact("raiding"), true);
  run.encounter.openWave(n - 1);
  run.open = true;
  const total = run.encounter.view().total;
  ctx.game.notices.push({ text: `${idea.wave} ${n}: ${total} ${idea.foe.toLowerCase()} incoming${bonus > 0 ? ` (+${bonus} ${idea.coin.label.toLowerCase()} for calling it early)` : ""}`, tone: "warn" });
  return true;
}

function held(ctx: GameContext): void {
  const world = hold.of(ctx);
  const run = field(ctx);
  const n = world.num(fact("wave"));
  const pay = 10 + n * 3;
  run.open = false;
  run.calm = idea.calm.between;
  world.set(fact("raiding"), false);
  world.set(fact("calm"), run.calm);
  world.change({ [fact("cleared")]: 1, [fact("coin")]: pay });
  if (n < idea.waves) ctx.game.notices.push({ text: `${idea.wave} ${n} held: +${pay} ${idea.coin.label.toLowerCase()}`, tone: "success" });
  void ctx.game.save?.checkpoint();
}

function leak(ctx: GameContext, marcher: Marcher): void {
  const run = field(ctx);
  run.marchers.delete(marcher.id);
  ctx.scene.entity.despawn(marcher.id);
  hold.of(ctx).change({ [fact("lives")]: -marcher.word.leak });
  const y = ctx.world.groundHeightAt(CORE.x, CORE.z);
  ctx.scene.entity.vfx({ preset: "blast", to: [CORE.x, y + 1, CORE.z], radius: 3 });
  ctx.scene.entity.floatText({ position: [CORE.x, y + 6, CORE.z], text: `-${marcher.word.leak} ${marcher.word.leak === 1 ? "life" : "lives"}`, kind: "damage", scale: 1.3 });
}

function walk(ctx: GameContext, dt: number): void {
  const run = field(ctx);
  for (const marcher of [...run.marchers.values()]) {
    if (ctx.scene.entity.get(marcher.id) === null) {
      run.marchers.delete(marcher.id);
      continue;
    }
    const speed = marcher.word.speed * (run.clock < marcher.slowUntil ? marcher.slowBy : 1);
    marcher.path = advancePathFollow({ waypoints: marcher.route, speed }, marcher.path, dt);
    ctx.scene.entity.setPose(marcher.id, { position: [...marcher.path.position], rotationY: marcher.path.heading, dt });
    if (marcher.path.done) leak(ctx, marcher);
  }
}

/** Every ready tower picks the marcher furthest down the lane in reach and fires when its cooldown is up. */
function fire(ctx: GameContext, dt: number): void {
  const run = field(ctx);
  const world = hold.of(ctx);
  if (run.marchers.size === 0) return;
  for (const tower of world.instances()) {
    const word = towerOf(tower.kind);
    if (word === null || !tower.ready || tower.position === null) continue;
    const wait = (run.cooldown.get(tower.id) ?? 0) - dt;
    run.cooldown.set(tower.id, wait);
    if (wait > 0) continue;
    const stats = towerStats(word, world.num(`${tower.id}.level`) || 1);
    const [x, z] = tower.position;
    const inReach = [...run.marchers.values()].filter((marcher) => Math.hypot(marcher.path.position[0] - x, marcher.path.position[2] - z) <= stats.range);
    if (inReach.length === 0) continue;
    const byId = new Map(inReach.map((marcher) => [marcher.id, marcher]));
    const target = selectAutoTarget("first", tower.id, {
      candidates: () => inReach.map((marcher) => marcher.id),
      distance: (_from, to) => {
        const marcher = byId.get(to);
        return marcher === undefined ? null : Math.hypot(marcher.path.position[0] - x, marcher.path.position[2] - z);
      },
      progress: (to) => byId.get(to)?.path.distanceTravelled ?? 0,
    });
    const hit = target === null ? undefined : byId.get(target);
    if (hit === undefined) continue;
    run.cooldown.set(tower.id, 1 / word.rate);
    const muzzle: [number, number, number] = [x, ctx.world.groundHeightAt(x, z) + (word.model.height ?? 4) * 0.8, z];
    ctx.scene.entity.vfx({ preset: word.shot, from: muzzle, to: hit.id });
    ctx.scene.entity.effect({ from: tower.id, to: hit.id, effect: "damage", via: { amount: stats.damage } });
    if (word.slow < 1) {
      hit.slowUntil = run.clock + 1.6;
      hit.slowBy = word.slow;
    }
    if (word.splash > 0) {
      ctx.scene.entity.vfx({ preset: "explosion", to: [...hit.path.position], radius: word.splash });
      for (const other of run.marchers.values()) {
        if (other.id === hit.id || Math.hypot(other.path.position[0] - hit.path.position[0], other.path.position[2] - hit.path.position[2]) > word.splash) continue;
        ctx.scene.entity.effect({ from: tower.id, to: other.id, effect: "damage", via: { amount: Math.round(stats.damage / 2) } });
      }
    }
  }
}

/** A marcher fell: pay its bounty where it dropped. */
function fell(ctx: GameContext, id: string, position: readonly [number, number, number]): void {
  const run = field(ctx);
  const marcher = run.marchers.get(id);
  if (marcher === undefined) return;
  run.marchers.delete(id);
  hold.of(ctx).change({ [fact("coin")]: marcher.word.bounty, [fact("kills")]: 1 });
  ctx.scene.entity.floatText({ position: [position[0], position[1] + 2.5, position[2]], text: `+${marcher.word.bounty}`, kind: "heal", scale: 1.1 });
}

/** The live count of marchers on the field, for the HUD and the probe. */
export const marching = (ctx: GameContext) => field(ctx).marchers.size;

/** Seconds of calm left before the next wave marches by itself. */
export const calmLeft = (ctx: GameContext) => Math.max(0, Math.ceil(field(ctx).calm));

/** The wave in progress: how many have marched of how many. */
export function waveProgress(ctx: GameContext): { emitted: number; total: number } {
  const run = field(ctx);
  if (!run.open) return { emitted: 0, total: 0 };
  const view = run.encounter.view();
  return { emitted: view.emitted, total: view.total };
}

/** The core, the waves, the marchers and the towers shooting at them. */
export const siegeSystem = defineSystem({
  id: "hold.siege",
  tick: { type: "frame" },
  create(ctx) {
    ctx.game.events.on("entity.died", (event) => fell(ctx, event.instanceId, event.position));
  },
  update(ctx, dt) {
    if (gamePhase(ctx) !== "playing") return;
    const run = field(ctx);
    const world = hold.of(ctx);
    if (ctx.scene.entity.get(CORE_ID) === null) {
      ctx.scene.entity.spawn(CORE_ID, { id: CORE_ID, position: [CORE.x, ctx.world.groundHeightAt(CORE.x, CORE.z), CORE.z], role: "prop" });
    }
    if (world.fact(fact("won")) === true || world.fact(fact("lost")) === true) return;
    run.clock += dt;
    if (run.calm < 0) run.calm = world.num(fact("calm"));
    const raiding = world.fact(fact("raiding")) === true;
    if (raiding && !run.open) {
      // A loaded game mid-wave: the marchers are not saved, so the wave marches again from the start.
      run.encounter.openWave(Math.max(0, world.num(fact("wave")) - 1));
      run.open = true;
    }
    if (!raiding) {
      const before = Math.ceil(run.calm);
      run.calm -= dt;
      if (Math.ceil(run.calm) !== before) world.set(fact("calm"), Math.max(0, Math.ceil(run.calm)));
      if (run.calm <= 0) sendWave(ctx, false);
    } else {
      const wave = world.num(fact("wave"));
      for (const order of run.encounter.update(dt)) march(ctx, order, wave);
      if (run.encounter.view().ready && run.marchers.size === 0) held(ctx);
    }
    walk(ctx, dt);
    fire(ctx, dt);
  },
});
