import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { Encounter } from "@jgengine/core/ai/director/encounter";
import { assignFightIntents, type FightIntent } from "@jgengine/core/ai/director/roles";
import { evaluatePressure, type PressurePlan, type PressureRule } from "@jgengine/core/ai/director/pressure";
import { createSoundHunt, type SoundHunt } from "@jgengine/core/ai/director/sound";
import { startEncounter, updateEncounter, phaseStatus } from "@jgengine/core/combat/encounterSequence";
import { createPerception, type PerceptionService } from "@jgengine/core/sensor/perception";

import { combatantDef } from "../catalog";
import { ARRIVE_RADIUS, ENEMY_WAVE_INTERVAL, ENEMY_WAVE_MAX_FIELDED } from "../tuning";
import { playerKeepPoint } from "../world/scene";
import { livingUnits, session, type UnitRuntime } from "../session";
import { MARCH_PLAN, WAVE_CYCLE } from "./waveManifest";

/**
 * The Marauder war effort, driven by engine pieces instead of one scripted order:
 *
 * - `ai/director/encounterSequence` gates the plan: scout, expand, then attack forever.
 * - `ai/director/encounter` authors each attack wave (composition, timing, pressure growth).
 * - `ai/director/pressure` reads the player's health, progress and time for the wave size.
 * - `ai/director/roles` decides which Marauder holds, which flanks and which pushes, from where the
 *   squad stands right now.
 * - `sensor/perception` + `ai/director/sound` let a scout find the player and a fight pull nearby
 *   patrols to the noise.
 *
 * This module only turns engine decisions into the game's own commands; it never decides timing,
 * composition or roles itself.
 */

const SCOUT_SQUAD = 2;
const ROLE_INTERVAL = 2;
const CONTACT_RADIUS = 16;

/** Sizing rule for a Marauder wave: the healthier and further ahead the player is, the larger it is. */
const MARCH_PRESSURE: PressureRule = {
  healthWeight: 0.5,
  progressWeight: 1,
  timeWeight: 0.4,
  timeFloorSeconds: 180,
  timeWindowSeconds: 720,
  maxTier: 2,
};

type PlanState = ReturnType<typeof startEncounter>["state"];

export interface EnemyWaveState {
  plan: PlanState;
  /** Attack waves authored for this run. */
  encounter: Encounter;
  /** Waves mustered so far. */
  sent: number;
  /** Seconds of opening grace remaining before the plan starts. */
  grace: number;
  /** The forward camp the Marauders raised, if it still stands. */
  campId: string | null;
  /** Units of the wave currently on the field, for role assignment. */
  waveUnits: string[];
  /** Seconds until the next role pass. */
  roleTimer: number;
  /** Pressure tier the last wave was sized at. */
  tier: number;
  /** The full plan the last wave was sized with, so a test or the HUD can name the rule. */
  lastPressure: PressurePlan;
  /** Units currently walking to a noise, with where they were sent. */
  hunting: Record<string, { x: number; z: number }>;
  /** The scouting party sent during the plan's scout phase. */
  scouts: string[];
  /** Game second the scouts first saw something of the player's. */
  contactAt: number;
  /** True once a scout has seen anything of the player's; the plan's contact flag reads it. */
  contacted: boolean;
}

/** The enemy's eyes and ears, built once per session: one service for the whole camp. */
function sensesOf(): PerceptionService {
  session.senses ??= createPerception({
    sightRange: 20,
    sightConeDeg: 360,
    hearingRange: 24,
    memorySeconds: 6,
    squadMates: (observerId) => Object.keys(session.enemyPositions).filter((id) => id !== observerId),
  });
  return session.senses;
}

/** Noise investigations, built on first use so a fresh session starts clean. */
function huntOf(): SoundHunt {
  session.hunt ??= createSoundHunt({
    perception: sensesOf(),
    hearingRange: 24,
    maxInvestigators: 4,
    hunters: () =>
      Object.entries(session.enemyPositions).map(([id, point]) => ({
        id,
        position: [point.x, 0, point.z] as const,
      })),
  });
  return session.hunt;
}

/** Marks when the Marauders last laid eyes on something of the player's, in game seconds. */
export function lastContactSeconds(): number {
  return session.enemyWave.contactAt;
}

/** Where waves march: the live player keep if it still stands, else the authored keep point. */
function assaultTarget(): { x: number; z: number } {
  const keep = livingUnits("player", "building").find((u) => u.catalogId === "keep_player");
  if (keep?.guardPoint !== undefined) return keep.guardPoint;
  return playerKeepPoint();
}

