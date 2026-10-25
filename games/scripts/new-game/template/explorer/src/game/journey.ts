import { gamePhase } from "@jgengine/core/game/gamePhase";
import { createGlideModel, type GlideModel } from "@jgengine/core/movement/glideModel";
import { playerMovementTelemetry } from "@jgengine/core/movement/playerMovement";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { pursue } from "@jgengine/core/scene/behaviors";
import { authoredSpawnPosition, authoredSpawnRotation } from "@jgengine/core/world/authoredSpawn";
import { createFastTravelNetwork, type FastTravelNetwork } from "@jgengine/core/world/fastTravel";
import type { WorldHookCall } from "@jgengine/core/worldModel/worldModel";
import { defineSystem } from "@jgengine/shell/gameKit";

import { editorLayers } from "../editorLayers";
import { idea } from "./idea";
import type { Ability, LandmarkWord } from "./kindShape";
import { landmarkPlaces, shrineOf, spawnMarker } from "./places";
import { fact, GOAL, journey, placeId, relicId, RELICS_NEEDED } from "./spec";

/**
 * The walk itself: reaching a landmark discovers it (the world model counts it, the engine's
 * fast-travel network opens it), relics turn on abilities (the engine's glide model while you hold
 * jump in the air, a second jump, a deeper stamina pool), and guardians stand at the places they keep.
 */

const SWING_COOLDOWN = 0.45;
const REACH = 3;
const RESPAWN_SECONDS = 4;
const JUMP_VELOCITY = 7.6;
const SPRINT_DRAIN = 22;
const STAMINA_REGEN = 16;
/** Extra stamina the stamina relic adds. */
const STAMINA_BONUS = 80;
/** Forward speed a glide adds over the walk controller's air speed, m/s. */
const GLIDE_PUSH = 5;

const places = landmarkPlaces(editorLayers);
const wordOf = (id: string): LandmarkWord | undefined => idea.landmarks.find((landmark) => landmark.id === id);
const placeOf = (id: string) => places.find((place) => place.id === id) ?? null;

interface Walker {
  clock: number;
  think: number;
  swingReady: number;
  respawnAt: number;
  network: FastTravelNetwork<{ landmark: string }>;
  glide: GlideModel;
  gliding: boolean;
  /** Seconds spent gliding this session: the proof that the glide ran. */
  glided: number;
  /** Last frame's height, to tell a fall from standing on a ledge. */
  lastY: number;
  airJumps: number;
  stamina: number;
  winded: boolean;
}

const walker = perContext(
  (_ctx: GameContext): Walker => ({
    clock: 0,
    think: 0,
    swingReady: 0,
    respawnAt: -1,
    network: createFastTravelNetwork({ points: places.map((place) => ({ id: place.id, name: wordOf(place.id)?.label ?? place.id, position: [place.x, place.z] as const, meta: { landmark: place.id } })) }),
    glide: createGlideModel({ gravityScale: 0.1, maxFallSpeed: 2.2, forwardSpeed: 9, thrustAccel: 6 }),
    gliding: false,
    glided: 0,
    lastY: 0,
    airJumps: 0,
    stamina: idea.hero.stamina,
    winded: false,
  }),
);

/** Whether a relic granting `ability` has been taken. */
export function has(ctx: GameContext, ability: Ability): boolean {
  const world = journey.of(ctx);
  return idea.landmarks.some((landmark) => landmark.relic?.grants === ability && world.fact(`${relicId(landmark.id)}.taken`) === true);
}

export const staminaMax = (ctx: GameContext) => idea.hero.stamina + (has(ctx, "stamina") ? STAMINA_BONUS : 0);

/** Sprint is gated on stamina; an empty bar walks until it is a quarter full again. */
export const canSprint = (ctx: GameContext) => !walker(ctx).winded;

