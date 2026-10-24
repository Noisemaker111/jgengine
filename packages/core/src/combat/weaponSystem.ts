import { devtools } from "../devtools/devtools";
import type { DamageRuntime, DamageRuntimeHitInput, DamageRuntimeResolution } from "./damageRuntime";
import { createMagazine, type Magazine, type MagazineSnapshot } from "./magazine";
import {
  assertWeaponDefinition,
  weaponIntervalMs,
  weaponMaxInFlight,
  type WeaponDefinition,
  type WeaponVec3,
} from "./weaponDefinition";
import {
  createWeaponHandling,
  type WeaponHandling,
  type WeaponHandlingState,
  type WeaponStance,
} from "./weaponHandling";
import { createFireCadence, type FireCadence } from "./weaponFire";
import { SHOT_GRAVITY, resolveShotSpec, shotFalloffAt, shotSpecFromWeapon, type ResolvedShotSpec } from "./shotSpec";

/** Where one pellet met the caller's world. */
export interface WeaponContact {
  /** Damage-runtime target id; omit for geometry that should stop the pellet without taking damage. */
  target?: string;
  /** Hit-zone id from the caller's `HitZoneTable`; omitted uses the table default. */
  zone?: string;
  /** Contact point in world metres. */
  point: WeaponVec3;
}

/** Everything the runtime is allowed to reach: RNG, the damage model, the muzzle, and the world query. */
export interface WeaponSystemDeps {
  /** `[0,1)` stream for spread cones and recoil jitter. Required so shots stay replayable. */
  rng: () => number;
  /** The B2.2 damage model; every hit, hitscan or projectile, is resolved through it. */
  damage: Pick<DamageRuntime, "hit">;
  /** Muzzle or eye position for the next shot, world metres — read once per shot. */
  origin: () => WeaponVec3;
  /** Nearest contact along a ray, or `null`. Required for a hitscan definition. */
  raycast?: (from: WeaponVec3, direction: WeaponVec3, maxRange: number) => WeaponContact | null;
  /** First contact along one projectile travel segment, or `null`. Required for a projectile definition. */
  sweep?: (from: WeaponVec3, to: WeaponVec3) => WeaponContact | null;
  /** Replace the definition's damage mapping for one hit; `null` keeps the hit but skips damage. */
  damageFor?: (contact: WeaponContact, hit: WeaponImpactContext) => DamageRuntimeHitInput | null;
  /** Shots one tick may catch up on (default `4`, clamp `1..16`); bounds rays and sweeps per tick. */
  maxShotsPerTick?: number;
  /** Register a one-line devtools probe under this name. */
  devtoolsName?: string;
}

/** Read-only facts about the hit handed to `damageFor`. */
export interface WeaponImpactContext {
  shot: number;
  pellet: number;
  /** Metres from the shot origin. */
  distance: number;
  /** Damage multiplier at `distance` from the definition's falloff. */
  falloff: number;
}

/** One fired shot: the cone it fired into, the kick it took, and where each pellet went. */
export interface WeaponShotRecord {
  /** Monotonic shot number for this weapon instance, starting at `1`. */
  shot: number;
  /** Cone half-angle this shot fired into, rad, after stance and ADS. */
  spread: number;
  /** Aim kick this shot applied, rad. */
  kickPitch: number;
  kickYaw: number;
  origin: WeaponVec3;
  /** Unit direction of each pellet. */
  directions: readonly WeaponVec3[];
}

/** One resolved hit, with the damage runtime's full provenance. */
export interface WeaponImpact {
  shot: number;
  pellet: number;
  target: string;
  zone: string;
  distance: number;
  falloff: number;
  resolution: DamageRuntimeResolution;
}

/** What one {@link WeaponSystem.tick} produced. Empty arrays on a quiet tick. */
export interface WeaponTickResult {
  shots: readonly WeaponShotRecord[];
  impacts: readonly WeaponImpact[];
}

/** `idle`, `reloading`, or `interrupted` after `interruptReload()` kept the progress. */
export type WeaponReloadState = "idle" | "reloading" | "interrupted";