/** The camp a wave can muster from: the forward camp if it stands, else the home warcamp. */
function musterCamp(ctx: GameContext): { id: string; point: { x: number; z: number } } | null {
  const forward = session.enemyWave.campId;
  const wanted = forward !== null ? [forward, "warcamp"] : ["warcamp"];
  for (const id of wanted) {
    const entity = ctx.scene.entity.get(id);
    if (entity === null) continue;
    return { id, point: { x: entity.position[0], z: entity.position[2] } };
  }
  const living = livingUnits("enemy", "building").find((u) => combatantDef(u.catalogId)?.id === "keep_enemy" || u.catalogId === "warcamp");
  if (living === undefined || living.guardPoint === undefined) return null;
  return { id: living.id, point: living.guardPoint };
}

function spawnEnemyUnit(ctx: GameContext, catalogId: string, x: number, z: number, command: UnitRuntime["command"]): string {
  session.trainSeq += 1;
  const id = `${catalogId}_w${session.enemyWave.sent}s${session.trainSeq}`;
  ctx.scene.entity.spawn(catalogId, { id, position: [x, 0, z], role: "npc" });
  const unit: UnitRuntime = {
    id,
    catalogId,
    faction: "enemy",
    kind: "unit",
    command,
    leash: 0,
    attackCooldown: 0,
  };
  session.units.set(id, unit);
  return id;
}

/** Fan one group of a mustered wave in front of the camp, then hand it its orders. */
function musterWave(ctx: GameContext, camp: { x: number; z: number }, units: readonly string[], target: { x: number; z: number }): void {
  const dx = target.x - camp.x;
  const dz = target.z - camp.z;
  const length = Math.hypot(dx, dz) || 1;
  const fx = dx / length;
  const fz = dz / length;
  const px = -fz;
  const pz = fx;

  for (let index = 0; index < units.length; index += 1) {
    const lane = ((index % 5) - 2) * 1.9;
    const rank = Math.floor(index / 5) * 2;
    const x = camp.x + fx * (6 + rank) + px * lane;
    const z = camp.z + fz * (6 + rank) + pz * lane;
    const id = spawnEnemyUnit(ctx, units[index]!, x, z, { kind: "attackMove", x: target.x, z: target.z });
    session.enemyWave.waveUnits.push(id);
  }
}

function flankPoint(target: { x: number; z: number }, from: { x: number; z: number }, side: number): { x: number; z: number } {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const length = Math.hypot(dx, dz) || 1;
  const offset = Math.min(26, Math.max(6, length * 0.45));
  return { x: target.x - (dz / length) * offset * side, z: target.z + (dx / length) * offset * side };
}

/** Apply one duty to a Marauder as the game's own command. */
function commandFor(
  intent: FightIntent,
  unitId: string,
  position: { x: number; z: number },
  target: { x: number; z: number },
  home: { x: number; z: number },
  side: number,
): void {
  const unit = session.units.get(unitId);
  if (unit === undefined) return;
  if (intent === "flank") {
    const point = flankPoint(target, position, side);
    unit.command = { kind: "attackMove", x: point.x, z: point.z };
    return;
  }
  if (intent === "hold") {
    unit.command = { kind: "hold" };
    unit.guardPoint = { x: position.x, z: position.z };
    unit.leash = ARRIVE_RADIUS * 4;
    return;
  }
  if (intent === "retreat") {
    unit.command = { kind: "move", x: home.x, z: home.z };
    return;
  }
  unit.command = { kind: "attackMove", x: target.x, z: target.z };
}

/**
 * Re-read the live squad and hand out duties. Runs a few times a second, not per frame, and only for
 * the wave on the field: a flanker walks around the objective, the anchor holds where it stands,
 * everyone else pushes.
 */
function assignWaveRoles(ctx: GameContext): void {
  const wave = session.enemyWave;
  wave.waveUnits = wave.waveUnits.filter((id) => ctx.scene.entity.get(id) !== null);
  if (wave.waveUnits.length < 3) return;
  const target = assaultTarget();
  const camp = musterCamp(ctx);
  const home = camp === null ? target : camp.point;
  const fighters = wave.waveUnits.map((id) => {
    const entity = ctx.scene.entity.get(id)!;
    const health = ctx.scene.entity.stats.get(id, "health");
    const fraction = health === null || health.max <= 0 ? 0 : Math.max(0, health.current) / health.max;
    return { id, position: [entity.position[0], entity.position[1], entity.position[2]] as const, health: fraction };
  });
  const orders = assignFightIntents({ fighters, threat: [target.x, 0, target.z], retreatBelow: 0.25 });
  let side = 1;
  for (const fighter of fighters) {
    const intent = orders.intents.get(fighter.id) ?? "assault";
    commandFor(intent, fighter.id, { x: fighter.position[0], z: fighter.position[2] }, target, home, side);
    if (intent === "flank") side = -side;
  }
}

