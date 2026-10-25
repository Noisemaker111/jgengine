import type { PressurePlan, PressureReading } from "@jgengine/core/ai/director/pressure";
import {
  assignFightIntents,
  compositionForIntents,
  type FightIntent,
  type FighterState,
} from "@jgengine/core/ai/director/roles";
import { advanceBoss, createBossState, type BossState, type BossStep } from "@jgengine/core/ai/director/boss";
import { createEncounter, type Encounter, type EncounterOrder } from "@jgengine/core/ai/director/encounter";
import { evaluatePressure } from "@jgengine/core/ai/director/pressure";
import {
  coverPointsFromSolids,
  coverPointsNear,
  selectCover,
  type CoverPoint,
  type CoverSolid,
} from "@jgengine/core/combat/cover";
import { assignSquadRoles, type SquadRole } from "@jgengine/core/combat/squadTactics";
import { findEditorMarker } from "@jgengine/core/editor/document";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import type { Vec3 } from "@jgengine/core/world/geometry";
import { gunById, reservePhase } from "../handroll";
import { enemyById, type EnemyDef } from "../entities/enemies/catalog";
import { homeOf, rememberHome, tickEnemyAttack } from "../entities/enemies/behavior";
import { authoredScene } from "../world/level";
import { PLAYER_SPAWN, PLAYER_SPAWN_YAW } from "../world/sites";
import { createShotHunt } from "./noise";
import { roleFor, type Faction } from "./roles";
import {
  ELITE_TELL,
  FOREMAN_ID,
  FOREMAN_PHASES,
  FOREMAN_STANCE,
  FOREMAN_TELL_TEXT,
  FRONT_ACTIVATION_RADIUS,
  FRONT_LEAVE_RADIUS,
  FRONT_PRESSURE,
  FRONT_ROLE_INTERVAL,
  FRONT_SEED,
  FRONT_WAVE_COUNT,
  FRONT_WAVE_GAP_SECONDS,
  FRONT_WAVES,
  SHOT_LOUDNESS,
} from "./waves";

/** Range at which a gunshot can be heard at all; a loud gun multiplies it. */
const HEARING_RANGE = 32;
/** Most enemies one shot sends looking. */
const MAX_INVESTIGATORS = 3;
/** Seconds a noise is remembered before it is fully gone. */
const MEMORY_SECONDS = 9;
/** Seconds between hearing-memory reads, not per frame. */
const HUNT_TICK = 0.25;
/** Props that read as cover; their authored placement, not a coordinate table, places the points. */
const COVER_PROPS = new Set(["cover_crate", "wreck", "barricade", "rock_spire", "bus_wreck", "tent", "watchtower"]);

interface FrontUnit {
  catalogId: string;
  faction: Faction;
}

interface SquadOrders {
  intents: Map<string, FightIntent>;
  roles: Map<string, SquadRole>;
  threat: EntityPosition | null;
  threatId: string | null;
  reason: string;
}

interface FrontBoss {
  id: string;
  state: BossState;
  stance: string;
}

interface FrontRuntime {
  started: boolean;
  cleared: boolean;
  units: Map<string, FrontUnit>;
  waveUnits: string[];
  orders: Record<Faction, SquadOrders | null>;
  posts: Map<string, EntityPosition>;
  hunting: Map<string, EntityPosition>;
  boss: FrontBoss | null;
  roleTimer: number;
  huntTimer: number;
  lastNoiseAt: number;
  elapsed: number;
  nextWaveIn: number;
  pressure: PressurePlan | null;
  cover: CoverPoint[];
  /** Capture staging only: health fraction the Foreman should arrive at. */
  stageBossFraction: number | null;
  seq: number;
  /** A run laid over the authored front (an Overdrive tier); null for the plain front. */
  run: FrontRunHooks | null;
  /** True once the plain front has been fought to the end in this session. */
  everCleared: boolean;
}

/**
 * What a run laid over the front owns: every arrival passes through `onSpawn` (to scale it, give it a
 * mutator or a twin), `gate` decides when a cleared wave lets the next one out, and `onCleared` hears
 * the last wave fall. The front keeps the squads, cover, hearing and the Foreman's clock.
 */