/** Where you stand at a landmark: in front of its shrine, or its centre. */
function arrivalAt(id: string): { x: number; z: number } {
  const shrine = shrineOf(editorLayers, id);
  const place = placeOf(id);
  if (shrine === null) return place ?? spawnMarker(editorLayers);
  if (place === null) return shrine;
  const dx = shrine.x - place.x;
  const dz = shrine.z - place.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: shrine.x + (dx / length) * 3, z: shrine.z + (dz / length) * 3 };
}

/** The hero at `at`, or at the authored start (which a drive's `--spawn` can move). */
function spawnHero(ctx: GameContext, at?: { x: number; z: number }): void {
  const start = authoredSpawnPosition(editorLayers) ?? [0, 0, 0];
  const spot = at ?? { x: start[0], z: start[2] };
  const y = Math.max(ctx.world.groundHeightAt(spot.x, spot.z), at === undefined ? start[1] : 0);
  const rotationY = authoredSpawnRotation(editorLayers);
  ctx.scene.entity.spawn("player", { id: ctx.player.userId, position: [spot.x, y, spot.z], rotationY, role: "player" });
}

/** The relics still waiting on their shrines, and the goal's marker stone. */
function placeRelics(ctx: GameContext): void {
  const world = journey.of(ctx);
  for (const landmark of idea.landmarks) {
    const shrine = shrineOf(editorLayers, landmark.id);
    if (shrine === null) continue;
    const y = ctx.world.groundHeightAt(shrine.x, shrine.z);
    if (landmark.relic !== undefined && world.fact(`${relicId(landmark.id)}.taken`) !== true && ctx.scene.entity.get(relicId(landmark.id)) === null) {
      ctx.scene.entity.spawn(`relic_${landmark.id}`, { id: relicId(landmark.id), position: [shrine.x, y + (idea.pedestal.height ?? 1), shrine.z], role: "prop" });
    }
    if (landmark.role === "final" && ctx.scene.entity.get(GOAL) === null) {
      ctx.scene.entity.spawn("goal", { id: GOAL, position: [shrine.x, y, shrine.z], role: "prop" });
    }
  }
}

export function onNewPlayer(ctx: GameContext): void {
  spawnHero(ctx);
  placeRelics(ctx);
}

/** What a guardian at `landmark` keeps: its relic, or the goal. */
const keptBy = (landmark: LandmarkWord) => (landmark.role === "final" ? GOAL : relicId(landmark.id));
const guardianIndex = (id: string) => {
  const match = /^g-(.+)-(\d+)$/.exec(id);
  return match === null ? null : { landmark: match[1]!, index: Number(match[2]) };
};
export const isGuardian = (id: string) => guardianIndex(id) !== null;

/** Guardians wake when you come within this many metres of their place, so far-off ones cost nothing. */
const WAKE_RANGE = 75;

/** Guardians on their posts: as many as the world says still stand, so a load never brings back the fallen. */
function keepGuardians(ctx: GameContext): number {
  const world = journey.of(ctx);
  const me = ctx.scene.entity.get(ctx.player.userId);
  let standing = 0;
  for (const landmark of idea.landmarks) {
    const guard = landmark.guardian;
    const place = placeOf(landmark.id);
    if (guard === undefined || place === null) continue;
    if (me === null || Math.hypot(me.position[0] - place.x, me.position[2] - place.z) > WAKE_RANGE) continue;
    const wanted = Math.max(0, world.num(`${keptBy(landmark)}.guards`));
    const alive = Array.from({ length: guard.count }, (_, index) => `g-${landmark.id}-${index}`).filter((id) => ctx.scene.entity.get(id) !== null);
    standing += alive.length;
    for (let index = 0; index < guard.count && alive.length < wanted; index += 1) {
      const id = `g-${landmark.id}-${index}`;
      if (ctx.scene.entity.get(id) !== null) continue;
      const angle = index * 2.4 + 0.6;
      const x = place.x + Math.cos(angle) * 5;
      const z = place.z + Math.sin(angle) * 5;
      ctx.scene.entity.spawn(guard.id, {
        id,
        position: [x, ctx.world.groundHeightAt(x, z), z],
        role: "npc",
        behaviors: [pursue({ aggroRadius: 13, reach: 1.9, leashRange: 24, speed: guard.speed, attack: { effect: "damage", amount: guard.damage, intervalSec: 1.2 } })],
      });
      alive.push(id);
      standing += 1;
    }
  }
  return standing;
}

