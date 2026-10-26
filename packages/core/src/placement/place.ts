import type { PhysicsConfig } from "../game/defineGame";

/**
 * The place model: a world is the place you play in — substrate (ground) plus laws (physics,
 * surface) — never a dressed diorama. Sky look, foliage scatter, props, and sculpt are content:
 * they are authored in the editor (or by a content preset that writes into the scene document)
 * and consumed through the authored-scene seams, not declared on the world.
 *
 * Hard rules the API enforces:
 * - No `seed` anywhere in a world definition. Determinism comes from the runtime: the engine
 *   derives generator/scatter seeds from the world `id` plus the save/run seed (see
 *   {@link seedForPlace}), so the same place replays identically without the author owning RNG.
 * - No sky, vegetation, or theme fields. A world with no authored sky renders the engine
 *   default sky; "void"/"space" is content, not a world knob.
 * - No genre or franchise presets. `generator` carries algorithm parameters only.
 */

/**
 * Matter/feel laws of a place's ground that systems, physics, and audio read — restitution for a
 * metal chamber the pieces ping off, stickiness for a slime pit, a soft felt mat. The same rule
 * systems play on any surface; swapping the surface (plus content audio) changes the feel without
 * forking the rules. This is place law, not a theme kit: visual/audio dressing stays in content.
 */
export interface SurfaceLaws {
  /** Named matter of the ground ("metal", "slime", "felt", …) — a label systems and audio cues key off. */
  matter?: string;
  /** Sliding friction scalar, 0 (ice) … 1+ (grippy). Interpreted by movement/physics systems. */
  friction?: number;
  /** Bounce energy retention, 0 (dead stop) … 1 (perfect bounce). Interpreted by physics/board systems. */
  restitution?: number;
  /** Free-form serializable place-law traits game systems read (e.g. `{ stuckTurns: 1 }` for slime). */
  traits?: Readonly<Record<string, number | string | boolean>>;
}

/** Serializable algorithm parameters for a procedural ground generator. Never a genre kit. */
export interface GroundGenerator {
  /** Algorithm identifier the game's generation system resolves (e.g. "fbm", "caves", "layers"). */
  algorithm: string;
  /**
   * Algorithm tuning only — amplitudes, frequencies, thresholds, palettes of ids. Never a `seed`
   * (the engine injects one from world id + save/run) and never a genre/franchise preset name.
   */
  params?: Readonly<Record<string, number | string | boolean>>;
}

/**
 * Size of a `flat` ground: extents in world units. `Infinity` on an axis means unbounded — an
 * endless plain needs no bounds number invented for it. `y` optionally bounds vertical play space.
 */
export interface FlatGroundSize {
  x: number;
  /** Optional vertical bound of the play volume; omit for open sky. */
  y?: number;
  z: number;
  radius?: never;
}

/** Size of a `round` ground: the planet/sphere radius in world units. Nothing else. */
export interface RoundGroundSize {
  radius: number;
  x?: never;
  y?: never;
  z?: never;
}

/** Size of a `voxel` ground: the generator's domain per axis; axes may be `Infinity` for streaming volumes. */
export interface VoxelGroundSize {
  x: number;
  y: number;
  z: number;
  radius?: never;
}

/** Size of a `board` ground: a 2D surface you look at, in cells or layout units. */
export interface BoardGroundSize {
  x: number;
  y: number;
  z?: never;
  radius?: never;
}

/** A 3D walkable plane/slab. `Infinity` axes are unbounded; no separate "infinite" mode exists. */
export interface FlatGround {
  mode: "flat";
  size: FlatGroundSize;
  surface?: SurfaceLaws;
  generator?: GroundGenerator;
}

/** A planet/sphere you play on the outside of. Sized by `radius` only. */
export interface RoundGround {
  mode: "round";
  size: RoundGroundSize;
  surface?: SurfaceLaws;
  generator?: GroundGenerator;
}

/** A procedural volume of blocks. `size` is the generator domain; `generator` is algorithm params only. */
export interface VoxelGround {
  mode: "voxel";
  size: VoxelGroundSize;
  surface?: SurfaceLaws;
  generator?: GroundGenerator;
}

/**
 * A 2D surface you look at — grid games, solitaire, tabletop. Physics is often zero-gravity or
 * omitted; the game owns the face it draws on the board.
 */
export interface BoardGround {
  /** `"stage"` is accepted as an alias and normalized to `"board"`. */
  mode: "board" | "stage";
  size: BoardGroundSize;
  surface?: SurfaceLaws;
}

/** The substrate of a place, discriminated by `mode` — TS rejects a `radius` on `flat` and `x`/`z` on `round`. */
export type GroundConfig = FlatGround | RoundGround | VoxelGround | BoardGround;

/** Canonical ground modes after normalization (`stage` → `board`). */
export type GroundMode = "flat" | "round" | "voxel" | "board";

/** {@link BoardGround} with the `stage` alias resolved away. */
export type ResolvedBoardGround = Omit<BoardGround, "mode"> & { mode: "board" };

/** A place's ground after `world()` normalization. */
export type ResolvedGround = FlatGround | RoundGround | VoxelGround | ResolvedBoardGround;