/** Ammo and cadence as a HUD or a test reads them. */
export interface WeaponAmmo {
  /** Loaded rounds, or `null` for a weapon without a magazine. */
  loaded: number | null;
  capacity: number | null;
  reserve: number | null;
  reload: WeaponReloadState;
  /** Reload progress in `[0, 1]`, retained while interrupted. */
  reloadFraction: number;
  /** Shots left in the current burst; `0` outside one. */
  burstRemaining: number;
  /** Progress toward the next shot in `[0, 1]`. */
  cadenceFraction: number;
}

/** Lifetime ammo economy and resolution counters. */
export interface WeaponStats {
  shots: number;
  /** Loaded rounds spent; `0` for a weapon without a magazine. */
  roundsSpent: number;
  pelletsFired: number;
  burstPulls: number;
  reloadsStarted: number;
  reloadsCompleted: number;
  reloadsInterrupted: number;
  /** Trigger pulls that found an empty magazine. */
  dryPulls: number;
  projectilesSpawned: number;
  projectilesExpired: number;
  /** Pellets thrown away because `maxInFlight` was reached. */
  pelletsDropped: number;
  impacts: number;
  damage: number;
}

/** A pellet alive in flight, for presentation or prediction. */
export interface WeaponProjectileView {
  shot: number;
  pellet: number;
  position: WeaponVec3;
  velocity: WeaponVec3;
  age: number;
  /** Metres travelled from the muzzle. */
  distance: number;
}

/** Serializable runtime state: aim, handling, ammo, trigger, pellets and counters. */
export interface WeaponSystemState {
  aim: { yaw: number; pitch: number };
  handling: WeaponHandlingState;
  magazine: MagazineSnapshot | null;
  cadenceElapsedMs: number;
  trigger: boolean;
  pendingPull: boolean;
  burstRemaining: number;
  shotCount: number;
  stats: WeaponStats;
  pellets: WeaponProjectileView[];
}

/** Current aim with recoil applied. */
export interface WeaponAim {
  yaw: number;
  pitch: number;
  /** Unit direction of the centre of the shot cone. */
  direction: WeaponVec3;
}

/**
 * A weapon as the game drives it: base aim in, shots and resolved impacts out. Fire mode, cadence,
 * handling, delivery, magazine and damage all come from one {@link WeaponDefinition}; the game owns
 * input, the muzzle, and the world query.
 */
export interface WeaponSystem {
  /** Set the aim before recoil; call every frame from look input. */
  setAim(yaw: number, pitch: number): void;
  /** Current aim, including recoil, and the direction the next shot would fly down. */
  aim(): WeaponAim;
  /** Press or release the trigger. A press survives until the next tick that can use it. */
  setTrigger(down: boolean): void;
  trigger(): boolean;
  /** Advance recoil, bloom, reload, pellets and the trigger by `dt`; returns what fired and what landed. */
  tick(dt: number, stance?: WeaponStance): WeaponTickResult;
  /** True when a shot could leave right now: cadence ready, not reloading, ammo available. */
  canFire(): boolean;
  /** Start a reload, or continue an interrupted one. */
  reload(): boolean;
  /** Suspend an in-progress reload and keep its progress. */
  interruptReload(): boolean;
  /** Continue an interrupted reload from where it stopped. */
  resumeReload(): boolean;
  /** Abandon an in-progress reload, discarding progress. */
  cancelReload(): void;
  /** Swap the definition live (attachments, upgrades) without losing ammo, aim or reload progress. */
  retune(next: WeaponDefinition): boolean;
  /** The definition in force. */
  definition(): WeaponDefinition;
  ammo(): WeaponAmmo;
  stats(): WeaponStats;
  /** Live pellets, capped by the definition's `maxInFlight`. */
  pellets(): readonly WeaponProjectileView[];
  /** Handling state for recoil presentation and `measureWeapon`. */
  handling(): WeaponHandling;
  /** The magazine for reserve pickups and external reserve adapters, or `null`. */
  magazine(): Magazine | null;
  snapshot(): WeaponSystemState;
  /** Restore decoded state; returns false without applying when the magazine reserve model differs. */
  restore(state: WeaponSystemState): boolean;
  reset(): void;
  /** Drop the devtools probe registered by `devtoolsName`. Safe to call twice. */
  dispose(): void;
}

const MAX_SHOTS_PER_TICK_CAP = 16;
const DEFAULT_SHOTS_PER_TICK = 4;
const HALF_PI = Math.PI / 2;