/** Four times a second: discover what you reached, keep the guardians up, heal when nothing is near. */
function think(ctx: GameContext): void {
  const world = journey.of(ctx);
  const me = ctx.scene.entity.get(ctx.player.userId);
  const state = walker(ctx);
  for (const place of places) {
    if (world.fact(`${placeId(place.id)}.found`) === true) {
      if (!state.network.isDiscovered(place.id)) state.network.discover(place.id);
      continue;
    }
    if (me !== null && Math.hypot(me.position[0] - place.x, me.position[2] - place.z) <= place.radius) world.act("discover", placeId(place.id));
  }
  keepGuardians(ctx);
  if (me === null) return;
  const threatened = ctx.scene.entity.inRadius(ctx.player.userId, 18, (id) => isGuardian(id)).length > 0;
  const health = ctx.scene.entity.stats.get(ctx.player.userId, "health");
  if (!threatened && health !== null && health.current < health.max) ctx.scene.entity.stats.delta(ctx.player.userId, "health", Math.min(2, health.max - health.current));
}

/** Glide, the second jump and the stamina pool, every frame on the walk controller's own motion seam. */
function move(ctx: GameContext, dt: number): void {
  const state = walker(ctx);
  const me = ctx.scene.entity.get(ctx.player.userId);
  const motion = playerMovementTelemetry(ctx, ctx.player.userId);
  if (me === null || motion === null) return;
  const max = staminaMax(ctx);
  const moving = ["moveForward", "moveBack", "moveLeft", "moveRight"].some((action) => ctx.input.isDown(action));
  const sprinting = ctx.input.isDown("sprint") && moving && !state.winded;
  state.stamina = Math.max(0, Math.min(max, state.stamina + (sprinting ? -SPRINT_DRAIN : STAMINA_REGEN) * dt));
  if (state.stamina <= 0.5) state.winded = true;
  else if (state.winded && state.stamina >= max * 0.25) state.winded = false;

  if (motion.grounded) {
    state.lastY = me.position[1];
    state.airJumps = has(ctx, "doubleJump") ? 1 : 0;
    state.gliding = false;
    return;
  }
  if (ctx.input.justPressed("jump") && state.airJumps > 0 && motion.verticalVelocity < JUMP_VELOCITY * 0.6) {
    state.airJumps -= 1;
    state.gliding = false;
    ctx.player.motion.setVerticalVelocity(JUMP_VELOCITY);
    ctx.scene.entity.vfx({ preset: "shield", from: ctx.player.userId, radius: 1.2 });
    return;
  }
  // Standing on a ledge or a prop reads as airborne to the walk controller; only a real fall glides.
  const falling = me.position[1] < state.lastY - 0.0005;
  state.lastY = me.position[1];
  const wantsGlide = has(ctx, "glide") && ctx.input.isDown("jump") && motion.verticalVelocity < -0.5 && falling;
  if (!wantsGlide) {
    state.gliding = false;
    return;
  }
  if (!state.gliding) {
    state.gliding = true;
    state.glide.launch([me.position[0], me.position[1], me.position[2]], me.rotationY, 0);
  }
  state.glided += dt;
  const step = state.glide.step(dt);
  ctx.player.motion.setVerticalVelocity(Math.max(step.velocity[1], -2.2));
  const yaw = me.rotationY;
  ctx.player.motion.pushHorizontal(Math.sin(yaw) * GLIDE_PUSH * 12 * dt, Math.cos(yaw) * GLIDE_PUSH * 12 * dt);
}