/** Input to {@link world}: place identity, substrate, and the laws of this place. */
export interface PlaceConfig {
  /** Place identity — names the world for saves, seeds, and world switching. */
  id: string;
  /** The substrate: what you stand on / look at, discriminated by `mode`. */
  ground: GroundConfig;
  /**
   * Laws of THIS place (gravity, jump). Each world carries its own physics, so a game with several
   * places (a station and a moon) gives each different laws; `defineGameDefinition` resolves the
   * active world's physics over the game-level default. The engine owns simulation.
   */
  physics?: PhysicsConfig;
}

/** A declared place — the `world()` result carried on `GameDefinition.world`. */
export interface PlaceWorldFeature {
  kind: "place";
  id: string;
  ground: ResolvedGround;
  physics?: PhysicsConfig;
}

const BANNED_WORLD_KEYS = ["sky", "vegetation", "terrain", "environment", "weather", "seed"] as const;

function assertNoDressing(config: PlaceConfig): void {
  const record = config as unknown as Record<string, unknown>;
  for (const key of BANNED_WORLD_KEYS) {
    if (record[key] !== undefined) {
      throw new Error(
        key === "seed"
          ? "world: seed does not belong in a world definition — the engine derives seeds from the world id and the save/run seed (seedForPlace)."
          : `world: "${key}" does not belong in a world definition — a world is substrate + laws. Author sky, foliage, and dressing in the editor (or a content preset that writes scene data).`,
      );
    }
  }
}

function assertAxis(mode: string, axis: string, value: number, allowInfinite: boolean): void {
  const ok = value > 0 && (allowInfinite ? true : Number.isFinite(value));
  if (!ok) {
    throw new Error(
      `world: ground.size.${axis} for mode "${mode}" must be a positive${allowInfinite ? "" : " finite"} number, got ${value}`,
    );
  }
}

function resolveGround(ground: GroundConfig): ResolvedGround {
  if ((ground as unknown as Record<string, unknown>)["seed"] !== undefined) {
    throw new Error("world: seed does not belong on ground — the engine injects seeds into generators (seedForPlace).");
  }
  if ("generator" in ground && ground.generator?.params !== undefined && "seed" in ground.generator.params) {
    throw new Error(
      "world: generator.params.seed is not allowed — the engine injects the seed from world id + save/run (seedForPlace).",
    );
  }
  switch (ground.mode) {
    case "flat": {
      assertAxis("flat", "x", ground.size.x, true);
      assertAxis("flat", "z", ground.size.z, true);
      if (ground.size.y !== undefined) assertAxis("flat", "y", ground.size.y, true);
      return ground;
    }
    case "round": {
      assertAxis("round", "radius", ground.size.radius, false);
      return ground;
    }
    case "voxel": {
      assertAxis("voxel", "x", ground.size.x, true);
      assertAxis("voxel", "y", ground.size.y, true);
      assertAxis("voxel", "z", ground.size.z, true);
      return ground;
    }
    case "board":
    case "stage": {
      assertAxis("board", "x", ground.size.x, false);
      assertAxis("board", "y", ground.size.y, false);
      return ground.mode === "board" ? (ground as ResolvedBoardGround) : { ...ground, mode: "board" };
    }
  }
}

/**
 * Declares the place a game is played in: substrate (`ground`) + laws (`physics`, `ground.surface`).
 * The thin default start — `flat` with `Infinity` axes and default physics, `board` for 2D — is a
 * complete world; dressing it (sky, foliage, props, sculpt) is editor-authored scene content.
 * Multiple worlds per game are first-class: declare one `world()` per place, each with its own id,
 * ground, and physics. Games that are not a spatial place (pure UI/rules) omit `world` entirely.
 *
 * @capability world-place declare the place a game happens in — flat/round/voxel/board ground, surface laws, per-place physics
 */
export function world(config: PlaceConfig): PlaceWorldFeature {
  if (config.id.trim().length === 0) {
    throw new Error("world: id must be non-empty — it names the place for saves, seeds, and world switching");
  }
  assertNoDressing(config);
  return {
    kind: "place",
    id: config.id,
    ground: resolveGround(config.ground),
    ...(config.physics === undefined ? {} : { physics: config.physics }),
  };
}

/**
 * The engine-side seed derivation for a place: a stable string from the world `id` plus the
 * save/run seed. Generators and scatter receive this — never a `seed` field in the world
 * definition — so a save replays its world deterministically and a fresh run can vary by
 * `runSeed` alone.
 *
 * @capability world-seed derive a deterministic generator/scatter seed from world id + save/run seed
 */
export function seedForPlace(worldId: string, runSeed = ""): string {
  return runSeed.length === 0 ? worldId : `${worldId}:${runSeed}`;
}

/**
 * Resolves the physics laws in effect for the active world: a place world's own `physics` wins
 * field-by-field over the game-level default. Non-place worlds (and games with no world) keep the
 * game-level config unchanged.
 */
export function resolveWorldPhysics(
  worldFeature: { kind: string; physics?: PhysicsConfig } | undefined,
  base: PhysicsConfig | undefined,
): PhysicsConfig | undefined {
  if (worldFeature === undefined || worldFeature.kind !== "place" || worldFeature.physics === undefined) return base;
  return base === undefined ? worldFeature.physics : { ...base, ...worldFeature.physics };
}

/** Type guard for the place-model world feature. */
export function isPlaceWorld(worldFeature: { kind: string } | undefined): worldFeature is PlaceWorldFeature {
  return worldFeature?.kind === "place";
}
