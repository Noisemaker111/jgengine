import type { BallisticSweep } from "../physics/ballisticSweep";
import type { EntityPosition } from "../scene/entityStore";
import type { EntityColliderSet } from "../scene/colliders";
import {
  createSceneRaycast,
  firstImpact,
  hitsUntilBlocked,
  type SceneRaycastApi,
  type SceneRaycastHit,
} from "../scene/sceneRaycast";
import type { Aim } from "../scene/spatial";
import type { CombatSpatialDeps, EffectResult, EffectSystem, EffectVia } from "./effects";
import {
  aimDirection,
  aimSpreadDeg,
  convergeShot,
  resolveShot,
  type ShotOriginPolicy,
} from "./shotOrigin";

export interface ProjectileShotInput {
  from: string;
  via: EffectVia;
  aim: Aim;
  effect: string;
  /** Defaults to `{ kind: "converge" }` — explicit rays pass through; angular aim converges from the muzzle to the sightline. */
  originPolicy?: ShotOriginPolicy;
  /** Opt into simulation-owned travel. Values are captured at launch; time is in game-seconds. */
  travel?: ProjectileTravelConfig;
}

/** Captured launch settings for authoritative live travel. */
export interface ProjectileTravelConfig {
  speed: number;
  lifetime: number;
  /** Forwarded to the injected sweep; the default scene query sweeps a centerline. */
  radius?: number;
  gravity?: EntityPosition;
  /** Game-owned wind coupling in 1/seconds, from 0 to 1e12; omission leaves wind response off. */
  windResponse?: number;
  /** Target bits read by the injected environmental force sampler. */
  forceMask?: number;
  /** Cap injected acceleration in m/s², from 0 to 1e12, independently of gravity. */
  maxAcceleration?: number;
}

/** Nearest contact returned by a live segment sweep. */
export interface ProjectileTravelImpact {
  /** Earliest contact fraction along this step, including moving targets. */
  fraction: number;
  at: EntityPosition;
  target?: ProjectileHit;
}

/** Authoritative clock, collision and environmental acceleration providers. */
export interface ProjectileTravelDeps {
  /** Authoritative game-seconds; no wall-clock fallback is used for live travel. */
  now(): number;
  sweep?(from: EntityPosition, to: EntityPosition, step: {
    shotId: string; input: ProjectileShotInput; radius: number; fromTime: number; toTime: number;
  }): ProjectileTravelImpact | null;
  acceleration?(position: EntityPosition, velocity: EntityPosition, time: number, input: ProjectileShotInput): EntityPosition;
  maxActive?: number;
  maxRetained?: number;
}

/** Detached pose of one active projectile pellet for presentation. */
export interface LiveProjectile {
  shotId: string;
  pellet: number;
  from: string;
  effect: string;
  via: EffectVia;
  position: EntityPosition;
  velocity: EntityPosition;
  age: number;
  radius: number;
}

/** Serializable motion state of one projectile pellet. */
export interface ProjectileFlightState {
  position: EntityPosition;
  velocity: EntityPosition;
  age: number;
  distance: number;
  active: boolean;
}

/** Serializable captured launch and settlement state. */
export interface ProjectileShotState {
  shotId: string;
  input: ProjectileShotInput;
  coneSamples: readonly (readonly [number, number])[];
  pellets: number;
  firedAt: number;
  settled: boolean;
  origin?: EntityPosition;
  flights?: ProjectileFlightState[];
  hits: EffectResult[];
  at?: EntityPosition;
}

/** Detached projectile owner state for replay and restore. */
export interface ProjectileSystemState {
  shotCounter: number;
  shots: ProjectileShotState[];
}

export interface EntityRaycastHit {
  kind: "entity";
  instanceId: string;
  distance: number;
  at: EntityPosition;
  colliderName?: string;
  damageEligible?: boolean;
  blocks?: boolean;
}

export interface ObjectRaycastHit {
  kind: "object";
  instanceId: string;
  catalogId: string;
  distance: number;
  at: EntityPosition;
  colliderName?: string;
  damageEligible?: boolean;
  blocks?: boolean;
}

export type RaycastHit = EntityRaycastHit | ObjectRaycastHit;

export type Raycast = (from: string, aim: Aim, range: number, originPolicy?: ShotOriginPolicy) => RaycastHit[];