/** One beat of the attack phase: size the wave from the player's state, then muster it. */
function musterNextWave(ctx: GameContext): void {
  const wave = session.enemyWave;
  const camp = musterCamp(ctx);
  if (camp === null) return;
  const target = assaultTarget();
  const pressure = evaluatePressure(
    { health: keepHealthFraction(ctx), progress: Math.min(1, wave.sent / WAVE_CYCLE), elapsed: session.elapsed },
    MARCH_PRESSURE,
  );
  wave.tier = pressure.tier;
  wave.lastPressure = pressure;
  const index = wave.sent % WAVE_CYCLE;
  const orders = wave.encounter.openWave(index, pressure);
  // Never push the field past its cap: a wave takes only the room left, so held waves cannot dump.
  const room = ENEMY_WAVE_MAX_FIELDED - livingUnits("enemy", "unit").length;
  const units = orders.map((order) => order.unit).slice(0, Math.max(0, room));
  if (units.length === 0) return;
  wave.sent += 1;
  wave.waveUnits = [];
  musterWave(ctx, camp.point, units, target);
  ctx.game.audio.play("wave", [camp.point.x, 0, camp.point.z]);
}

function keepHealthFraction(ctx: GameContext): number {
  const keep = livingUnits("player", "building").find((u) => u.catalogId === "keep_player");
  const stats = keep === undefined ? null : ctx.scene.entity.stats.get(keep.id, "health");
  if (stats === null || stats.max <= 0) return 0;
  return Math.max(0, stats.current) / stats.max;
}

/** The forward camp: a Marauder hold halfway to the player, so waves arrive sooner. */
function raiseForwardCamp(ctx: GameContext): void {
  const home = ctx.scene.entity.get("warcamp");
  const target = assaultTarget();
  if (home === null) return;
  const x = home.position[0] + (target.x - home.position[0]) * 0.45;
  const z = home.position[2] + (target.z - home.position[2]) * 0.45;
  const dx = target.x - home.position[0];
  const dz = target.z - home.position[2];
  const length = Math.hypot(dx, dz) || 1;
  const spot = { x: x + (-dz / length) * 7, z: z + (dx / length) * 7 };
  const id = "warcamp_forward";
  if (ctx.scene.entity.get(id) !== null) return;
  ctx.scene.entity.spawn("warcamp", { id, position: [spot.x, 0, spot.z], role: "npc" });
  session.units.set(id, {
    id,
    catalogId: "warcamp",
    faction: "enemy",
    kind: "building",
    command: { kind: "idle" },
    guardPoint: { x: spot.x, z: spot.z },
    leash: 0,
    attackCooldown: 0,
  });
  session.enemyWave.campId = id;
  ctx.game.audio.play("raise", [spot.x, 0, spot.z]);
  ctx.game.notices.push({ text: "The Marauders raise a forward camp", ttlMs: 6000 });
}

/** Send the scouting party: two grunts walk the road toward the player's hold. */
function sendScouts(ctx: GameContext): void {
  const camp = musterCamp(ctx);
  if (camp === null) return;
  const target = assaultTarget();
  for (let index = 0; index < SCOUT_SQUAD; index += 1) {
    const id = spawnEnemyUnit(ctx, "grunt", camp.point.x + index * 1.6, camp.point.z, {
      kind: "attackMove",
      x: target.x,
      z: target.z,
    });
    session.enemyWave.scouts.push(id);
  }
}

/** Look with the shared perception service: enemy eyes against the player's roster. */
function observeEnemySenses(ctx: GameContext): void {
  const enemies = livingUnits("enemy", "unit");
  session.enemyPositions = {};
  for (const enemy of enemies) {
    const entity = ctx.scene.entity.get(enemy.id);
    if (entity !== null) session.enemyPositions[enemy.id] = { x: entity.position[0], z: entity.position[2] };
  }
  if (enemies.length === 0) return;
  const candidates = livingUnits("player", "unit").concat(livingUnits("player", "building")).map((unit) => {
    const entity = ctx.scene.entity.get(unit.id);
    return { id: unit.id, position: entity === null ? [0, 0, 0] as const : entity.position };
  });
  if (candidates.length === 0) return;
  const nowMs = session.elapsed * 1000;
  const senses = sensesOf();
  for (const enemy of enemies) {
    const entity = ctx.scene.entity.get(enemy.id);
    if (entity === null) continue;
    senses.observe({ id: enemy.id, position: entity.position, yaw: 0 }, candidates, nowMs);
  }
  for (const scout of session.enemyWave.scouts) {
    if (ctx.scene.entity.get(scout) === null) continue;
    if (senses.memory(scout).some((memory) => memory.confidence > 0.2)) {
      session.enemyWave.contacted = true;
      session.enemyWave.contactAt = session.elapsed;
      break;
    }
  }
}

