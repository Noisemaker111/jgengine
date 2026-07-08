import type { BallisticSweep } from "../physics/ballisticSweep";
import type { EntityPosition } from "../scene/entityStore";
import type { Aim } from "../scene/spatial";
import type { CombatSpatialDeps, EffectResult, EffectSystem, EffectVia } from "./effects";

export interface ProjectileShotInput {
  from: string;
  via: EffectVia;
  aim: Aim;
  effect: string;
}

/** A raycast hit against a scene entity — the ray reached `instanceId` at `distance` along its length. */
export interface EntityRaycastHit {
  kind: "entity";
  instanceId: string;
  distance: number;
  at: EntityPosition;
}

/** A raycast hit against a placed scene object's bounding box — see `ProjectileObjectsDeps.halfExtents`. */
export interface ObjectRaycastHit {
  kind: "object";
  instanceId: string;
  catalogId: string;
  distance: number;
  at: EntityPosition;
}

export type RaycastHit = EntityRaycastHit | ObjectRaycastHit;

export type Raycast = (from: string, aim: Aim, range: number) => RaycastHit[];

export interface ProjectileSettleReport {
  from: string;
  origin: EntityPosition;
  at: EntityPosition;
  effect: string;
  hit: boolean;
}

/** Read-only scene object access for the default `raycast`; matches `ObjectStore.list()`/a catalog lookup structurally. */
export interface ProjectileObjectsDeps {
  list(): readonly { instanceId: string; catalogId: string; position: [number, number, number] }[];
  /** Half-extents of the object's axis-aligned bounding box; `null`/omitted falls back to `[0.5, 0.5, 0.5]`. */
  halfExtents?(catalogId: string): [number, number, number] | null;
}

export interface ProjectileSystemDeps {
  effects: EffectSystem;
  spatial: CombatSpatialDeps;
  getStat(itemId: string, stat: string): number | null;
  raycast?: Raycast;
  /** Optional object awareness for the default `raycast`; when set, placed objects can block or absorb a shot. */
  objects?: ProjectileObjectsDeps;
  /**
   * Optional collision-aware arc test for ballistic shots (see `createBallisticSweep` in
   * `physics/ballisticSweep`). A hit settles the shot at the impact point; `null` or omission
   * falls back to the closed-form landing.
   */
  sweepBallistic?: BallisticSweep;
  now?: () => number;
  onSettle?(report: ProjectileSettleReport): void;
}

export type ProjectileHit =
  | { kind: "entity"; instanceId: string; distance: number }
  | { kind: "object"; instanceId: string; catalogId: string; distance: number };

export interface ProjectilePrediction {
  hits: ProjectileHit[];
  blocked?: boolean;
}

export type SettleResult =
  | { status: "settled"; shotId: string; at: [number, number, number]; hits: EffectResult[] }
  | { status: "rejected"; shotId: string; reason: string };

export interface ProjectileSystem {
  willHitProjectile(input: ProjectileShotInput): ProjectilePrediction;
  fireProjectile(input: ProjectileShotInput): string;
  settleProjectile(shotId: string): SettleResult;
}

const DEFAULT_RANGE = 100;
const DEFAULT_PROJECTILE_SPEED = 15;
const GRAVITY = 9.8;
const BASE_HIT_RADIUS = 0.5;
const DEFAULT_OBJECT_HALF_EXTENTS: EntityPosition = [0.5, 0.5, 0.5];

function isEntityHit(hit: RaycastHit): hit is EntityRaycastHit {
  return hit.kind === "entity";
}

function isObjectHit(hit: RaycastHit): hit is ObjectRaycastHit {
  return hit.kind === "object";
}