/** The swing: guardians in a short arc where you face take a hit; with none there, the closest in reach. */
function swing(ctx: GameContext, aim: { yaw: number; pitch: number }): void {
  const state = walker(ctx);
  if (state.clock < state.swingReady) return;
  state.swingReady = state.clock + SWING_COOLDOWN;
  const me = ctx.player.userId;
  const inArc = ctx.scene.entity.queryArc({ from: me, aim, radius: REACH, halfAngleDeg: 75 }).filter(isGuardian);
  const near = ctx.scene.entity.inRadius(me, REACH + 0.6, isGuardian);
  const hits = inArc.length > 0 ? inArc : near.slice(0, 1);
  for (const id of hits) ctx.scene.entity.effect({ from: me, to: id, effect: "damage", via: { amount: idea.hero.damage } });
  ctx.scene.entity.vfx({ preset: "slash", from: me, radius: 2.2 });
}

/** Fast travel: to `to`, or on to the next discovered place after the one you are nearest. */
export function travel(ctx: GameContext, to?: string): void {
  const state = walker(ctx);
  const me = ctx.scene.entity.get(ctx.player.userId);
  const open = state.network.destinations();
  if (open.length === 0 || me === null) {
    ctx.game.notices.push({ text: "Nowhere to travel yet: walk to a landmark first", tone: "deny" });
    return;
  }
  let target = to === undefined ? null : open.find((point) => point.id === to) ?? null;
  if (target === null) {
    const here = state.network.nearest([me.position[0], me.position[2]]);
    const at = here === null ? -1 : open.findIndex((point) => point.id === here.id);
    const hereClose = here !== null && Math.hypot(here.position[0] - me.position[0], here.position[1] - me.position[2]) < 30;
    target = open[hereClose ? (at + 1) % open.length : Math.max(0, at)]!;
  }
  if (!state.network.canTravel(target.id)) return;
  const spot = arrivalAt(target.id);
  state.gliding = false;
  ctx.scene.entity.setPose(ctx.player.userId, { position: [spot.x, ctx.world.groundHeightAt(spot.x, spot.z) + 0.2, spot.z] });
  ctx.game.notices.push({ text: `Travelled to ${target.name}`, tone: "info" });
}

/** `found` lands on a landmark: on the map and open for travel. */
export function onFound(ctx: GameContext, call: WorldHookCall): void {
  const id = call.target?.replace(/^place-/, "") ?? "";
  walker(ctx).network.discover(id);
  const word = wordOf(id);
  ctx.game.notices.push({ text: `Discovered ${word?.label ?? id}${call.world.num(fact("found")) > 1 ? " - T to fast travel" : ""}`, tone: "success" });
  void ctx.game.save?.checkpoint();
}

/** `relic` lands: it leaves its shrine and the ability is yours. */
export function onRelic(ctx: GameContext, call: WorldHookCall): void {
  if (call.target !== null) ctx.scene.entity.despawn(call.target);
  const landmark = idea.landmarks.find((entry) => relicId(entry.id) === call.target);
  if (landmark?.relic !== undefined) {
    ctx.game.notices.push({ text: `${landmark.relic.label}: ${landmark.relic.blurb}`, tone: "success", ttlMs: 7000 });
    if (landmark.relic.grants === "stamina") walker(ctx).stamina = staminaMax(ctx);
  }
  if (call.world.num(fact("relics")) >= RELICS_NEEDED) ctx.game.notices.push({ text: `Every relic is yours. ${idea.goal.label} waits.`, tone: "info", ttlMs: 7000 });
  void ctx.game.save?.checkpoint();
}

export function onVictory(ctx: GameContext): void {
  ctx.scene.entity.vfx({ preset: "heal", from: GOAL, radius: 6 });
  void ctx.game.save?.checkpoint();
}