/** A noise the Marauders can hear: a fight, an ability, a building coming down. */
export function raiseCombatNoise(ctx: GameContext, position: { x: number; z: number }, sourceId: string): void {
  huntOf().noise({ sourceId, position: [position.x, 0, position.z], at: session.elapsed * 1000, loudness: 1.4 });
  for (const enemy of livingUnits("enemy", "unit")) {
    const entity = ctx.scene.entity.get(enemy.id);
    if (entity === null) continue;
    const distance = Math.hypot(entity.position[0] - position.x, entity.position[2] - position.z);
    if (distance > 26) continue;
    enemy.command = { kind: "attackMove", x: position.x, z: position.z };
  }
}

/**
 * Advance the Marauder plan and everything that hangs off it: plan phases, scouting, the forward
 * camp, attack waves, role assignment and noise investigations.
 */
export function tickEnemyWaves(ctx: GameContext, dt: number): void {
  if (session.over) return;
  const wave = session.enemyWave;

  if (wave.grace > 0) {
    wave.grace -= dt;
    return;
  }

  if (session.units.get("warcamp") !== undefined && ctx.scene.entity.get("warcamp") === null) {
    session.units.delete("warcamp");
  }
  const camp = musterCamp(ctx);
  if (camp === null) return;

  const alive = livingUnits("enemy", "unit").length;
  // A crowded field freezes the plan clock rather than banking waves; it resumes when the roster thins.
  const signals = {
    signals: {
      flags: {
        contact: session.enemyWave.contacted,
        campRaised: session.enemyWave.campId !== null && ctx.scene.entity.get(session.enemyWave.campId) !== null,
      },
    },
  };
  const steps = wave.plan.started
    ? updateEncounter(MARCH_PLAN, wave.plan, alive >= ENEMY_WAVE_MAX_FIELDED ? 0 : dt, signals)
    : startEncounter(MARCH_PLAN, wave.plan, signals);
  wave.plan = steps.state;
  // A repeating phase signals its next beat with another enter, so the beat is the enter itself.
  for (const event of steps.events) {
    if (event.type !== "enter") continue;
    if (event.phaseId === "scout") sendScouts(ctx);
    if (event.phaseId === "expand") raiseForwardCamp(ctx);
    if (event.phaseId === "attack" && alive < ENEMY_WAVE_MAX_FIELDED) musterNextWave(ctx);
  }

  observeEnemySenses(ctx);

  wave.roleTimer -= dt;
  if (wave.roleTimer <= 0) {
    wave.roleTimer = ROLE_INTERVAL;
    assignWaveRoles(ctx);
  }

  const investigations = huntOf().investigations(session.elapsed * 1000);
  const huntingNow = new Set<string>();
  for (const investigation of investigations) {
    const unit = session.units.get(investigation.hunterId);
    if (unit === undefined) continue;
    huntingNow.add(investigation.hunterId);
    wave.hunting[investigation.hunterId] = { x: investigation.position[0], z: investigation.position[2] };
    unit.command = { kind: "attackMove", x: investigation.position[0], z: investigation.position[2] };
  }
  for (const id of Object.keys(wave.hunting)) {
    if (huntingNow.has(id)) continue;
    delete wave.hunting[id];
    const unit = session.units.get(id);
    if (unit === undefined || ctx.scene.entity.get(id) === null) continue;
    // The trail went cold: walk back to the plan rather than stand at the last noise.
    const target = assaultTarget();
    unit.command = { kind: "attackMove", x: target.x, z: target.z };
  }
}

/** Seconds until the next wave musters, for the HUD countdown. */
export function nextWaveEta(): number {
  const wave = session.enemyWave;
  if (wave.grace > 0) return wave.grace;
  if (phaseStatus(wave.plan, "attack") !== "active") return 0;
  const entered = wave.plan.nodes["attack"]?.enteredAt ?? wave.plan.elapsed;
  return Math.max(0, ENEMY_WAVE_INTERVAL - (wave.plan.elapsed - entered));
}

/** What the plan is doing right now, for the HUD. */
export function planPhase(): string {
  const plan = session.enemyWave.plan;
  if (phaseStatus(plan, "scout") === "active") return "scouting";
  if (phaseStatus(plan, "expand") === "active") return "expanding";
  if (phaseStatus(plan, "attack") === "active") return "attacking";
  return "idle";
}

/** The keep point a wave marches on, exposed so tests and the HUD read one source. */
export function marchTarget(): { x: number; z: number } {
  return assaultTarget();
}

/** The squad of the wave currently on the field, for tests and the HUD. */
export function waveSquad(): string[] {
  return [...session.enemyWave.waveUnits];
}

/** A camp entity the Marauders hold, for the HUD arrow. */
export function forwardCamp(ctx: GameContext): SceneEntity | null {
  const id = session.enemyWave.campId;
  return id === null ? null : ctx.scene.entity.get(id);
}

export { CONTACT_RADIUS };