function raySegmentAabbDistance(
  origin: EntityPosition,
  direction: EntityPosition,
  range: number,
  min: EntityPosition,
  max: EntityPosition,
): number | null {
  let tMin = 0;
  let tMax = range;
  for (let axis = 0; axis < 3; axis += 1) {
    const o = origin[axis]!;
    const d = direction[axis]!;
    const lo = min[axis]!;
    const hi = max[axis]!;
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    const inv = 1 / d;
    let t1 = (lo - o) * inv;
    let t2 = (hi - o) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}

function normalize(vector: EntityPosition): EntityPosition | null {
  const length = Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2]);
  if (length === 0) return null;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function aimDirection(aim: Aim): EntityPosition | null {
  if ("origin" in aim) return normalize(aim.direction);
  const cosPitch = Math.cos(aim.pitch);
  return [Math.sin(aim.yaw) * cosPitch, Math.sin(aim.pitch), Math.cos(aim.yaw) * cosPitch];
}

function aimSpreadDeg(aim: Aim): number {
  return "origin" in aim ? 0 : aim.spread ?? 0;
}

export function createProjectileSystem(deps: ProjectileSystemDeps): ProjectileSystem {
  const shots = new Map<string, { input: ProjectileShotInput; firedAt: number; settled: boolean }>();
  let shotCounter = 0;
  const now = deps.now ?? (() => Date.now());

  function itemStat(via: EffectVia, stat: string): number | null {
    return via.item === undefined ? null : deps.getStat(via.item, stat);
  }

  function shotOrigin(from: string, aim: Aim): EntityPosition | undefined {
    return "origin" in aim ? aim.origin : deps.spatial.positionOf(from);
  }

  function withWeaponSpread(via: EffectVia, aim: Aim): Aim {
    if ("origin" in aim || aim.spread !== undefined) return aim;
    const spread = itemStat(via, "spread");
    return spread === null ? aim : { ...aim, spread };
  }

  const raycast: Raycast =
    deps.raycast ??
    ((from, aim, range) => {
      const origin = shotOrigin(from, aim);
      if (origin === undefined) return [];
      const direction = aimDirection(aim);
      if (direction === null) return [];
      const spreadRad = (aimSpreadDeg(aim) * Math.PI) / 180;
      const entityHits: EntityRaycastHit[] = [];
      for (const instanceId of deps.spatial.inRadius(origin, range)) {
        if (instanceId === from) continue;
        const position = deps.spatial.positionOf(instanceId);
        if (position === undefined) continue;
        const dx = position[0] - origin[0];
        const dy = position[1] - origin[1];
        const dz = position[2] - origin[2];
        const along = dx * direction[0] + dy * direction[1] + dz * direction[2];
        if (along <= 0 || along > range) continue;
        const px = dx - direction[0] * along;
        const py = dy - direction[1] * along;
        const pz = dz - direction[2] * along;
        const perpendicular = Math.sqrt(px * px + py * py + pz * pz);
        if (perpendicular > BASE_HIT_RADIUS + Math.tan(spreadRad) * along) continue;
        entityHits.push({ kind: "entity", instanceId, distance: along, at: position });
      }
      let nearestObject: ObjectRaycastHit | null = null;
      for (const object of deps.objects?.list() ?? []) {
        const half = deps.objects?.halfExtents?.(object.catalogId) ?? DEFAULT_OBJECT_HALF_EXTENTS;
        const min: EntityPosition = [
          object.position[0] - half[0],
          object.position[1] - half[1],
          object.position[2] - half[2],
        ];
        const max: EntityPosition = [
          object.position[0] + half[0],
          object.position[1] + half[1],
          object.position[2] + half[2],
        ];
        const distance = raySegmentAabbDistance(origin, direction, range, min, max);
        if (distance === null) continue;
        if (nearestObject === null || distance < nearestObject.distance) {
          nearestObject = {
            kind: "object",
            instanceId: object.instanceId,
            catalogId: object.catalogId,
            distance,
            at: [
              origin[0] + direction[0] * distance,
              origin[1] + direction[1] * distance,
              origin[2] + direction[2] * distance,
            ],
          };
        }
      }
      const blockDistance = nearestObject?.distance ?? Infinity;
      const hits: RaycastHit[] = entityHits.filter((hit) => hit.distance <= blockDistance);
      if (nearestObject !== null) hits.push(nearestObject);
      return hits.sort((a, b) => a.distance - b.distance);
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
    const origin = shotOrigin(input.from, input.aim) ?? [0, 0, 0];
    const direction = aimDirection(input.aim) ?? [0, 0, 1];
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

  function predictHits(input: ProjectileShotInput): { rawHits: RaycastHit[]; visible: RaycastHit[] } {
    const aim = withWeaponSpread(input.via, input.aim);
    const rawHits = raycast(input.from, aim, resolveRange(input.via));
    const visible = rawHits.filter(
      (hit) => isObjectHit(hit) || deps.spatial.hasLineOfSight(input.from, hit.instanceId),
    );
    return { rawHits, visible };
  }

  function settledAt(input: ProjectileShotInput, hits: RaycastHit[]): [number, number, number] {
    const first = hits[0];
    if (first !== undefined) return [first.at[0], first.at[1], first.at[2]];
    const origin = shotOrigin(input.from, input.aim);
    const direction = origin === undefined ? null : aimDirection(input.aim);
    if (origin === undefined || direction === null) return [0, 0, 0];
    const range = resolveRange(input.via);
    return [origin[0] + direction[0] * range, origin[1] + direction[1] * range, origin[2] + direction[2] * range];
  }

  return {
    willHitProjectile(input) {
      const { rawHits, visible } = predictHits(input);
      const prediction: ProjectilePrediction = {
        hits: visible.map((hit) =>
          isObjectHit(hit)
            ? { kind: "object", instanceId: hit.instanceId, catalogId: hit.catalogId, distance: hit.distance }
            : { kind: "entity", instanceId: hit.instanceId, distance: hit.distance },
        ),
      };
      if (rawHits.length > 0 && visible.length === 0) prediction.blocked = true;
      return prediction;
    },
    fireProjectile(input) {
      shotCounter += 1;
      const shotId = `shot_${shotCounter}`;
      shots.set(shotId, { input, firedAt: now(), settled: false });
      return shotId;
    },
    settleProjectile(shotId) {
      const shot = shots.get(shotId);
      if (shot === undefined) return { status: "rejected", shotId, reason: "unknown-shot" };
      if (shot.settled) return { status: "rejected", shotId, reason: "already-settled" };
      shot.settled = true;
      const { input } = shot;
      const origin = shotOrigin(input.from, input.aim) ?? [0, 0, 0];
      if (isBallistic(input.via)) {
        const at = ballisticSettlePoint(input);
        deps.onSettle?.({ from: input.from, origin, at, effect: input.effect, hit: false });
        return { status: "settled", shotId, at, hits: [] };
      }
      const { visible } = predictHits(input);
      const entityHits = visible.filter(isEntityHit);
      const objectHits = visible.filter(isObjectHit);
      const receivable = entityHits.filter(
        (hit) => deps.effects.canReceive(hit.instanceId, input.effect) === null,
      );
      const pellets = Math.max(1, Math.round(itemStat(input.via, "pellets") ?? 1));
      const hits: EffectResult[] = [];
      if (receivable.length > 0) {
        for (let pellet = 0; pellet < pellets; pellet++) {
          const target = receivable[pellet % receivable.length];
          hits.push(
            ...deps.effects.applyEffect({
              from: input.from,
              to: target.instanceId,
              effect: input.effect,
              via: input.via,
            }),
          );
        }
      }
      const at = settledAt(input, receivable.length > 0 ? receivable : objectHits);
      deps.onSettle?.({ from: input.from, origin, at, effect: input.effect, hit: receivable.length > 0 });
      return { status: "settled", shotId, at, hits };
    },
  };
}