/** The next place the story wants you at: the first relic not yet taken, then the goal. */
export function nextLandmark(ctx: GameContext): LandmarkWord | null {
  const world = journey.of(ctx);
  for (const landmark of idea.landmarks) {
    if (landmark.relic !== undefined && world.fact(`${relicId(landmark.id)}.taken`) !== true) return landmark;
    if (landmark.role === "final" && world.fact(`${GOAL}.lit`) !== true) return landmark;
  }
  return null;
}

/** Facts the HUD reads, so a screen never digs in the world itself. */
export function journeyView(ctx: GameContext) {
  const world = journey.of(ctx);
  const state = walker(ctx);
  const me = ctx.scene.entity.get(ctx.player.userId);
  const next = nextLandmark(ctx);
  const nextPlace = next === null ? null : placeOf(next.id);
  const open = state.network.destinations();
  return {
    found: world.num(fact("found")),
    total: places.length,
    relics: world.num(fact("relics")),
    needed: RELICS_NEEDED,
    won: world.num(fact("won")) >= 1,
    stamina: Math.round(state.stamina),
    staminaMax: staminaMax(ctx),
    winded: state.winded,
    gliding: state.gliding,
    glided: Math.round(state.glided * 10) / 10,
    abilities: (["glide", "doubleJump", "stamina"] as const).filter((ability) => has(ctx, ability)),
    next: next === null || nextPlace === null ? null : { id: next.id, label: next.label, x: nextPlace.x, z: nextPlace.z },
    distance: next === null || nextPlace === null || me === null ? null : Math.round(Math.hypot(nextPlace.x - me.position[0], nextPlace.z - me.position[2])),
    discovered: places.filter((place) => world.fact(`${placeId(place.id)}.found`) === true).map((place) => ({ id: place.id, label: wordOf(place.id)?.label ?? place.id, x: place.x, z: place.z })),
    travelTo: open.length > 1 ? open.map((point) => point.name) : [],
    guardians: ctx.scene.entity.ids().filter(isGuardian).length,
    mission: world.missionView(),
    facing: me?.rotationY ?? 0,
    at: me === null ? null : ([me.position[0], me.position[2]] as const),
  };
}

export const systems = [
  journey.system,
  defineSystem({
    id: "journey.walk",
    tick: { type: "frame" },
    create(ctx) {
      ctx.game.commands.define<{ yaw?: number; pitch?: number }>("attack", {
        apply(state, input) {
          swing(state, { yaw: input.yaw ?? state.scene.entity.get(state.player.userId)?.rotationY ?? 0, pitch: 0 });
          return state;
        },
      });
      ctx.game.commands.define<{ to?: string }>("travel", {
        apply(state, input) {
          travel(state, input.to);
          return state;
        },
      });
      ctx.game.events.on("entity.died", (event) => {
        const guard = guardianIndex(event.instanceId);
        if (guard !== null) {
          const landmark = wordOf(guard.landmark);
          if (landmark === undefined) return;
          const world = journey.of(ctx);
          world.change({ [`${keptBy(landmark)}.guards`]: -1 });
          if (world.num(`${keptBy(landmark)}.guards`) <= 0) ctx.game.notices.push({ text: `${landmark.label} is unguarded`, tone: "success" });
        } else if (event.instanceId === ctx.player.userId) {
          walker(ctx).respawnAt = walker(ctx).clock + RESPAWN_SECONDS;
          ctx.game.notices.push({ text: `You fell. Back on your feet at the last landmark in ${RESPAWN_SECONDS}s.`, tone: "deny" });
        }
      });
    },
    update(ctx, dt) {
      if (gamePhase(ctx) !== "playing") return;
      const state = walker(ctx);
      state.clock += dt;
      if (state.respawnAt >= 0 && state.clock >= state.respawnAt) {
        state.respawnAt = -1;
        const last = state.network.destinations().at(-1);
        spawnHero(ctx, last === undefined ? undefined : arrivalAt(last.id));
      }
      move(ctx, dt);
      state.think -= dt;
      if (state.think > 0) return;
      state.think = 0.25;
      placeRelics(ctx);
      think(ctx);
    },
  }),
];