interface MutableTick {
  shots: WeaponShotRecord[];
  impacts: WeaponImpact[];
}

function freshStats(): WeaponStats {
  return {
    shots: 0,
    roundsSpent: 0,
    pelletsFired: 0,
    burstPulls: 0,
    reloadsStarted: 0,
    reloadsCompleted: 0,
    reloadsInterrupted: 0,
    dryPulls: 0,
    projectilesSpawned: 0,
    projectilesExpired: 0,
    pelletsDropped: 0,
    impacts: 0,
    damage: 0,
  };
}

function directionOf(yaw: number, pitch: number): WeaponVec3 {
  const cosPitch = Math.cos(pitch);
  return [Math.sin(yaw) * cosPitch, Math.sin(pitch), Math.cos(yaw) * cosPitch];
}

function distanceBetween(a: WeaponVec3, b: WeaponVec3): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function normalize(v: WeaponVec3): WeaponVec3 {
  const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return length === 0 ? [0, 0, 1] : [v[0] / length, v[1] / length, v[2] / length];
}

/** Unit direction inside the cone around `center`, uniform over solid angle from two RNG draws. */
function coneDirection(center: WeaponVec3, halfAngle: number, rng: () => number): WeaponVec3 {
  const angle = Math.min(Math.max(halfAngle, 0), HALF_PI);
  if (angle <= 0) return center;
  const cosHalf = Math.cos(angle);
  const cosTheta = 1 - rng() * (1 - cosHalf);
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  const phi = rng() * Math.PI * 2;
  let right = normalize([center[2], 0, -center[0]]);
  if (center[0] === 0 && center[2] === 0) right = [1, 0, 0];
  const up: WeaponVec3 = [
    center[1] * right[2] - center[2] * right[1],
    center[2] * right[0] - center[0] * right[2],
    center[0] * right[1] - center[1] * right[0],
  ];
  const lateral = Math.cos(phi) * sinTheta;
  const vertical = Math.sin(phi) * sinTheta;
  return normalize([
    center[0] * cosTheta + right[0] * lateral + up[0] * vertical,
    center[1] * cosTheta + right[1] * lateral + up[1] * vertical,
    center[2] * cosTheta + right[2] * lateral + up[2] * vertical,
  ]);
}

interface LivePellet {
  shot: number;
  pellet: number;
  position: WeaponVec3;
  velocity: WeaponVec3;
  age: number;
  distance: number;
}

/**
 * Build a weapon from one {@link WeaponDefinition}. The game supplies aim, a muzzle, one world query,
 * the damage model and an RNG; the runtime owns fire modes, cadence, recoil, bloom, reload states,
 * ammo accounting, projectile ballistics and the damage call. State snapshots as plain data.
 *
 * @capability weapon-system run a data-defined weapon: fire modes, recoil and bloom, hitscan or ballistic projectiles, interrupted reloads and readable ammo, all resolving through the damage runtime
 */
