/**
 * One description of how a shot travels and what it does when it arrives, plus the single resolver
 * that turns that description into behaviour. A weapon is data: a rifle, a grenade, a mortar and an
 * arrow differ by fields here, never by a code path, a weapon id or a classifier that reads one stat
 * as proof of another.
 */

/** A world-space point or direction in metres. */
export type ShotVec3 = readonly [number, number, number];

/** Standard gravity used to scale `ShotBody.gravity`, m/s². */
export const SHOT_GRAVITY = 9.8;

export const DEFAULT_SHOT_RANGE = 100;

/** Launch speed of a body that names none, m/s. */
export const DEFAULT_SHOT_SPEED = 15;

export const DEFAULT_SHOT_RADIUS = 0.5;

export const DEFAULT_SHOT_PENETRATION = 0;

export const DEFAULT_FALLOFF_END_SCALE = 0.5;

/** An instant trace: the shot resolves on the tick it is fired and never travels. */
export interface ShotTrace {
  kind: "trace";
  range?: number;
}

/**
 * A travelling body simulated over time. Every dimension is stated; nothing is read off another
 * field, so a slow arrow with a splash and a fast bullet without one are the same shape.
 */
export interface ShotBody {
  kind: "body";
  range?: number;
  /** Launch speed, m/s (default {@link DEFAULT_SHOT_SPEED}). */
  speed?: number;
  gravity?: number;
  drag?: number;
  /** Seconds the body stays alive before it expires (default `range / speed`). */
  lifetime?: number;
  radius?: number;
  /**
   * `"impact"` detonates on the first contact (default). A number detonates that many seconds into
   * flight, which is what gives a grenade its fuse and a mortar its ground burst.
   */
  fuse?: number | "impact";
  /** Turn rate toward the aimed target, rad/s (default `0`: no homing). */
  homing?: number;
}

export type ShotDelivery = ShotTrace | ShotBody;

export interface ShotFalloff {
  start: number;
  /** Distance, m, where it reaches `endScale`; clamped beyond. */
  end: number;
  /** Damage multiplier at `end`, `0..1`. */
  endScale: number;
}

export interface ShotPenetration {
  /** Targets after the first that the shot may also hit (default `0`). */
  count: number;
  keepDamage?: boolean;
}

export interface ShotSplash {
  radius: number;
  falloff?: "linear" | "none";
  damageScale?: number;
}

export interface ShotRicochet {
  count: number;
  /** Widest incoming angle, degrees, that still bounces (default `45`). */
  angleDeg?: number;
  /** Damage multiplier after the first bounce (default `0.5`). */
  damageScale?: number;
}

export interface ShotDamage {
  type: string;
  base: number;
  statuses?: readonly string[];
}

export interface ShotContact {
  damage?: ShotDamage;
  falloff?: ShotFalloff;
  penetration?: ShotPenetration;
  splash?: ShotSplash;
  ricochet?: ShotRicochet;
}

/**
 * A shot as plain data: how it travels and what it does on arrival. Every field but `delivery.kind`
 * is optional with a documented default, so a plain gun is three lines.
 */
export interface ShotSpec {
  delivery: ShotDelivery;
  contact?: ShotContact;
}

/** A spec with every default filled in. Read `mode` and the branch it names, never the raw spec. */
export interface ResolvedShotSpec {
  mode: "trace" | "body";
  range: number;
  trace: { range: number } | null;
  body: {
    speed: number;
    gravity: number;
    drag: number;
    lifetime: number;
    radius: number;
    fuse: number | "impact";
    homing: number;
  } | null;
  contact: {
    damage: { type: string; base: number; statuses: readonly string[] } | null;
    falloff: { start: number; end: number; endScale: number } | null;
    penetration: { count: number; keepDamage: boolean };
    splash: { radius: number; falloff: "linear" | "none"; damageScale: number } | null;
    ricochet: { count: number; angleDeg: number; damageScale: number } | null;
  };
}

export interface ShotHitOutcome {
  applies: boolean;
  scale: number;
}

function finite(value: number, field: string, min: number): number {
  if (!Number.isFinite(value) || value < min) throw new RangeError(`Shot spec field "${field}" must be a finite number >= ${min}; got ${String(value)}`);
  return value;
}

/**
 * Fill every default and return the one shape firing paths act on. This is the only place that
 * decides how a shot travels, so a delivery can never be guessed from a damage or splash field.
 *
 * @capability shot-spec resolve one shot description into explicit travel and contact behaviour
 */