/** Exactly-once settlement with launch identity and actual applied effects. */
export interface ProjectileSettleReport {
  shotId: string;
  /** Actual applied effects; empty for misses and cover impacts. */
  hits: readonly EffectResult[];
  from: string;
  origin: EntityPosition;
  at: EntityPosition;
  effect: string;
  hit: boolean;
  /**
   * True for lobbed/exploding shots (grenades, launchers, rockets) whose real path is an arc,
   * false for direct-fire shots (bullets, bolts) that travel muzzle→impact in a straight line.
   * Presentation uses it to keep straight-line tracers off arced projectiles.
   */
  ballistic: boolean;
}

export interface ProjectileObjectsDeps {
  list(): readonly {
    instanceId: string;
    catalogId: string;
    position: readonly [number, number, number];
    rotationY?: number;
  }[];
  inBox?(
    min: EntityPosition,
    max: EntityPosition,
  ): readonly {
    instanceId: string;
    catalogId: string;
    position: readonly [number, number, number];
    rotationY?: number;
  }[];
  halfExtents?(catalogId: string): [number, number, number] | null;
  collidersOf?(instanceId: string): EntityColliderSet | null | undefined;
}

export interface ProjectileSystemDeps {
  effects: EffectSystem;
  spatial: CombatSpatialDeps;
  getStat(itemId: string, stat: string): number | null;
  raycast?: Raycast;
  sceneRaycast?: SceneRaycastApi;
  objects?: ProjectileObjectsDeps;
  entityCollidersOf?(instanceId: string): EntityColliderSet | null | undefined;
  rotationYOf?(instanceId: string): number | undefined;
  sweepBallistic?: BallisticSweep;
  defaultOriginPolicy?: ShotOriginPolicy;
  now?: () => number;
  /** Cone samples use two draws per nonzero-spread pellet at fire time; defaults to Math.random. */
  rng?: () => number;
  /** Per-shot ray limit, clamped to [1, 256]; defaults to 64. */
  maxPellets?: number;
  onSettle?(report: ProjectileSettleReport): void;
  travel?: ProjectileTravelDeps;
}

export type ProjectileHit =
  | {
      kind: "entity";
      instanceId: string;
      distance: number;
      colliderName?: string;
      damageEligible?: boolean;
    }
  | {
      kind: "object";
      instanceId: string;
      catalogId: string;
      distance: number;
      colliderName?: string;
      damageEligible?: boolean;
    };

export interface ProjectilePrediction {
  hits: ProjectileHit[];
  blocked?: boolean;
  origin?: EntityPosition;
  direction?: EntityPosition;
  firstImpact?: ProjectileHit | null;
}

export type SettleResult =
  | {
      status: "settled";
      shotId: string;
      at: [number, number, number];
      hits: EffectResult[];
      origin?: [number, number, number];
    }
  | { status: "rejected"; shotId: string; reason: string };

export interface ProjectileSystem {
  /** Predict the center ray without consuming random samples or applying effects. */
  willHitProjectile(input: ProjectileShotInput): ProjectilePrediction;
  /** Capture aim, origin-policy vectors and cone samples independently of subsequent caller mutation. */
  fireProjectile(input: ProjectileShotInput): string;
  settleProjectile(shotId: string): SettleResult;
  /** Advance live shots once per authoritative simulation step; settled shots emit no further effects. */
  advanceProjectiles(dt: number, time: number): SettleResult[];
  activeProjectiles(): LiveProjectile[];
  snapshot(): ProjectileSystemState;
  restore(state: ProjectileSystemState): void;
}

const DEFAULT_RANGE = 100;
const DEFAULT_PROJECTILE_SPEED = 15;
const GRAVITY = 9.8;
const BASE_HIT_RADIUS = 0.5;

function copyPosition(position: EntityPosition): EntityPosition {
  return [position[0], position[1], position[2]];
}

function copyAim(aim: Aim): Aim {
  return "origin" in aim
    ? { ...aim, origin: copyPosition(aim.origin), direction: copyPosition(aim.direction) }
    : { ...aim };
}

function copyOriginPolicy(policy: ShotOriginPolicy): ShotOriginPolicy {
  switch (policy.kind) {
    case "camera":
    case "world":
      return { ...policy, origin: copyPosition(policy.origin), ...(policy.direction !== undefined ? { direction: copyPosition(policy.direction) } : {}) };
    case "entityOffset":
      return { ...policy, offset: copyPosition(policy.offset) };
    case "muzzle":
      return { ...policy, ...(policy.offset !== undefined ? { offset: copyPosition(policy.offset) } : {}) };
    case "converge":
      return { ...policy, ...(policy.muzzle !== undefined ? { muzzle: copyPosition(policy.muzzle) } : {}) };
    case "eye":
    case "legacy":
    case "entity":
      return { ...policy };
  }
}