export function createWeaponSystem(initial: WeaponDefinition, deps: WeaponSystemDeps): WeaponSystem {
  assertWeaponDefinition(initial);
  const rng = deps.rng;
  const maxShotsPerTick = Math.min(
    MAX_SHOTS_PER_TICK_CAP,
    Math.max(1, Math.floor(deps.maxShotsPerTick ?? DEFAULT_SHOTS_PER_TICK)),
  );

  function assertWiring(definition: WeaponDefinition, shotSpec: ResolvedShotSpec): void {
    if (shotSpec.mode === "trace" && deps.raycast === undefined) {
      throw new Error(`Weapon "${definition.id}" is hitscan but no raycast was provided`);
    }
    if (shotSpec.mode === "body" && deps.sweep === undefined) {
      throw new Error(`Weapon "${definition.id}" is projectile but no sweep was provided`);
    }
  }
  const initialShot = resolveShotSpec(shotSpecFromWeapon(initial));
  assertWiring(initial, initialShot);

  function buildMagazine(definition: WeaponDefinition): Magazine | null {
    const magazine = definition.magazine;
    if (magazine === undefined) return null;
    return createMagazine({
      capacity: magazine.capacity,
      reloadMs: magazine.reloadMs,
      ...(magazine.reserve !== undefined ? { reserve: magazine.reserve } : {}),
    });
  }

  let definition = initial;
  let shotSpec = initialShot;
  let intervalMs = weaponIntervalMs(initial);
  let cadence: FireCadence = createFireCadence({ intervalMs });
  let magazine = buildMagazine(definition);
  const handling = createWeaponHandling(initial.handling, { random: rng });
  let aimYaw = 0;
  let aimPitch = 0;
  let triggerDown = false;
  let pendingPull = false;
  let burstRemaining = 0;
  let shotCount = 0;
  let dryCounted = false;
  let pellets: LivePellet[] = [];
  const stats = freshStats();

  function reloadState(): WeaponReloadState {
    if (magazine === null) return "idle";
    if (magazine.isPaused()) return "interrupted";
    return magazine.isReloading() ? "reloading" : "idle";
  }

  function aimNow(): WeaponAim {
    const frame = handling.frame();
    const yaw = aimYaw + frame.aimYaw;
    const pitch = Math.max(-HALF_PI * 0.98, Math.min(HALF_PI * 0.98, aimPitch + frame.aimPitch));
    return { yaw, pitch, direction: directionOf(yaw, pitch) };
  }

  function defaultDamage(contact: WeaponContact, target: string, falloff: number): DamageRuntimeHitInput {
    const damage = definition.damage;
    return {
      target,
      type: damage.type,
      base: damage.base * falloff,
      source: definition.id,
      ...(contact.zone !== undefined ? { zone: contact.zone } : {}),
      ...(damage.statuses !== undefined ? { statuses: damage.statuses } : {}),
    };
  }

  function resolveContact(
    contact: WeaponContact,
    distance: number,
    shot: number,
    pellet: number,
    out: MutableTick,
  ): void {
    const target = contact.target;
    if (target === undefined) return;
    const falloff = shotFalloffAt(shotSpec, distance);
    const context: WeaponImpactContext = { shot, pellet, distance, falloff };
    const input = deps.damageFor === undefined
      ? defaultDamage(contact, target, falloff)
      : deps.damageFor(contact, context);
    if (input === null) return;
    const resolution = deps.damage.hit(input);
    stats.impacts += 1;
    stats.damage += resolution.damage;
    out.impacts.push({
      shot,
      pellet,
      target,
      zone: resolution.zone.zone,
      distance,
      falloff,
      resolution,
    });
  }

  function spawnPellet(shotIndex: number, pellet: number, origin: WeaponVec3, direction: WeaponVec3): void {
    const body = shotSpec.body;
    if (body === null) return;
    if (pellets.length >= weaponMaxInFlight(definition)) {
      stats.pelletsDropped += 1;
      return;
    }
    const speed = body.speed;
    pellets.push({
      shot: shotIndex,
      pellet,
      position: origin,
      velocity: [direction[0] * speed, direction[1] * speed, direction[2] * speed],
      age: 0,
      distance: 0,
    });
    stats.projectilesSpawned += 1;
  }

  function fireShot(stance: WeaponStance | undefined, out: MutableTick): void {
    const shot = handling.fire(stance);
    const aim = aimNow();
    const origin: WeaponVec3 = [...deps.origin()];
    const perShot = Math.max(1, Math.floor(definition.pellets ?? 1));
    const directions: WeaponVec3[] = [];
    shotCount += 1;
    for (let pellet = 0; pellet < perShot; pellet += 1) {
      const direction = coneDirection(aim.direction, shot.spread, rng);
      directions.push(direction);
      if (shotSpec.trace !== null) {
        const raycast = deps.raycast;
        if (raycast === undefined) continue;
        const contact = raycast(origin, direction, shotSpec.trace.range);
        if (contact === null) continue;
        const distance = distanceBetween(origin, contact.point);
        if (distance > shotSpec.trace.range + 1e-6) continue;
        resolveContact(contact, distance, shotCount, pellet, out);
      } else {
        spawnPellet(shotCount, pellet, origin, direction);
      }
    }
    cadence.restore(intervalMs);
    cadence.fire();
    magazine?.fire(1);
    stats.shots += 1;
    stats.pelletsFired += perShot;
    if (magazine !== null) stats.roundsSpent += 1;
    dryCounted = false;
    out.shots.push({
      shot: shotCount,
      spread: shot.spread,
      kickPitch: shot.kickPitch,
      kickYaw: shot.kickYaw,
      origin,
      directions,
    });
  }

  function advancePellets(dt: number, out: MutableTick): void {
    const body = shotSpec.body;
    if (pellets.length === 0 || body === null) return;
    const sweep = deps.sweep;
    if (sweep === undefined) return;
    const gravity = body.gravity * SHOT_GRAVITY;
    const drag = body.drag;
    const dragScale = Math.max(0, 1 - drag * dt);
    const next: LivePellet[] = [];
    for (const pellet of pellets) {
      // Semi-implicit Euler: drag the old velocity, apply gravity, then sweep the whole step so a
      // fast pellet cannot tunnel through a thin target between ticks.
      const velocity: WeaponVec3 = [
        pellet.velocity[0] * dragScale,
        pellet.velocity[1] * dragScale - gravity * dt,
        pellet.velocity[2] * dragScale,
      ];
      const to: WeaponVec3 = [
        pellet.position[0] + velocity[0] * dt,
        pellet.position[1] + velocity[1] * dt,
        pellet.position[2] + velocity[2] * dt,
      ];
      const contact = sweep(pellet.position, to);
      if (contact !== null) {
        resolveContact(contact, pellet.distance + distanceBetween(pellet.position, contact.point), pellet.shot, pellet.pellet, out);
        continue;
      }
      const travelled = pellet.distance + distanceBetween(pellet.position, to);
      pellet.position = to;
      pellet.velocity = velocity;
      pellet.age += dt;
      pellet.distance = travelled;
      const outOfRange = travelled >= shotSpec.range;
      if (pellet.age >= body.lifetime || outOfRange) {
        stats.projectilesExpired += 1;
        continue;
      }
      next.push(pellet);
    }
    pellets = next;
  }

  function noteDryPull(): void {
    if (!dryCounted) {
      stats.dryPulls += 1;
      dryCounted = true;
    }
    pendingPull = false;
    if (definition.autoReload !== false) beginReload();
  }

  function wantsShot(): boolean {
    if (burstRemaining > 0) return true;
    if (definition.fireMode === "auto") return triggerDown || pendingPull;
    return pendingPull;
  }

  function beginReload(): boolean {
    if (magazine === null) return false;
    const state = reloadState();
    if (state === "interrupted") return magazine.resumeReload();
    if (state !== "idle") return false;
    if (!magazine.startReload()) return false;
    stats.reloadsStarted += 1;
    burstRemaining = 0;
    pendingPull = false;
    return true;
  }

  function fireDue(dt: number, stance: WeaponStance | undefined, out: MutableTick): void {
    if (!wantsShot()) return;
    if (reloadState() !== "idle") {
      pendingPull = false;
      return;
    }
    if (magazine !== null && !magazine.canFire(1)) {
      noteDryPull();
      return;
    }

    if (pendingPull && definition.fireMode === "burst" && burstRemaining === 0) {
      burstRemaining = definition.burst?.count ?? 1;
      stats.burstPulls += 1;
    }

    const elapsedBefore = cadence.elapsedMs();
    const totalMs = elapsedBefore + Math.max(0, dt) * 1000;
    cadence.tick(dt);
    const due = Math.min(maxShotsPerTick, Math.floor(totalMs / intervalMs));
    let fired = 0;
    while (fired < due && wantsShot()) {
      if (magazine !== null && !magazine.canFire(1)) {
        noteDryPull();
        break;
      }
      fireShot(stance, out);
      fired += 1;
      if (pendingPull) pendingPull = false;
      if (definition.fireMode === "burst") burstRemaining = Math.max(0, burstRemaining - 1);
      if (definition.fireMode !== "auto" && !wantsShot()) break;
    }
    if (fired > 0) cadence.restore(totalMs - fired * intervalMs);
  }

  function probeLine(): string {
    const ammo = magazine;
    const load = ammo === null
      ? "unlimited"
      : `${ammo.loaded()}/${ammo.capacity()}${ammo.reserve() === null ? "" : ` +${ammo.reserve()}`}`;
    return `${definition.id} ${definition.fireMode} · ${stats.shots} shots ${load} · ${pellets.length} in flight · ${stats.impacts} hits ${stats.damage.toFixed(0)} dealt`;
  }

  const unregister = deps.devtoolsName === undefined
    ? null
    : devtools.probes.register(deps.devtoolsName, () => probeLine());

  return {
    setAim(yaw, pitch) {
      aimYaw = yaw;
      aimPitch = Math.max(-HALF_PI, Math.min(HALF_PI, pitch));
    },
    aim: aimNow,
    setTrigger(down) {
      if (down && !triggerDown) pendingPull = true;
      if (!down) dryCounted = false;
      triggerDown = down;
    },
    trigger: () => triggerDown,
    tick(dt, stance) {
      const out: MutableTick = { shots: [], impacts: [] };
      const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
      handling.tick(step, stance);
      if (magazine !== null) {
        const wasReloading = magazine.isReloading();
        magazine.tick(step);
        if (wasReloading && !magazine.isReloading()) stats.reloadsCompleted += 1;
      }
      advancePellets(step, out);
      fireDue(step, stance, out);
      return out;
    },
    canFire() {
      if (reloadState() !== "idle") return false;
      if (!cadence.ready()) return false;
      return magazine === null || magazine.canFire(1);
    },
    reload: beginReload,
    interruptReload() {
      if (magazine === null || !magazine.pauseReload()) return false;
      stats.reloadsInterrupted += 1;
      return true;
    },
    resumeReload: () => magazine?.resumeReload() ?? false,
    cancelReload() {
      magazine?.cancelReload();
    },
    retune(next) {
      assertWeaponDefinition(next);
      const nextShot = resolveShotSpec(shotSpecFromWeapon(next));
      assertWiring(next, nextShot);
      if ((next.magazine === undefined) !== (magazine === null)) return false;
      const elapsed = cadence.elapsedMs();
      definition = next;
      shotSpec = nextShot;
      intervalMs = weaponIntervalMs(next);
      cadence = createFireCadence({ intervalMs });
      cadence.restore(elapsed);
      handling.retune(next.handling);
      if (next.magazine !== undefined && magazine !== null) {
        magazine.retune({ capacity: next.magazine.capacity, reloadMs: next.magazine.reloadMs, overflow: "discard" });
      }
      return true;
    },
    definition: () => definition,
    ammo() {
      return {
        loaded: magazine?.loaded() ?? null,
        capacity: magazine?.capacity() ?? null,
        reserve: magazine?.reserve() ?? null,
        reload: reloadState(),
        reloadFraction: magazine?.reloadFraction() ?? 0,
        burstRemaining,
        cadenceFraction: cadence.readyFraction(),
      };
    },
    stats: () => ({ ...stats }),
    pellets: () => pellets.map((pellet) => ({ ...pellet })),
    handling: () => handling,
    magazine: () => magazine,
    snapshot() {
      return {
        aim: { yaw: aimYaw, pitch: aimPitch },
        handling: handling.snapshot(),
        magazine: magazine === null ? null : magazine.snapshot(),
        cadenceElapsedMs: cadence.elapsedMs(),
        trigger: triggerDown,
        pendingPull,
        burstRemaining,
        shotCount,
        stats: { ...stats },
        pellets: pellets.map((pellet) => ({ ...pellet })),
      };
    },
    restore(state) {
      if ((state.magazine === null) !== (magazine === null)) return false;
      if (state.magazine !== null && magazine !== null && !magazine.restore(state.magazine)) return false;
      aimYaw = state.aim.yaw;
      aimPitch = state.aim.pitch;
      handling.restore(state.handling);
      cadence.restore(state.cadenceElapsedMs);
      triggerDown = state.trigger;
      pendingPull = state.pendingPull;
      burstRemaining = Math.max(0, Math.floor(state.burstRemaining));
      shotCount = Math.max(0, Math.floor(state.shotCount));
      Object.assign(stats, freshStats(), state.stats);
      const cap = weaponMaxInFlight(definition);
      pellets = state.pellets.slice(0, cap).map((pellet) => ({ ...pellet }));
      dryCounted = false;
      return true;
    },
    reset() {
      cadence = createFireCadence({ intervalMs });
      magazine = buildMagazine(definition);
      handling.reset();
      aimYaw = 0;
      aimPitch = 0;
      triggerDown = false;
      pendingPull = false;
      burstRemaining = 0;
      shotCount = 0;
      dryCounted = false;
      pellets = [];
      Object.assign(stats, freshStats());
    },
    dispose() {
      unregister?.();
    },
  };
}