export function resolveShotSpec(spec: ShotSpec): ResolvedShotSpec {
  const delivery = spec.delivery;
  const contact = spec.contact ?? {};
  const falloff = contact.falloff;
  const penetration = contact.penetration;
  const splash = contact.splash;
  const ricochet = contact.ricochet;
  const damage = contact.damage;

  const resolvedContact: ResolvedShotSpec["contact"] = {
    damage: damage === undefined
      ? null
      : {
          type: damage.type,
          base: finite(damage.base, "contact.damage.base", 0),
          statuses: damage.statuses === undefined ? [] : [...damage.statuses],
        },
    falloff: falloff === undefined
      ? null
      : {
          start: finite(falloff.start, "contact.falloff.start", 0),
          end: finite(falloff.end, "contact.falloff.end", 0),
          endScale: finite(falloff.endScale, "contact.falloff.endScale", 0),
        },
    penetration: {
      count: penetration === undefined ? DEFAULT_SHOT_PENETRATION : Math.floor(finite(penetration.count, "contact.penetration.count", 0)),
      keepDamage: penetration?.keepDamage ?? true,
    },
    splash: splash === undefined
      ? null
      : {
          radius: finite(splash.radius, "contact.splash.radius", 0),
          falloff: splash.falloff ?? "linear",
          damageScale: splash.damageScale === undefined ? 1 : finite(splash.damageScale, "contact.splash.damageScale", 0),
        },
    ricochet: ricochet === undefined
      ? null
      : {
          count: Math.floor(finite(ricochet.count, "contact.ricochet.count", 0)),
          angleDeg: ricochet.angleDeg === undefined ? 45 : finite(ricochet.angleDeg, "contact.ricochet.angleDeg", 0),
          damageScale: ricochet.damageScale === undefined ? 0.5 : finite(ricochet.damageScale, "contact.ricochet.damageScale", 0),
        },
  };

  if (delivery.kind === "trace") {
    const range = delivery.range === undefined ? DEFAULT_SHOT_RANGE : finite(delivery.range, "delivery.range", Number.MIN_VALUE);
    return { mode: "trace", range, trace: { range }, body: null, contact: resolvedContact };
  }

  const speed = delivery.speed === undefined ? DEFAULT_SHOT_SPEED : finite(delivery.speed, "delivery.speed", Number.MIN_VALUE);
  const gravity = delivery.gravity === undefined ? 0 : finite(delivery.gravity, "delivery.gravity", 0);
  const drag = delivery.drag === undefined ? 0 : finite(delivery.drag, "delivery.drag", 0);
  const range = delivery.range === undefined ? DEFAULT_SHOT_RANGE : finite(delivery.range, "delivery.range", Number.MIN_VALUE);
  const lifetime = delivery.lifetime === undefined ? range / speed : finite(delivery.lifetime, "delivery.lifetime", Number.MIN_VALUE);
  const radius = delivery.radius === undefined ? DEFAULT_SHOT_RADIUS : finite(delivery.radius, "delivery.radius", 0);
  const homing = delivery.homing === undefined ? 0 : finite(delivery.homing, "delivery.homing", 0);
  const fuse = delivery.fuse === undefined
    ? "impact"
    : delivery.fuse === "impact"
      ? "impact"
      : finite(delivery.fuse, "delivery.fuse", 0);

  return {
    mode: "body",
    range,
    trace: null,
    body: { speed, gravity, drag, lifetime, radius, fuse, homing },
    contact: resolvedContact,
  };
}

/** Number of seconds the body flies before its fuse ends the flight, or `null` when it flies to contact. */
export function shotFuseSeconds(shot: ResolvedShotSpec): number | null {
  return shot.body === null || shot.body.fuse === "impact" ? null : shot.body.fuse;
}

export function shotFalloffAt(shot: ResolvedShotSpec, distance: number): number {
  const falloff = shot.contact.falloff;
  if (falloff === null || distance <= falloff.start) return 1;
  if (falloff.end <= falloff.start) return falloff.endScale;
  const t = Math.min(1, (distance - falloff.start) / (falloff.end - falloff.start));
  return 1 + (falloff.endScale - 1) * t;
}

export function shotHitOutcome(shot: ResolvedShotSpec, distance: number, hitIndex: number): ShotHitOutcome {
  const index = Math.max(0, Math.floor(hitIndex));
  if (index > shot.contact.penetration.count) return { applies: false, scale: 0 };
  const survived = index === 0 || shot.contact.penetration.keepDamage ? 1 : 0;
  return { applies: true, scale: shotFalloffAt(shot, distance) * survived };
}

export interface ShotLaunch {
  origin: ShotVec3;
  velocity: ShotVec3;
  gravity: number;
}

export interface ShotArc extends ShotLaunch {
  /** Seconds of flight, capped by the fuse and ended early by the ground. */
  flightTime: number;
  apex: number;
  /** Contact point; `y` is clamped to the ground plane. */
  landing: [number, number, number];
}