export interface FrontRunHooks {
  onSpawn?: (ctx: GameContext, id: string, catalogId: string, position: EntityPosition) => void;
  /** Called every tick between waves; true releases `nextWave` (1-based). */
  gate?: (ctx: GameContext, dt: number, nextWave: number) => boolean;
  onWave?: (ctx: GameContext, wave: number) => void;
  onCleared?: (ctx: GameContext) => void;
}

function freshRuntime(): FrontRuntime {
  return {
    started: false,
    cleared: false,
    units: new Map(),
    waveUnits: [],
    orders: { scrapjack: null, ripper: null },
    posts: new Map(),
    hunting: new Map(),
    boss: null,
    roleTimer: 0,
    huntTimer: 0,
    lastNoiseAt: -Infinity,
    elapsed: 0,
    nextWaveIn: 0,
    pressure: null,
    cover: [],
    stageBossFraction: null,
    seq: 0,
    run: null,
    everCleared: false,
  };
}

const runtimeOf = perContext(freshRuntime);
const encounterOf = perContext(() => createEncounter({ definition: FRONT_WAVES, seed: FRONT_SEED }));
/** The encounter as authored, before any wave opened: what a fresh run of the front restores. */
const pristineEncounter = createEncounter({ definition: FRONT_WAVES, seed: FRONT_SEED }).snapshot();
const huntOf = perContext((ctx) => createShotHunt(() => huntingRoster(ctx), {
  hearingRange: HEARING_RANGE,
  memorySeconds: MEMORY_SECONDS,
  maxInvestigators: MAX_INVESTIGATORS,
  giveUpConfidence: 0.2,
  maxSeconds: 20,
}));

function siteCenter(): { x: number; z: number } {
  const marker = findEditorMarker(authoredScene, "front_rustflat_center");
  if (marker === undefined) throw new Error("editor.scene.json: missing marker \"front_rustflat_center\"");
  return { x: marker.position.x, z: marker.position.z };
}

const SITE = siteCenter();

