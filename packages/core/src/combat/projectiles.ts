import type { BallisticSweep } from "../physics/ballisticSweep";
import type { EntityPosition } from "../scene/entityStore";
import { defaultEntityColliders, resolveColliders, type EntityColliderSet } from "../scene/colliders";
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
  /** Defaults to `{ kind: "eye" }` — aim.origin when given, else shooter position at eye height. */
  originPolicy?: ShotOriginPolicy;
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

export interface ProjectileSettleReport {
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
  onSettle?(report: ProjectileSettleReport): void;
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
  willHitProjectile(input: ProjectileShotInput): ProjectilePrediction;
  fireProjectile(input: ProjectileShotInput): string;
  settleProjectile(shotId: string): SettleResult;
}

const DEFAULT_RANGE = 100;
const DEFAULT_PROJECTILE_SPEED = 15;
const GRAVITY = 9.8;
const BASE_HIT_RADIUS = 0.5;

function isEntityHit(hit: RaycastHit): hit is EntityRaycastHit {
  return hit.kind === "entity";
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

/**
 * Spawn and advance projectiles each frame, resolving travel, lifetime, and hits.
 *
 * @capability projectiles spawn and advance projectiles with travel and hit resolution
 */
export function createProjectileSystem(deps: ProjectileSystemDeps): ProjectileSystem {
  const shots = new Map<string, { input: ProjectileShotInput; firedAt: number; settled: boolean }>();
  let shotCounter = 0;
  const now = deps.now ?? (() => Date.now());
  const defaultPolicy: ShotOriginPolicy = deps.defaultOriginPolicy ?? { kind: "converge" };

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
      const spreadRad = (aimSpreadDeg(aim) * Math.PI) / 180;
      const mapped: RaycastHit[] = [];
      for (const hit of until) {
        if (hit.targetKind === "entity" && spreadRad > 0) {
          const position = deps.spatial.positionOf(hit.instanceId);
          if (position !== undefined) {
            const colliders = resolveColliders(
              deps.entityCollidersOf?.(hit.instanceId) ?? defaultEntityColliders(),
            );
            const collider =
              colliders.find((candidate) => candidate.name === hit.colliderName) ?? colliders[0];
            const localOffset = collider?.shape.offset ?? [0, 0, 0];
            const slack =
              collider === undefined
                ? BASE_HIT_RADIUS
                : collider.shape.kind === "sphere"
                  ? collider.shape.radius
                  : Math.hypot(...collider.shape.halfExtents);
            const rotationY = deps.rotationYOf?.(hit.instanceId) ?? 0;
            const cos = Math.cos(rotationY);
            const sin = Math.sin(rotationY);
            const dx = position[0] + localOffset[0] * cos + localOffset[2] * sin - origin[0];
            const dy = position[1] + localOffset[1] - origin[1];
            const dz = position[2] - localOffset[0] * sin + localOffset[2] * cos - origin[2];
            const along = dx * direction[0] + dy * direction[1] + dz * direction[2];
            const px = dx - direction[0] * along;
            const py = dy - direction[1] * along;
            const pz = dz - direction[2] * along;
            const perpendicular = Math.sqrt(px * px + py * py + pz * pz);
            if (perpendicular > slack + Math.tan(spreadRad) * along) continue;
          }
        }
        mapped.push(sceneHitToRaycast(hit));
      }
      return mapped;
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
        deps.onSettle?.({ from: input.from, origin, at, effect: input.effect, hit: hits.length > 0, ballistic: true });
        return { status: "settled", shotId, at, hits, origin: originTuple };
      }

      const { visible, rawHits } = predictHits(input);
      const ordered = asSceneHits(rawHits);
      const untilBlock = hitsUntilBlocked(ordered);
      const impact = firstImpact(untilBlock);

      const solidBlock = impact !== null && impact.blocks && !impact.damageEligible;
      const damageEntityHits = visible.filter(
        (hit): hit is EntityRaycastHit =>
          isEntityHit(hit) &&
          hit.damageEligible !== false &&
          (!solidBlock || hit.distance <= (impact?.distance ?? Infinity) + 1e-9) &&
          deps.effects.canReceive(hit.instanceId, input.effect) === null,
      );

      const pellets = Math.max(1, Math.round(itemStat(input.via, "pellets") ?? 1));
      const hits: EffectResult[] = [];
      if (!solidBlock && damageEntityHits.length > 0) {
        for (let pellet = 0; pellet < pellets; pellet += 1) {
          const target = damageEntityHits[pellet % damageEntityHits.length]!;
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

      let at: [number, number, number];
      if (impact !== null) {
        at = [impact.point[0], impact.point[1], impact.point[2]];
      } else if (damageEntityHits[0] !== undefined) {
        at = [damageEntityHits[0].at[0], damageEntityHits[0].at[1], damageEntityHits[0].at[2]];
      } else {
        at = missPoint(input);
      }

      deps.onSettle?.({ from: input.from, origin, at, effect: input.effect, hit: hits.length > 0, ballistic: false });
      return { status: "settled", shotId, at, hits, origin: originTuple };
    },
  };
}
