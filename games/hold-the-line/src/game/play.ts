import { gamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { wander } from "@jgengine/core/scene/behaviors";
import { authoredSpawnPosition } from "@jgengine/core/world/authoredSpawn";
import { defineSystem } from "@jgengine/shell/gameKit";

import { editorLayers } from "../editorLayers";
import { idea } from "./idea";
import { herdMarkers, homeMarker } from "./places";
import { camp, fact } from "./spec";
import { followPlayer, isThreat } from "./waves";

const HOME = "home";
const ATTACK_COOLDOWN = 0.45;
/** Metres a swing reaches. */
const REACH = 3;
const RESPAWN_SECONDS = 4;

const pace = perContext((_ctx: GameContext) => ({ think: 0, swingReady: 0, clock: 0, respawnAt: -1 }));

function spawnHero(ctx: GameContext): void {
  const at = authoredSpawnPosition(editorLayers) ?? [0, 0, 0];
  const facing = editorLayers.markers.find((marker) => marker.kind === "player_spawn")?.rotationY ?? 0;
  ctx.scene.entity.spawn("player", { id: ctx.player.userId, position: at, rotationY: facing, role: "player" });
}

/** Called once for the local player: the hero, the home to defend and the creatures on the plain. */
export function onNewPlayer(ctx: GameContext): void {
  spawnHero(ctx);
  const home = homeMarker(editorLayers).position;
  ctx.scene.entity.spawn(HOME, { id: HOME, position: [home.x, ctx.world.groundHeightAt(home.x, home.z), home.z], role: "prop" });
  for (const herd of herdMarkers(editorLayers)) {
    ctx.scene.entity.spawn(herd.ally, { id: herd.id, position: [herd.x, ctx.world.groundHeightAt(herd.x, herd.z), herd.z], role: "npc", behaviors: [wander({ radius: 4 })] });
  }
}

/** The nearest live entity to `from` passing `keep`, within `range`. */
function nearest(ctx: GameContext, from: string, range: number, keep: (name: string, id: string) => boolean): string | null {
  let best: string | null = null;
  let bestDistance = range;
  for (const id of ctx.scene.entity.inRadius(from, range, (candidate) => keep(ctx.scene.entity.get(candidate)?.name ?? "", candidate))) {
    const distance = ctx.scene.entity.distance(from, id) ?? Infinity;
    if (distance < bestDistance) [best, bestDistance] = [id, distance];
  }
  return best;
}

const structureIds = new Set(idea.structures.map((structure) => structure.id));

/** Twice a second: threats pick what to hit, turrets fire, tamed creatures keep up, the wave count settles. */
function think(ctx: GameContext): void {
  const world = camp.of(ctx);
  let alive = 0;
  for (const body of ctx.scene.entity.list()) {
    if (isThreat(body.name)) {
      alive += 1;
      const wall = nearest(ctx, body.id, 7, (name) => structureIds.has(name));
      const hero = nearest(ctx, body.id, 12, (_name, id) => id === ctx.player.userId);
      ctx.scene.entity.setTarget(body.id, wall ?? hero ?? HOME);
    }
  }
  world.set(fact("alive"), alive);
  if (world.fact(fact("raiding")) === true && alive === 0) camp.emit(ctx, { kind: "dawn" });
  for (const tower of world.instances()) {
    const word = idea.structures.find((structure) => structure.id === tower.kind);
    if (word?.role !== "turret" || !tower.ready) continue;
    const target = nearest(ctx, tower.id, 18, (name) => isThreat(name));
    if (target === null) continue;
    const level = world.num(`${tower.id}.level`) || 1;
    ctx.scene.entity.effect({ from: tower.id, to: target, effect: "damage", via: { amount: (word.power * level) / 2 } });
    ctx.scene.entity.vfx({ preset: "bullet", from: tower.id, to: target });
  }
  for (const herd of herdMarkers(editorLayers)) if (world.fact(`${herd.id}.tame`) === true) followPlayer(ctx, herd.id);
}

/** The swing: everything in a short arc where you look takes a hit; with nothing there, the closest threat in reach does. */
export function swing(ctx: GameContext, aim: { yaw: number; pitch: number }): void {
  const timing = pace(ctx);
  if (timing.clock < timing.swingReady) return;
  timing.swingReady = timing.clock + ATTACK_COOLDOWN;
  const me = ctx.player.userId;
  const inArc = ctx.scene.entity.queryArc({ from: me, aim, radius: REACH, halfAngleDeg: 75 }).filter((id) => isThreat(ctx.scene.entity.get(id)?.name));
  const closest = nearest(ctx, me, REACH + 0.6, (name) => isThreat(name));
  const hits = inArc.length > 0 ? inArc : closest === null ? [] : [closest];
  for (const id of hits) ctx.scene.entity.effect({ from: me, to: id, effect: "damage", via: { amount: idea.hero.damage } });
  ctx.scene.entity.vfx({ preset: "slash", from: me, radius: 2.2 });
}

export const systems = [
  camp.system,
  defineSystem({
    id: "camp.play",
    tick: { type: "frame" },
    create(ctx) {
      ctx.game.commands.define<{ yaw?: number; pitch?: number }>("attack", {
        apply(state, input) {
          swing(state, { yaw: input.yaw ?? state.scene.entity.get(state.player.userId)?.rotationY ?? 0, pitch: 0 });
          return state;
        },
      });
      // N calls the next wave early, Kingdom Rush style: the calm left over pays out in the first resource.
      ctx.game.commands.define("callWave", {
        apply(state) {
          const world = camp.of(state);
          const left = world.num(fact("dusk_in"));
          if (world.fact(fact("raiding")) === true || left <= 3) return state;
          const [first] = idea.resources;
          const bonus = Math.floor(left / 6);
          world.set(fact("dusk_in"), 3);
          if (first !== undefined && bonus > 0) world.set(fact(first.id), world.num(fact(first.id)) + bonus);
          state.game.notices.push({ text: `${idea.wave} called early${first !== undefined && bonus > 0 ? `: +${bonus} ${first.label.toLowerCase()}` : ""}`, tone: "warn" });
          return state;
        },
      });
      ctx.game.events.on("entity.died", (event) => {
        if (event.instanceId === HOME) camp.emit(ctx, { kind: "breach" });
        else if (event.instanceId === ctx.player.userId) {
          pace(ctx).respawnAt = pace(ctx).clock + RESPAWN_SECONDS;
          ctx.game.notices.push({ text: `You went down. Back on your feet in ${RESPAWN_SECONDS}s.`, tone: "deny" });
        } else if (camp.of(ctx).instance(event.instanceId) !== null) camp.of(ctx).remove(event.instanceId);
      });
    },
    update(ctx, dt) {
      if (gamePhase(ctx) !== "playing") return;
      const timing = pace(ctx);
      timing.clock += dt;
      if (timing.respawnAt >= 0 && timing.clock >= timing.respawnAt) {
        timing.respawnAt = -1;
        spawnHero(ctx);
      }
      timing.think -= dt;
      if (timing.think > 0) return;
      timing.think = 0.5;
      think(ctx);
    },
  }),
];