function distance2d(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function factionOf(def: EnemyDef): Faction {
  return def.family === "ripper" || def.id === FOREMAN_ID ? "ripper" : "scrapjack";
}

/**
 * Hand a squad its duties from where it stands right now, then give each fighter the role its crew
 * dials for that duty. This is the whole difference between the two groups: the engine decides who
 * holds, flanks and takes cover, and the crew's role table decides what those words mean.
 */
export function assignFrontDuties(
  faction: Faction,
  fighters: readonly FighterState[],
  threat: Vec3 | null,
): { intents: Map<string, FightIntent>; roles: Map<string, SquadRole>; counts: Record<FightIntent, number>; reason: string } {
  const orders = assignFightIntents({ fighters, threat, retreatBelow: 0.25 });
  const ids = fighters.map((fighter) => fighter.id);
  const composition = compositionForIntents(ids, orders.intents, roleFor(faction));
  const roles = assignSquadRoles(ids, composition);
  return { intents: orders.intents, roles, counts: orders.counts, reason: orders.reason };
}

/** How hard the front leans, always bounded by the authored cap. */
export function frontPressure(reading: PressureReading): PressurePlan {
  return evaluatePressure(reading, FRONT_PRESSURE);
}

/** One boss-clock step, exposed so a test can drive the same function the game drives. */
export function stepForeman(state: BossState, healthFraction: number, dt: number): BossStep {
  return advanceBoss(FOREMAN_PHASES, state, healthFraction, dt);
}

function playerHealthFraction(ctx: GameContext): number {
  const stats = ctx.scene.entity.stats.get(ctx.player.userId, "health");
  if (stats === null || stats.max <= 0) return 1;
  return Math.max(0, stats.current) / stats.max;
}

/** The bounded roster a shot can be heard by: living enemies around the player. */
function huntingRoster(ctx: GameContext): readonly { id: string; position: Vec3 }[] {
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return [];
  const radius = HEARING_RANGE * SHOT_LOUDNESS.launcher!;
  return ctx.scene.entity
    .inRadius(player.position, radius, (id) => {
      const entity = ctx.scene.entity.get(id);
      return entity !== null && enemyById(entity.name) !== undefined;
    })
    .map((id) => {
      const entity = ctx.scene.entity.get(id)!;
      return { id: entity.id, position: [entity.position[0], entity.position[1], entity.position[2]] as const };
    });
}

/**
 * A loud shot. Every gun family carries its own hearing weight, so a pistol pulls a couple of
 * enemies and a shotgun pulls the room; the hunt keeps the count and the give-up.
 */
export function noteShotNoise(ctx: GameContext, itemId: string, position?: EntityPosition): void {
  const nowMs = ctx.time.now() * 1000;
  const runtime = runtimeOf(ctx);
  if (nowMs - runtime.lastNoiseAt < 180) return;
  const player = ctx.scene.entity.get(ctx.player.userId);
  const at = position ?? player?.position;
  if (at === undefined) return;
  runtime.lastNoiseAt = nowMs;
  const family = gunById(itemId)?.family;
  const loudness = family === undefined ? 1 : SHOT_LOUDNESS[family] ?? 1;
  huntOf(ctx).noise({ sourceId: ctx.player.userId, position: [at[0], at[1], at[2]], at: nowMs, loudness });
}

/** True while the front owns this entity, so the zone AI leaves its orders alone. */
export function isFrontUnit(ctx: GameContext, id: string): boolean {
  return runtimeOf(ctx).units.has(id);
}

/** Where an investigating enemy last heard the shot, or null once the memory has faded. */
export function huntTargetFor(ctx: GameContext, id: string): EntityPosition | null {
  return runtimeOf(ctx).hunting.get(id) ?? null;
}

/** What the front is doing, for a HUD, a capture probe or a test. */
export function frontStatus(ctx: GameContext): {
  started: boolean;
  cleared: boolean;
  wave: number;
  living: number;
  boss: string | null;
  hunting: number;
} {
  const runtime = runtimeOf(ctx);
  return {
    started: runtime.started,
    cleared: runtime.cleared,
    wave: encounterOf(ctx).view().wave,
    living: runtime.units.size,
    boss: runtime.boss?.stance ?? null,
    hunting: runtime.hunting.size,
  };
}

/** Numeric form for `capture.probe`, which only carries numbers. */
export function frontProbe(ctx: GameContext): Record<string, number> {
  const status = frontStatus(ctx);
  const phase = status.boss === null ? -1 : FOREMAN_PHASES.findIndex((entry) => entry.id === status.boss);
  const boss = runtimeOf(ctx).boss;
  const health = boss === null ? null : ctx.scene.entity.stats.get(boss.id, "health");
  return {
    frontStarted: status.started ? 1 : 0,
    frontCleared: status.cleared ? 1 : 0,
    frontWave: status.wave,
    frontLiving: status.living,
    frontPhase: phase,
    frontHunting: status.hunting,
    frontBossHealth: health === null ? -1 : Math.round(health.current),
    frontBossMax: health === null ? -1 : Math.round(health.max),
  };
}

function buildCover(ctx: GameContext): CoverPoint[] {
  const boxes: CoverSolid[] = [];
  for (const solid of ctx.world.solids.all()) {
    if (distance2d(solid.center, [SITE.x, 0, SITE.z]) > 45) continue;
    boxes.push(solid);
  }
  for (const object of ctx.scene.object.list()) {
    if (!COVER_PROPS.has(object.catalogId)) continue;
    if (distance2d(object.position, [SITE.x, 0, SITE.z]) > 34) continue;
    boxes.push({
      center: [object.position[0], object.position[1], object.position[2]],
      halfExtents: [1.1, 1.2, 1.1],
      rotationY: object.rotationY,
    });
  }
  return coverPointsFromSolids(boxes, {
    standOff: 0.9,
    spacing: 2.2,
    yOf: (x, z) => ctx.world.groundHeightAt(x, z),
  });
}

function openWave(ctx: GameContext, index: number): void {
  const runtime = runtimeOf(ctx);
  const health = playerHealthFraction(ctx);
  runtime.pressure = frontPressure({
    health,
    progress: index / FRONT_WAVE_COUNT,
    elapsed: runtime.elapsed,
  });
  runtime.waveUnits = [];
  runtime.nextWaveIn = 0;
  const encounter = encounterOf(ctx);
  // The authored schedule is emitted by `update`, which honours each group's `at`; spawning the
  // returned list here would put the whole wave on the field at once.
  encounter.openWave(index, runtime.pressure);
  const label = encounter.waveAt(index)?.label ?? "";
  if (label.length > 0) ctx.game.notices.push({ text: `THE FRONT — ${label.toUpperCase()}`, tone: "warn", ttlMs: 2600 });
  runtime.run?.onWave?.(ctx, index + 1);
}

function resolveEntry(entry: string): { x: number; z: number } {
  const marker = findEditorMarker(authoredScene, entry);
  if (marker === undefined) throw new Error(`editor.scene.json: missing front entry "${entry}"`);
  return { x: marker.position.x, z: marker.position.z };
}

function spawnOrder(ctx: GameContext, order: EncounterOrder): void {
  const entry = resolveEntry(order.entry);
  spawnFrontUnit(ctx, order.unit, entry, order.waveId);
}

/**
 * Put one fighter on the front near `around`, enrolled in its crew and the open wave. The encounter's
 * orders come through here, and so does anything a run adds on top (a twin, an escort).
 */
export function spawnFrontUnit(ctx: GameContext, unit: string, around: { x: number; z: number }, waveId = "extra"): string | null {
  const runtime = runtimeOf(ctx);
  const def = enemyById(unit);
  if (def === undefined) return null;
  const order = { unit, waveId };
  const angle = ctx.rng() * Math.PI * 2;
  const radius = 1.4 + ctx.rng() * 3.6;
  const x = around.x + Math.cos(angle) * radius;
  const z = around.z + Math.sin(angle) * radius;
  const position: EntityPosition = [x, ctx.world.groundHeightAt(x, z), z];
  runtime.seq += 1;
  const id = `front_${order.waveId}_${runtime.seq}`;
  ctx.scene.entity.spawn(order.unit, { id, position });
  rememberHome(ctx, id, position);
  runtime.units.set(id, { catalogId: order.unit, faction: factionOf(def) });
  runtime.waveUnits.push(id);
  runtime.run?.onSpawn?.(ctx, id, order.unit, position);

  if (order.unit === ELITE_TELL.unit) {
    ctx.game.notices.push({ text: ELITE_TELL.text, tone: "warn", ttlMs: ELITE_TELL.windupMs + 800 });
    ctx.game.audio.play("bark_alert", position);
    ctx.scene.entity.telegraph({
      from: id,
      shape: { kind: "circle", radius: ELITE_TELL.radius },
      at: [x, position[1], z],
      windupMs: ELITE_TELL.windupMs,
      effect: { effect: "damage", via: { amount: ELITE_TELL.damage }, radius: ELITE_TELL.radius },
    });
  }
  if (order.unit === FOREMAN_ID) {
    runtime.boss = { id, state: createBossState(FOREMAN_PHASES), stance: FOREMAN_PHASES[0]!.id };
    if (runtime.stageBossFraction !== null) {
      // Capture staging only: the boss arrives already worn down, so one real hit crosses a phase.
      const stats = ctx.scene.entity.stats.get(id, "health");
      if (stats !== null) {
        const target = Math.round(stats.max * runtime.stageBossFraction);
        ctx.scene.entity.stats.delta(id, "health", target - stats.current);
      }
      runtime.stageBossFraction = null;
    }
    ctx.game.notices.push({ text: FOREMAN_TELL_TEXT.wake ?? "", tone: "warn", ttlMs: 2600 });
    ctx.game.audio.play("wave", position);
  }
  return id;
}

/** Where a fighter in each crew wants to be, from its duty and its crew's dials. */
function postFor(
  ctx: GameContext,
  role: SquadRole,
  intent: FightIntent,
  id: string,
  position: EntityPosition,
  threat: EntityPosition,
  side: number,
  taken: Set<string>,
): EntityPosition {
  const home = homeOf(ctx, id) ?? position;
  if (intent === "hold" || intent === "retreat") return home;
  const range = Math.max(1, role.preferredRange ?? 6);
  if (intent === "cover") {
    const candidates = coverPointsNear(runtimeOf(ctx).cover, position, 16, 20);
    const choice = selectCover(candidates, {
      position: [position[0], position[1], position[2]],
      radius: 16,
      threats: [{ id: "threat", position: threat, confidence: 1 }],
      preferredRange: range,
      flankAngle: (role.flankAngle ?? 0) * side,
      lineThrough: position,
      taken,
      blocked: (from, to) => blockedSegment(ctx, from, to),
      weights: role.cover,
    });
    if (choice !== null) {
      taken.add(choice.point.id);
      return [choice.point.position[0], choice.point.position[1], choice.point.position[2]];
    }
  }
  const angle = Math.atan2(position[0] - threat[0], position[2] - threat[2]) + (role.flankAngle ?? 0) * side;
  return [threat[0] + Math.sin(angle) * range, threat[1], threat[2] + Math.cos(angle) * range];
}

function blockedSegment(ctx: GameContext, from: Vec3, to: Vec3): boolean {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return false;
  return ctx.scene.raycast({
    origin: [from[0], from[1] + 0.6, from[2]],
    direction: [dx / length, 0, dz / length],
    maxDistance: length,
    filter: { entities: false, objects: true, walls: true, terrain: false },
  }) !== null;
}

/** The nearest hostile to a squad's centre, or the player when they are closer than any rival. */
function threatFor(
  ctx: GameContext,
  faction: Faction,
  fighters: readonly FighterState[],
  playerId: string,
  playerPos: EntityPosition,
): { point: EntityPosition; id: string } | null {
  const centre: Vec3 = [
    fighters.reduce((sum, fighter) => sum + fighter.position[0], 0) / fighters.length,
    0,
    fighters.reduce((sum, fighter) => sum + fighter.position[2], 0) / fighters.length,
  ];
  const playerDowned = reservePhase(ctx) === "downed";
  let best: { point: EntityPosition; id: string } | null = playerDowned
    ? null
    : { point: playerPos, id: playerId };
  let bestDistance = best === null ? Number.POSITIVE_INFINITY : distance2d(centre, playerPos);
  for (const [id, unit] of runtimeOf(ctx).units) {
    if (unit.faction === faction) continue;
    const entity = ctx.scene.entity.get(id);
    if (entity === null) continue;
    const distance = distance2d(centre, entity.position);
    if (distance >= bestDistance) continue;
    best = { point: entity.position, id: entity.id };
    bestDistance = distance;
  }
  return best;
}

function thinkSquad(ctx: GameContext, faction: Faction, playerId: string, playerPos: EntityPosition): void {
  const runtime = runtimeOf(ctx);
  const ids = [...runtime.units].filter(([, unit]) => unit.faction === faction).map(([id]) => id);
  const fighters: FighterState[] = [];
  for (const id of ids) {
    const entity = ctx.scene.entity.get(id);
    const def = enemyById(entity?.name ?? "");
    if (entity === null || def === undefined || def.family === "boss") continue;
    const health = ctx.scene.entity.stats.get(id, "health");
    const fraction = health === null || health.max <= 0 ? 0 : Math.max(0, health.current) / health.max;
    fighters.push({ id, position: [entity.position[0], entity.position[1], entity.position[2]], health: fraction });
  }
  if (fighters.length === 0) {
    runtime.orders[faction] = null;
    return;
  }
  const threat = threatFor(ctx, faction, fighters, playerId, playerPos);
  const assignments = assignFrontDuties(faction, fighters, threat?.point ?? null);
  runtime.orders[faction] = {
    intents: assignments.intents,
    roles: assignments.roles,
    threat: threat?.point ?? null,
    threatId: threat?.id ?? null,
    reason: assignments.reason,
  };

  const taken = new Set<string>();
  let side = 1;
  for (const fighter of fighters) {
    const intent = assignments.intents.get(fighter.id) ?? "assault";
    const role = assignments.roles.get(fighter.id) ?? roleFor(faction)(intent);
    if (threat === null) continue;
    runtime.posts.set(
      fighter.id,
      postFor(ctx, role, intent, fighter.id, fighter.position, threat.point, side, taken),
    );
    if (intent === "flank") side = -side;
  }
}

/** One living front fighter: walk it to its post and let it fight from there. */
function driveUnit(ctx: GameContext, id: string, nowMs: number, dt: number): void {
  const runtime = runtimeOf(ctx);
  const entity = ctx.scene.entity.get(id);
  if (entity === null) return;
  const def = enemyById(entity.name);
  if (def === undefined) return;

  const heardAt = runtime.hunting.get(id);
  if (heardAt !== undefined) {
    ctx.scene.entity.moveTowardCommit(id, heardAt, { speed: def.walkSpeed, stopDistance: 1.2, dt });
    return;
  }

  // The Foreman has its own clock and stance; squad duties never drive it.
  if (runtime.boss?.id === id) return;

  const faction = factionOf(def);
  const orders = runtime.orders[faction];
  if (orders === null || orders.threat === null || orders.threatId === null) return;
  const post = runtime.posts.get(id) ?? orders.threat;
  if (distance2d(entity.position, post) > 1.1) {
    ctx.scene.entity.moveTowardCommit(id, post, { speed: def.walkSpeed, stopDistance: 0.8, dt });
  }
  tickEnemyAttack(ctx, def, id, entity.position, orders.threatId, orders.threat, dt, nowMs, { stationary: true });
}

/** The Foreman's own clock: advance its phase, fire its tell, and leave its stance for the driver. */
function tickForeman(ctx: GameContext, nowMs: number, dt: number): void {
  const runtime = runtimeOf(ctx);
  const boss = runtime.boss;
  if (boss === null) return;
  const entity = ctx.scene.entity.get(boss.id);
  const health = ctx.scene.entity.stats.get(boss.id, "health");
  if (entity === null || health === null) {
    runtime.boss = null;
    return;
  }
  const fraction = health.max <= 0 ? 0 : Math.max(0, health.current) / health.max;
  const step = stepForeman(boss.state, fraction, dt);
  if (step.changed) {
    boss.stance = step.phase.id;
    const text = step.tell === null ? undefined : FOREMAN_TELL_TEXT[step.tell.id];
    if (text !== undefined) {
      ctx.game.notices.push({ text, tone: "warn", ttlMs: Math.round((step.tell?.telegraphSeconds ?? 1.5) * 1000) });
    }
    ctx.game.audio.play("bark_alert", entity.position);
    // The tell is also a ground shock: readable, dodgeable, and it makes the new phase felt.
    ctx.scene.entity.telegraph({
      from: boss.id,
      shape: { kind: "circle", radius: 5 },
      at: [entity.position[0], entity.position[1], entity.position[2]],
      windupMs: 900,
      effect: { effect: "damage", via: { amount: 16 }, radius: 5 },
    });
  }
  boss.state = step.state;

  const behaviour = step.phase.behaviour;
  const stance = FOREMAN_STANCE[step.phase.id];
  const player = ctx.scene.entity.get(ctx.player.userId);
  const playerDowned = reservePhase(ctx) === "downed";
  if (player === null || playerDowned) return;
  if (distance2d(entity.position, player.position) > (behaviour.preferredRange ?? 3) * 1.2) {
    ctx.scene.entity.moveTowardCommit(boss.id, player.position, {
      speed: 3.2 * (stance?.speedScale ?? 1),
      stopDistance: behaviour.preferredRange ?? 3,
      dt,
    });
  }
  const intervalMs = behaviour.discipline?.fireInterval;
  tickEnemyAttack(ctx, enemyById(FOREMAN_ID)!, boss.id, entity.position, ctx.player.userId, player.position, dt, nowMs, {
    stationary: true,
    speedScale: stance?.speedScale ?? 1,
    intervalScale: intervalMs === undefined ? 1 : (intervalMs * 1000) / 1400,
  });
}

function clearFinishedUnits(ctx: GameContext): void {
  const runtime = runtimeOf(ctx);
  for (const id of runtime.waveUnits) {
    if (ctx.scene.entity.get(id) !== null) continue;
    runtime.waveUnits = runtime.waveUnits.filter((candidate) => candidate !== id);
    runtime.units.delete(id);
    runtime.posts.delete(id);
    if (runtime.boss?.id === id) runtime.boss = null;
  }
  for (const id of [...runtime.units.keys()]) {
    if (ctx.scene.entity.get(id) === null) runtime.units.delete(id);
  }
}

function advanceWaves(ctx: GameContext, dt: number): void {
  const runtime = runtimeOf(ctx);
  const encounter = encounterOf(ctx);
  const view = encounter.view();
  runtime.waveUnits = runtime.waveUnits.filter((id) => ctx.scene.entity.get(id) !== null);
  if (runtime.waveUnits.length === 0 && view.emitted >= view.total && !view.done) {
    const gate = view.wave < FRONT_WAVE_COUNT ? runtime.run?.gate : undefined;
    if (gate !== undefined) {
      if (!gate(ctx, dt, view.wave + 1)) return;
    } else {
      runtime.nextWaveIn += dt;
      if (runtime.nextWaveIn < FRONT_WAVE_GAP_SECONDS) return;
    }
    encounter.completeWave();
    const next = encounter.view();
    if (next.done || next.wave > FRONT_WAVE_COUNT) {
      runtime.cleared = true;
      runtime.started = false;
      const run = runtime.run;
      runtime.run = null;
      if (run !== null) {
        run.onCleared?.(ctx);
        return;
      }
      runtime.everCleared = true;
      ctx.game.notices.push({ text: "THE FRONT GOES QUIET — the wreck is yours", tone: "success", ttlMs: 5000 });
      ctx.game.audio.play("victory");
      return;
    }
    openWave(ctx, next.wave - 1);
  }
}

/**
 * One tick of the Rustflat Front: hearing first (a shot is a fact the whole battle shares), then the
 * waves, then one squad pass per crew, then the fighters and the Foreman.
 */
export function tickFront(ctx: GameContext, dt: number): void {
  const runtime = runtimeOf(ctx);
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return;
  const nowMs = ctx.time.now() * 1000;

  runtime.huntTimer -= dt;
  if (runtime.huntTimer <= 0) {
    runtime.huntTimer = HUNT_TICK;
    const investigations = huntOf(ctx).heard(nowMs);
    const next = new Map<string, EntityPosition>();
    for (const investigation of investigations) {
      next.set(investigation.hunterId, [
        investigation.position[0],
        investigation.position[1],
        investigation.position[2],
      ]);
    }
    runtime.hunting = next;
  }

  if (runtime.cleared) return;
  const centre: Vec3 = [SITE.x, 0, SITE.z];
  const distance = distance2d(player.position, centre);
  if (!runtime.started) {
    if (distance <= FRONT_ACTIVATION_RADIUS) {
      runtime.started = true;
      runtime.cover = buildCover(ctx);
      ctx.game.notices.push({ text: "THE RUSTFLAT FRONT — two crews are tearing at the wreck", tone: "warn", ttlMs: 4500 });
      openWave(ctx, 0);
    }
    return;
  }
  if (distance > FRONT_LEAVE_RADIUS || reservePhase(ctx) === "downed") return;

  runtime.elapsed += dt;
  const encounter = encounterOf(ctx);
  for (const order of encounter.update(dt)) spawnOrder(ctx, order);

  runtime.roleTimer -= dt;
  if (runtime.roleTimer <= 0) {
    runtime.roleTimer = FRONT_ROLE_INTERVAL;
    thinkSquad(ctx, "scrapjack", ctx.player.userId, player.position);
    thinkSquad(ctx, "ripper", ctx.player.userId, player.position);
  }

  for (const id of [...runtime.waveUnits]) driveUnit(ctx, id, nowMs, dt);
  tickForeman(ctx, nowMs, dt);
  clearFinishedUnits(ctx);
  advanceWaves(ctx, dt);
}

/**
 * Capture-harness staging: open the front's last wave and set the Foreman just above its second
 * phase, so one real shot drives a real `advanceBoss` transition in front of the camera. Registered
 * only in dev builds (`front.capture`); play reaches the same fight by clearing the first three
 * waves.
 */
export function stageFrontBoss(ctx: GameContext): void {
  const runtime = runtimeOf(ctx);
  for (const id of [...runtime.units.keys()]) ctx.scene.entity.despawn(id);
  runtime.started = true;
  runtime.cleared = false;
  runtime.units.clear();
  runtime.waveUnits = [];
  runtime.posts.clear();
  runtime.boss = null;
  runtime.cover = buildCover(ctx);
  // Stand the player on the spawn side of the wreck, facing it, so the shot frames the fight the
  // staged wave produces rather than the back of the player's head.
  runtime.stageBossFraction = 0.64;
  openWave(ctx, FRONT_WAVE_COUNT - 1);
  const encounter = encounterOf(ctx);
  for (const order of encounter.update(4)) spawnOrder(ctx, order);
  frameBoss(ctx);
}

/** Capture staging for the opening wave: face the wreck and put the probe on the field at once. */
export function stageFrontFight(ctx: GameContext): void {
  const runtime = runtimeOf(ctx);
  for (const id of [...runtime.units.keys()]) ctx.scene.entity.despawn(id);
  runtime.started = true;
  runtime.cleared = false;
  runtime.units.clear();
  runtime.waveUnits = [];
  runtime.posts.clear();
  runtime.boss = null;
  runtime.cover = buildCover(ctx);
  frameFront(ctx);
  openWave(ctx, 0);
  const encounter = encounterOf(ctx);
  for (const order of encounter.update(4)) spawnOrder(ctx, order);
}

function clearField(ctx: GameContext): void {
  const runtime = runtimeOf(ctx);
  for (const id of [...runtime.units.keys()]) ctx.scene.entity.despawn(id);
  runtime.units.clear();
  runtime.waveUnits = [];
  runtime.posts.clear();
  runtime.hunting.clear();
  runtime.orders = { scrapjack: null, ripper: null };
  runtime.boss = null;
  runtime.nextWaveIn = 0;
}

/**
 * Fight the whole front again with a run laid over it: the field is cleared, the encounter goes back
 * to its authored first wave, and every arrival passes through the run's hooks.
 */
export function startFrontRun(ctx: GameContext, hooks: FrontRunHooks): void {
  const runtime = runtimeOf(ctx);
  clearField(ctx);
  encounterOf(ctx).restore(pristineEncounter);
  runtime.run = hooks;
  runtime.started = true;
  runtime.cleared = false;
  runtime.elapsed = 0;
  runtime.cover = buildCover(ctx);
  openWave(ctx, 0);
}

/** Stop a run: its fighters leave the field and the front stays quiet until the next run. */
export function abortFrontRun(ctx: GameContext): void {
  const runtime = runtimeOf(ctx);
  clearField(ctx);
  encounterOf(ctx).restore(pristineEncounter);
  runtime.run = null;
  runtime.started = false;
  runtime.cleared = true;
}

export function frontRunActive(ctx: GameContext): boolean {
  return runtimeOf(ctx).run !== null;
}

/** True once the plain front was fought to the end in this session. */
export function frontEverCleared(ctx: GameContext): boolean {
  return runtimeOf(ctx).everCleared;
}

/** The fighters on the field right now. */
export function frontUnitIds(ctx: GameContext): readonly string[] {
  return [...runtimeOf(ctx).units.keys()];
}

/** The wreck the front is fought over. */
export const FRONT_SITE: { readonly x: number; readonly z: number } = SITE;

function frameFront(ctx: GameContext): void {
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return;
  // The first-person camera keeps its own yaw; stand on that yaw's line through the wreck so the
  // staged fight is framed instead of sitting 18 degrees off the crosshair.
  const forwardX = Math.sin(PLAYER_SPAWN_YAW);
  const forwardZ = Math.cos(PLAYER_SPAWN_YAW);
  const x = SITE.x - forwardX * 9;
  const z = SITE.z - forwardZ * 9;
  ctx.scene.entity.update(ctx.player.userId, {
    position: [x, ctx.world.groundHeightAt(x, z), z],
    rotationY: PLAYER_SPAWN_YAW,
  });
}

/** Put the staged Foreman on the open road in the opening view, where the camera is proven to look. */
function frameBoss(ctx: GameContext): void {
  const runtime = runtimeOf(ctx);
  const boss = runtime.boss;
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (boss === null || player === null) return;
  const forwardX = Math.sin(PLAYER_SPAWN_YAW);
  const forwardZ = Math.cos(PLAYER_SPAWN_YAW);
  const px = PLAYER_SPAWN[0] + forwardX * 10;
  const pz = PLAYER_SPAWN[2] + forwardZ * 10;
  ctx.scene.entity.update(ctx.player.userId, {
    position: [px, ctx.world.groundHeightAt(px, pz), pz],
    rotationY: PLAYER_SPAWN_YAW,
  });
  const x = px + forwardX * 10;
  const z = pz + forwardZ * 10;
  const position: EntityPosition = [x, ctx.world.groundHeightAt(x, z), z];
  ctx.scene.entity.update(boss.id, { position });
  rememberHome(ctx, boss.id, position);
}