function isObjectHit(hit: RaycastHit): hit is ObjectRaycastHit {
  return hit.kind === "object";
}

function sceneHitToRaycast(hit: SceneRaycastHit): RaycastHit {
  if (hit.targetKind === "entity") {
    return {
      kind: "entity",
      instanceId: hit.instanceId,
      distance: hit.distance,
      at: hit.point,
      colliderName: hit.colliderName,
      damageEligible: hit.damageEligible,
      blocks: hit.blocks,
    };
  }
  return {
    kind: "object",
    instanceId: hit.instanceId,
    catalogId: hit.catalogId ?? hit.targetKind,
    distance: hit.distance,
    at: hit.point,
    colliderName: hit.colliderName,
    damageEligible: hit.damageEligible,
    blocks: hit.blocks,
  };
}

function toProjectileHit(hit: RaycastHit): ProjectileHit {
  if (isObjectHit(hit)) {
    return {
      kind: "object",
      instanceId: hit.instanceId,
      catalogId: hit.catalogId,
      distance: hit.distance,
      ...(hit.colliderName !== undefined ? { colliderName: hit.colliderName } : {}),
      ...(hit.damageEligible !== undefined ? { damageEligible: hit.damageEligible } : {}),
    };
  }
  return {
    kind: "entity",
    instanceId: hit.instanceId,
    distance: hit.distance,
    ...(hit.colliderName !== undefined ? { colliderName: hit.colliderName } : {}),
    ...(hit.damageEligible !== undefined ? { damageEligible: hit.damageEligible } : {}),
  };
}

function asSceneHits(hits: readonly RaycastHit[]): SceneRaycastHit[] {
  return hits.map((hit) => ({
    targetKind: hit.kind === "entity" ? ("entity" as const) : ("object" as const),
    instanceId: hit.instanceId,
    catalogId: hit.kind === "object" ? hit.catalogId : undefined,
    colliderName: hit.colliderName ?? "body",
    purpose: hit.damageEligible === false ? ("physical" as const) : ("damage" as const),
    damageEligible: hit.kind === "entity" ? hit.damageEligible !== false : hit.damageEligible === true,
    blocks: hit.blocks !== false,
    distance: hit.distance,
    point: hit.at,
    normal: [0, 1, 0] as EntityPosition,
  }));
}

/** Validate captured travel settings before a launch or restore can mutate the owner. */
function validateProjectileTravel(travel: ProjectileTravelConfig): void {
  if (!(travel.speed > 0) || !Number.isFinite(travel.speed) || !(travel.lifetime > 0) || !Number.isFinite(travel.lifetime) ||
    !(travel.radius === undefined || (Number.isFinite(travel.radius) && travel.radius >= 0)) ||
    !(travel.gravity === undefined || travel.gravity.every(Number.isFinite))) {
    throw new RangeError("Projectile travel requires finite positive speed/lifetime and nonnegative radius");
  }
  if (!(travel.windResponse === undefined || (Number.isFinite(travel.windResponse) && travel.windResponse >= 0 && travel.windResponse <= 1e12)) ||
    !(travel.maxAcceleration === undefined || (Number.isFinite(travel.maxAcceleration) && travel.maxAcceleration >= 0 && travel.maxAcceleration <= 1e12))) {
    throw new RangeError("Projectile wind response and acceleration cap must be finite and between 0 and 1e12");
  }
}

function sampleCone(
  forward: EntityPosition,
  spreadDeg: number,
  sample: readonly [number, number],
): EntityPosition {
  const cone = Math.min(Math.PI / 2, spreadDeg * Math.PI / 180);
  const unit = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const cosTheta = 1 - unit(sample[0]) * (1 - Math.cos(cone));
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  const phi = unit(sample[1]) * Math.PI * 2;
  const horizontal = Math.hypot(forward[0], forward[2]);
  const right: EntityPosition = horizontal > 1e-9
    ? [forward[2] / horizontal, 0, -forward[0] / horizontal]
    : [1, 0, 0];
  const up: EntityPosition = [
    forward[1] * right[2] - forward[2] * right[1],
    forward[2] * right[0] - forward[0] * right[2],
    forward[0] * right[1] - forward[1] * right[0],
  ];
  const x = sinTheta * Math.cos(phi);
  const y = sinTheta * Math.sin(phi);
  return [
    forward[0] * cosTheta + right[0] * x + up[0] * y,
    forward[1] * cosTheta + right[1] * x + up[1] * y,
    forward[2] * cosTheta + right[2] * x + up[2] * y,
  ];
}