/**
 * Solve the path of a body from a launch pose. A trace has no path and fails loudly instead of
 * returning a straight line a caller would mistake for an arc.
 */
export function shotArc(shot: ResolvedShotSpec, origin: ShotVec3, direction: ShotVec3): ShotArc {
  if (shot.body === null) throw new RangeError('Shot spec field "delivery.kind" must be "body" to have a trajectory; a trace resolves instantly');
  const { speed, gravity, fuse } = shot.body;
  const acceleration = SHOT_GRAVITY * gravity;
  const vertical = direction[1] * speed;
  const fuseSeconds = fuse === "impact" ? null : fuse;
  const flightCap = fuseSeconds ?? shot.range / speed;
  const toGround = acceleration > 0
    ? (vertical + Math.sqrt(vertical * vertical + 2 * acceleration * Math.max(0, origin[1]))) / acceleration
    : flightCap;
  const flightTime = Math.min(toGround, flightCap);
  const settledY = Math.max(0, origin[1] + vertical * flightTime - 0.5 * acceleration * flightTime * flightTime);
  return {
    origin,
    velocity: [direction[0] * speed, vertical, direction[2] * speed],
    gravity: acceleration,
    flightTime,
    apex: acceleration > 0 ? Math.max(0, vertical * vertical / (2 * acceleration)) : 0,
    landing: [
      origin[0] + direction[0] * speed * flightTime,
      settledY,
      origin[2] + direction[2] * speed * flightTime,
    ],
  };
}

export type ShotStatReader = (stat: string) => number | null;

/**
 * Project an existing {@link WeaponDefinition} onto a spec, so a weapon authored as a definition and
 * one authored as a spec reach the same firing paths.
 */
export function shotSpecFromWeapon(definition: {
  delivery:
    | { kind: "hitscan"; maxRange: number }
    | { kind: "projectile"; speed: number; gravity?: number; drag?: number; lifetime: number; maxRange?: number };
  damage: { type: string; base: number; statuses?: readonly string[] };
  falloff?: ShotFalloff;
}): ShotSpec {
  const delivery: ShotDelivery = definition.delivery.kind === "hitscan"
    ? { kind: "trace", range: definition.delivery.maxRange }
    : {
        kind: "body",
        speed: definition.delivery.speed,
        ...(definition.delivery.gravity === undefined ? {} : { gravity: definition.delivery.gravity / SHOT_GRAVITY }),
        ...(definition.delivery.drag === undefined ? {} : { drag: definition.delivery.drag }),
        lifetime: definition.delivery.lifetime,
        ...(definition.delivery.maxRange === undefined ? {} : { range: definition.delivery.maxRange }),
      };
  return {
    delivery,
    contact: {
      damage: {
        type: definition.damage.type,
        base: definition.damage.base,
        ...(definition.damage.statuses === undefined ? {} : { statuses: definition.damage.statuses }),
      },
      ...(definition.falloff === undefined ? {} : { falloff: definition.falloff }),
    },
  };
}

/**
 * Adapt the numeric stat keys older item data carries to a spec. This is the only place those keys
 * are read, and delivery is decided by the keys that describe travel (`projectile.*`) alone: a
 * splash radius or a damage number never turns a trace into a body.
 */
export function shotSpecFromStats(read: ShotStatReader): ShotSpec {
  const speed = read("projectile.speed");
  const fuseTime = read("projectile.fuseTime");
  const gravity = read("projectile.gravity");
  const lifetime = read("projectile.lifetime");
  const radius = read("projectile.radius");
  const drag = read("projectile.drag");
  const homing = read("projectile.homing");
  const range = read("range");
  const splashRadius = read("explosion.radius");
  const damage = read("damage");
  const penetration = read("penetration");

  const delivery: ShotDelivery = speed === null && fuseTime === null && gravity === null && lifetime === null && radius === null && drag === null && homing === null
    ? { kind: "trace", ...(range === null ? {} : { range }) }
    : {
        kind: "body",
        ...(range === null ? {} : { range }),
        ...(speed === null ? {} : { speed }),
        ...(gravity === null ? {} : { gravity }),
        ...(drag === null ? {} : { drag }),
        ...(lifetime === null ? {} : { lifetime }),
        ...(radius === null ? {} : { radius }),
        ...(homing === null ? {} : { homing }),
        ...(fuseTime === null ? {} : { fuse: fuseTime }),
      };

  return {
    delivery,
    contact: {
      ...(damage === null ? {} : { damage: { type: "damage", base: damage } }),
      ...(splashRadius === null ? {} : { splash: { radius: splashRadius } }),
      ...(penetration === null ? {} : { penetration: { count: penetration } }),
    },
  };
}