/**
 * Spawn and advance projectiles each frame, resolving travel, lifetime, and hits.
 *
 * @capability projectiles spawn and advance projectiles with travel and hit resolution
 */
export function createProjectileSystem(deps: ProjectileSystemDeps): ProjectileSystem {
  const shots = new Map<string, ProjectileShotState>();
  let shotCounter = 0;
  let liveCount = 0;
  const now = deps.now ?? (() => Date.now());
  const rng = deps.rng ?? Math.random;
  const maxPellets = Number.isFinite(deps.maxPellets)
    ? Math.max(1, Math.min(256, Math.floor(deps.maxPellets!)))
    : 64;
  const defaultPolicy: ShotOriginPolicy = deps.defaultOriginPolicy ?? { kind: "converge" };
  const maxActive = Math.max(1, Math.floor(deps.travel?.maxActive ?? 256));
  const maxRetained = Math.max(0, Math.floor(deps.travel?.maxRetained ?? 256));
  if (!Number.isFinite(maxActive) || !Number.isFinite(maxRetained)) throw new RangeError("Projectile budgets must be finite");

  function pruneSettled() {
    let retained = 0;
    for (const shot of shots.values()) if (shot.settled) retained += 1;
    for (const [id, shot] of shots) {
      if (retained <= maxRetained) break;
      if (shot.settled) { shots.delete(id); retained -= 1; }
    }
  }

  function copyShot(shot: ProjectileShotState): ProjectileShotState {
    return structuredClone(shot);
  }

  function finishFlight(shot: ProjectileShotState): SettleResult {
    shot.settled = true;
    liveCount -= 1;
    const origin = shot.origin!;
    const at = shot.at ?? shot.flights![0]!.position;
    deps.onSettle?.({ shotId: shot.shotId, hits: structuredClone(shot.hits), from: shot.input.from, origin: copyPosition(origin), at: copyPosition(at), effect: shot.input.effect, hit: shot.hits.length > 0, ballistic: true });
    pruneSettled();
    return { status: "settled", shotId: shot.shotId, at: [at[0], at[1], at[2]], origin: [origin[0], origin[1], origin[2]], hits: shot.hits };
  }

  function itemStat(via: EffectVia, stat: string): number | null {
    return via.item === undefined ? null : deps.getStat(via.item, stat);
  }

  function withWeaponSpread(via: EffectVia, aim: Aim): Aim {
    if ("origin" in aim || aim.spread !== undefined) return aim;
    const spread = itemStat(via, "spread");
    return spread === null ? aim : { ...aim, spread };
  }

  const shotOriginDeps = {
    positionOf: deps.spatial.positionOf,
    rotationYOf: deps.rotationYOf,
    collidersOf: deps.entityCollidersOf,
  };

  function resolveShotFor(from: string, aim: Aim, policy: ShotOriginPolicy | undefined, range: number) {
    const active = policy ?? defaultPolicy;
    if (active.kind === "converge") {
      return convergeShot(shotOriginDeps, from, aim, range, (origin, direction) => {
        const all = internalSceneRaycast.raycastAll({
          origin,
          direction,
          maxDistance: range,
          excludeInstanceIds: [from],
        });
        return hitsUntilBlocked(all)[0]?.point ?? null;
      }, active.muzzle);
    }
    return resolveShot(shotOriginDeps, from, aim, active);
  }

  const internalSceneRaycast =
    deps.sceneRaycast ??
    createSceneRaycast({
      entities: {
        list: () => {
          const ids = deps.spatial.inRadius([0, 0, 0], 1e9);
          const out: { id: string; position: EntityPosition; rotationY: number }[] = [];
          for (const id of ids) {
            const position = deps.spatial.positionOf(id);
            if (position === undefined) continue;
            out.push({ id, position, rotationY: deps.rotationYOf?.(id) ?? 0 });
          }
          return out;
        },
        collidersOf: deps.entityCollidersOf,
        inRadius: (center, radius) => deps.spatial.inRadius(center, radius),
        get: (id) => {
          const position = deps.spatial.positionOf(id);
          if (position === undefined) return null;
          return { id, position, rotationY: deps.rotationYOf?.(id) ?? 0 };
        },
      },
      objects:
        deps.objects === undefined
          ? undefined
          : {
              list: () =>
                deps.objects!.list().map((object) => ({
                  instanceId: object.instanceId,
                  catalogId: object.catalogId,
                  position: [object.position[0], object.position[1], object.position[2]] as EntityPosition,
                  rotationY: object.rotationY ?? 0,
                })),
              inBox: deps.objects.inBox
                ? (min, max) =>
                    deps.objects!.inBox!(min, max).map((object) => ({
                      instanceId: object.instanceId,
                      catalogId: object.catalogId,
                      position: [object.position[0], object.position[1], object.position[2]] as EntityPosition,
                      rotationY: object.rotationY ?? 0,
                    }))
                : undefined,
              halfExtentsOf: deps.objects.halfExtents,
              collidersOf: deps.objects.collidersOf,
            },
    });

  const raycast: Raycast =
    deps.raycast ??
    ((from, aim, range, originPolicy) => {
      const resolved = resolveShotFor(from, aim, originPolicy, range);
      if (resolved === null) return [];
      const { origin, direction } = resolved;
      const all = internalSceneRaycast.raycastAll({
        origin,
        direction,
        maxDistance: range,
        excludeInstanceIds: [from],
      });
      const until = hitsUntilBlocked(all);
      return until.map(sceneHitToRaycast);
    });

  function resolveRange(via: EffectVia): number {
    return itemStat(via, "range") ?? DEFAULT_RANGE;
  }

  function isBallistic(via: EffectVia): boolean {
    return itemStat(via, "projectile.fuseTime") !== null || itemStat(via, "explosion.radius") !== null;
  }

  interface BallisticArc {
    origin: EntityPosition;
    velocity: readonly [number, number, number];
    gravity: number;
    flightTime: number;
    landing: [number, number, number];
  }

  function ballisticArc(input: ProjectileShotInput): BallisticArc {
    const resolved = resolveShotFor(input.from, input.aim, input.originPolicy, resolveRange(input.via));
    const origin = resolved?.origin ?? [0, 0, 0];
    const direction = resolved?.direction ?? aimDirection(input.aim) ?? [0, 0, 1];
    const speed = itemStat(input.via, "projectile.speed") ?? DEFAULT_PROJECTILE_SPEED;
    const gravityScale = itemStat(input.via, "projectile.gravity") ?? 1;
    const fuseTime = itemStat(input.via, "projectile.fuseTime");
    const gravity = GRAVITY * gravityScale;
    const verticalSpeed = direction[1] * speed;
    const flightCap = fuseTime ?? resolveRange(input.via) / speed;
    const impactTime =
      gravity > 0
        ? (verticalSpeed + Math.sqrt(verticalSpeed * verticalSpeed + 2 * gravity * Math.max(0, origin[1]))) / gravity
        : flightCap;
    const flightTime = Math.min(impactTime, flightCap);
    const settledY = Math.max(0, origin[1] + verticalSpeed * flightTime - 0.5 * gravity * flightTime * flightTime);
    return {
      origin,
      velocity: [direction[0] * speed, verticalSpeed, direction[2] * speed],
      gravity,
      flightTime,
      landing: [
        origin[0] + direction[0] * speed * flightTime,
        settledY,
        origin[2] + direction[2] * speed * flightTime,
      ],
    };
  }

  function ballisticSettlePoint(input: ProjectileShotInput): [number, number, number] {
    const arc = ballisticArc(input);
    const sweep = deps.sweepBallistic;
    if (sweep !== undefined) {
      const impact = sweep(arc.origin, arc.velocity, arc.gravity, arc.flightTime);
      if (impact !== null) return impact.point;
    }
    return arc.landing;
  }

  function predictHits(input: ProjectileShotInput): {
    rawHits: RaycastHit[];
    visible: RaycastHit[];
    origin: EntityPosition | undefined;
    direction: EntityPosition | undefined;
  } {
    const aim = withWeaponSpread(input.via, input.aim);
    const resolved = resolveShotFor(input.from, aim, input.originPolicy, resolveRange(input.via));
    const rawHits = raycast(input.from, aim, resolveRange(input.via), input.originPolicy);
    const visible = rawHits.filter(
      (hit) => isObjectHit(hit) || deps.spatial.hasLineOfSight(input.from, hit.instanceId),
    );
    return {
      rawHits,
      visible,
      origin: resolved?.origin,
      direction: resolved?.direction,
    };
  }

  function missPoint(input: ProjectileShotInput): [number, number, number] {
    const range = resolveRange(input.via);
    const resolved = resolveShotFor(input.from, input.aim, input.originPolicy, range);
    if (resolved === null) return [0, 0, 0];
    return [
      resolved.origin[0] + resolved.direction[0] * range,
      resolved.origin[1] + resolved.direction[1] * range,
      resolved.origin[2] + resolved.direction[2] * range,
    ];
  }

  return {
    willHitProjectile(input) {
      const { rawHits, visible, origin, direction } = predictHits(input);
      const impact = firstImpact(asSceneHits(rawHits));
      const solidBlock = impact !== null && impact.blocks && !impact.damageEligible;
      const prediction: ProjectilePrediction = {
        hits: visible.map(toProjectileHit),
        ...(origin !== undefined ? { origin } : {}),
        ...(direction !== undefined ? { direction } : {}),
        firstImpact: impact === null ? null : toProjectileHit(sceneHitToRaycast(impact)),
      };
      if (rawHits.length > 0 && visible.length === 0) prediction.blocked = true;
      else if (solidBlock) prediction.blocked = true;
      return prediction;
    },
    fireProjectile(input) {
      if (input.travel !== undefined) {
        if (deps.travel === undefined) throw new Error("Live projectiles require an authoritative travel clock");
        const travel = input.travel;
        validateProjectileTravel(travel);
        if ((travel.radius ?? 0) > 0 && deps.travel.sweep === undefined) throw new RangeError("Projectile radius requires an injected radius-aware sweep");
        if (liveCount >= maxActive) throw new RangeError("Active projectile budget exhausted");
      }
      shotCounter += 1;
      const shotId = `shot_${shotCounter}`;
      const captured: ProjectileShotInput = {
        ...input,
        aim: copyAim(input.aim),
        via: { ...input.via },
        originPolicy: copyOriginPolicy(input.originPolicy ?? defaultPolicy),
        ...(input.travel === undefined ? {} : { travel: { ...input.travel, ...(input.travel.gravity === undefined ? {} : { gravity: copyPosition(input.travel.gravity) }) } }),
      };
      captured.aim = withWeaponSpread(captured.via, captured.aim);
      const count = itemStat(captured.via, "pellets") ?? 1;
      const pellets = Number.isFinite(count) ? Math.max(1, Math.min(maxPellets, Math.round(count))) : 1;
      const coneSamples: [number, number][] = [];
      if ((captured.travel !== undefined || !isBallistic(captured.via)) && aimSpreadDeg(captured.aim) > 0) {
        for (let pellet = 0; pellet < pellets; pellet += 1) {
          coneSamples.push([rng(), rng()]);
        }
      }
      const shot: ProjectileShotState = { shotId, input: captured, coneSamples, pellets, firedAt: captured.travel === undefined ? now() : deps.travel!.now(), settled: false, hits: [] };
      if (captured.travel !== undefined) {
        if (!Number.isFinite(shot.firedAt)) throw new RangeError("Projectile authority time must be finite");
        const resolved = resolveShotFor(captured.from, captured.aim, captured.originPolicy, resolveRange(captured.via));
        if (resolved === null) throw new Error("Live projectile requires a resolvable launch origin and direction");
        shot.origin = copyPosition(resolved.origin);
        shot.flights = [];
        for (let pellet = 0; pellet < pellets; pellet += 1) {
          const sample = coneSamples[pellet];
          const direction = sample === undefined ? resolved.direction : sampleCone(resolved.direction, aimSpreadDeg(captured.aim), sample);
          shot.flights.push({ position: copyPosition(resolved.origin), velocity: [direction[0] * captured.travel.speed, direction[1] * captured.travel.speed, direction[2] * captured.travel.speed], age: 0, distance: 0, active: true });
        }
      }
      shots.set(shotId, shot);
      if (shot.flights !== undefined) liveCount += 1;
      return shotId;
    },
    advanceProjectiles(dt, time) {
      if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(time)) throw new RangeError("Projectile steps require finite nonnegative dt and authoritative time");
      const results: SettleResult[] = [];
      if (dt === 0 || liveCount === 0) return results;
      for (const shot of Array.from(shots.values())) {
        if (shot.settled || shot.flights === undefined) continue;
        const travel = shot.input.travel!;
        const gravity = travel.gravity ?? [0, 0, 0];
        const range = resolveRange(shot.input.via);
        for (const flight of shot.flights) {
          if (!flight.active) continue;
          const step = Math.min(dt, Math.max(0, time - shot.firedAt - flight.age), Math.max(0, travel.lifetime - flight.age));
          if (step <= 0) continue;
          const fromTime = shot.firedAt + flight.age;
          const external = deps.travel?.acceleration?.(copyPosition(flight.position), copyPosition(flight.velocity), fromTime, shot.input) ?? [0, 0, 0];
          if (!external.every(Number.isFinite)) throw new RangeError("Projectile acceleration must be finite");
          const magnitude = Math.hypot(...external);
          const cap = travel.maxAcceleration ?? Number.POSITIVE_INFINITY;
          const forceScale = magnitude > cap ? cap / magnitude : 1;
          const acceleration: EntityPosition = [gravity[0] + external[0] * forceScale, gravity[1] + external[1] * forceScale, gravity[2] + external[2] * forceScale];
          const from = flight.position;
          const to: EntityPosition = [from[0] + flight.velocity[0] * step + acceleration[0] * step * step / 2, from[1] + flight.velocity[1] * step + acceleration[1] * step * step / 2, from[2] + flight.velocity[2] * step + acceleration[2] * step * step / 2];
          const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
          const rangeFraction = length > 0 ? Math.max(0, Math.min(1, (range - flight.distance) / length)) : 1;
          const end: EntityPosition = [from[0] + (to[0] - from[0]) * rangeFraction, from[1] + (to[1] - from[1]) * rangeFraction, from[2] + (to[2] - from[2]) * rangeFraction];
          let impact: ProjectileTravelImpact | null;
          if (deps.travel?.sweep !== undefined) {
            impact = deps.travel.sweep(copyPosition(from), copyPosition(end), { shotId: shot.shotId, input: shot.input, radius: travel.radius ?? 0, fromTime, toTime: fromTime + step * rangeFraction });
          } else {
            const distance = length * rangeFraction;
            const hits = distance > 0 ? internalSceneRaycast.raycastAll({ origin: from, direction: [end[0] - from[0], end[1] - from[1], end[2] - from[2]], maxDistance: distance, excludeInstanceIds: [shot.input.from] }) : [];
            const hit = hits.find(hit => hit.blocks || (hit.targetKind === "entity" && hit.damageEligible)) ?? null;
            impact = hit === null ? null : { fraction: hit.distance / distance, at: hit.point, target: toProjectileHit(sceneHitToRaycast(hit)) };
          }
          if (impact !== null && (!Number.isFinite(impact.fraction) || impact.fraction < 0 || impact.fraction > 1 || !impact.at.every(Number.isFinite))) throw new RangeError("Projectile sweep must return a finite contact in the segment");
          const fraction = rangeFraction * (impact?.fraction ?? 1);
          flight.position = impact === null ? end : copyPosition(impact.at);
          flight.velocity = [flight.velocity[0] + acceleration[0] * step * fraction, flight.velocity[1] + acceleration[1] * step * fraction, flight.velocity[2] + acceleration[2] * step * fraction];
          flight.age += step * fraction;
          flight.distance += length * fraction;
          if (impact !== null || rangeFraction < 1 || flight.age >= travel.lifetime || flight.distance >= range) {
            flight.active = false;
            shot.at ??= copyPosition(flight.position);
            const target = impact?.target;
            const splash = itemStat(shot.input.via, "explosion.radius");
            if (impact !== null && splash !== null) {
              shot.hits.push(...deps.effects.applyEffect({ from: shot.input.from, effect: shot.input.effect, via: shot.input.via, at: flight.position, radius: splash, falloff: "linear" }));
            } else if (target?.kind === "entity" && target.damageEligible !== false && deps.effects.canReceive(target.instanceId, shot.input.effect) === null) {
              shot.hits.push(...deps.effects.applyEffect({ from: shot.input.from, to: target.instanceId, effect: shot.input.effect, via: shot.input.via }));
            }
          }
        }
        if (shot.flights.every(flight => !flight.active)) results.push(finishFlight(shot));
      }
      return results;
    },
    activeProjectiles() {
      const active: LiveProjectile[] = [];
      if (liveCount === 0) return active;
      for (const shot of shots.values()) {
        if (shot.settled || shot.flights === undefined) continue;
        shot.flights.forEach((flight, pellet) => {
          if (flight.active) active.push({ shotId: shot.shotId, pellet, from: shot.input.from, effect: shot.input.effect, via: { ...shot.input.via }, position: copyPosition(flight.position), velocity: copyPosition(flight.velocity), age: flight.age, radius: shot.input.travel?.radius ?? 0 });
        });
      }
      return active;
    },
    snapshot: () => ({ shotCounter, shots: Array.from(shots.values(), copyShot) }),
    restore(state) {
      const next = new Map<string, ProjectileShotState>();
      let active = 0;
      for (const shot of state.shots) {
        if (!Number.isInteger(shot.pellets) || shot.pellets < 1 || shot.pellets > maxPellets ||
          !Array.isArray(shot.coneSamples) || (shot.coneSamples.length !== 0 && shot.coneSamples.length !== shot.pellets)) {
          throw new RangeError("Restored projectile pellet budget or sample count is invalid");
        }
        if (shot.input.travel !== undefined) {
          validateProjectileTravel(shot.input.travel);
          if ((shot.input.travel.radius ?? 0) > 0 && deps.travel?.sweep === undefined) throw new RangeError("Projectile radius requires an injected radius-aware sweep");
        }
        if ((shot.flights !== undefined) !== (shot.input.travel !== undefined) ||
          (shot.flights !== undefined && (!Array.isArray(shot.flights) || shot.flights.length !== shot.pellets))) {
          throw new RangeError("Restored projectile flight count must match captured travel pellets");
        }
        if (shot.flights !== undefined && deps.travel === undefined) throw new Error("Restoring live projectiles requires an authoritative travel clock");
        if (shot.flights !== undefined && !shot.settled) active += 1;
        if (next.has(shot.shotId)) throw new Error("Restoring duplicate projectile ids");
        next.set(shot.shotId, copyShot(shot));
      }
      if (active > maxActive) throw new RangeError("Restored projectile budget exhausted");
      shots.clear();
      shotCounter = state.shotCounter;
      liveCount = active;
      for (const [id, shot] of next) shots.set(id, shot);
      pruneSettled();
    },
    settleProjectile(shotId) {
      const shot = shots.get(shotId);
      if (shot === undefined) return { status: "rejected", shotId, reason: "unknown-shot" };
      if (shot.settled) return { status: "rejected", shotId, reason: "already-settled" };
      if (shot.flights !== undefined) return { status: "rejected", shotId, reason: "in-flight" };
      shot.settled = true;
      pruneSettled();
      const { input } = shot;
      const resolved = resolveShotFor(input.from, input.aim, input.originPolicy, resolveRange(input.via));
      const origin = resolved?.origin ?? [0, 0, 0];
      const originTuple: [number, number, number] = [origin[0], origin[1], origin[2]];

      if (isBallistic(input.via)) {
        const at = ballisticSettlePoint(input);
        const splashRadius = itemStat(input.via, "explosion.radius");
        const radius = splashRadius ?? BASE_HIT_RADIUS;
        const hits = deps.effects.applyEffect({
          from: input.from,
          effect: input.effect,
          via: input.via,
          at,
          radius,
          falloff: splashRadius === null ? "none" : "linear",
        });
        deps.onSettle?.({ shotId, hits: structuredClone(hits), from: input.from, origin, at, effect: input.effect, hit: hits.length > 0, ballistic: true });
        return { status: "settled", shotId, at, hits, origin: originTuple };
      }

      const pellets = shot.pellets;
      const hits: EffectResult[] = [];
      let at: [number, number, number] | undefined;
      for (let pellet = 0; pellet < pellets; pellet += 1) {
        const sample = shot.coneSamples[pellet];
        const pelletInput = sample === undefined || resolved === null
          ? input
          : {
              ...input,
              aim: { origin, direction: sampleCone(resolved.direction, aimSpreadDeg(input.aim), sample) },
              originPolicy: { kind: "eye" as const },
            };
        const { rawHits } = predictHits(pelletInput);
        const untilBlock = hitsUntilBlocked(asSceneHits(rawHits));
        const impact = firstImpact(untilBlock);
        const target = untilBlock.find((hit) =>
          hit.targetKind === "entity" && hit.damageEligible &&
          deps.spatial.hasLineOfSight(input.from, hit.instanceId) &&
          deps.effects.canReceive(hit.instanceId, input.effect) === null,
        );
        if (target !== undefined) {
          hits.push(...deps.effects.applyEffect({
            from: input.from,
            to: target.instanceId,
            effect: input.effect,
            via: input.via,
          }));
        }
        if (at === undefined) {
          const point = impact?.point ?? target?.point ?? missPoint(pelletInput);
          at = [point[0], point[1], point[2]];
        }
      }
      at ??= missPoint(input);

      deps.onSettle?.({ shotId, hits: structuredClone(hits), from: input.from, origin, at, effect: input.effect, hit: hits.length > 0, ballistic: false });
      return { status: "settled", shotId, at, hits, origin: originTuple };
    },
  };
}
