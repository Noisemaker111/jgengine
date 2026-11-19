import { definedOnly } from "../data/definedOnly";
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

export interface SurfaceLaws {
  matter?: string;
  friction?: number;
  restitution?: number;
  traits?: Readonly<Record<string, number | string | boolean>>;
}

/** Serializable algorithm parameters for a procedural ground generator. Never a genre kit. */
export interface GroundGenerator {
  algorithm: string;
  /**
   * Algorithm tuning only — amplitudes, frequencies, thresholds, palettes of ids. Never a `seed`
   * (the engine injects one from world id + save/run) and never a genre/franchise preset name.
   */
  params?: Readonly<Record<string, number | string | boolean>>;
}

export interface FlatGroundSize {
  x: number;
  y?: number;
  z: number;
  radius?: never;
}

export interface RoundGroundSize {
  radius: number;
  x?: never;
  y?: never;
  z?: never;
}

export interface VoxelGroundSize {
  x: number;
  y: number;
  z: number;
  radius?: never;
}

export interface BoardGroundSize {
  x: number;
  y: number;
  z?: never;
  radius?: never;
}

export interface FlatGround {
  mode: "flat";
  size: FlatGroundSize;
  surface?: SurfaceLaws;
  generator?: GroundGenerator;
}

export interface RoundGround {
  mode: "round";
  size: RoundGroundSize;
  surface?: SurfaceLaws;
  generator?: GroundGenerator;
}

export interface VoxelGround {
  mode: "voxel";
  size: VoxelGroundSize;
  surface?: SurfaceLaws;
  generator?: GroundGenerator;
}

export interface BoardGround {
  /** `"stage"` is accepted as an alias and normalized to `"board"`. */
  mode: "board" | "stage";
  size: BoardGroundSize;
  surface?: SurfaceLaws;
}

export type GroundConfig = FlatGround | RoundGround | VoxelGround | BoardGround;

export type GroundMode = "flat" | "round" | "voxel" | "board";

export type ResolvedBoardGround = Omit<BoardGround, "mode"> & { mode: "board" };

export type ResolvedGround = FlatGround | RoundGround | VoxelGround | ResolvedBoardGround;

export interface PlaceConfig {
  id: string;
  ground: GroundConfig;
  /**
   * Laws of THIS place (gravity, jump). Each world carries its own physics, so a game with several
   * places (a station and a moon) gives each different laws; `defineGameDefinition` resolves the
   * active world's physics over the game-level default. The engine owns simulation.
   */
  physics?: PhysicsConfig;
}

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

/** @capability world-place declare the place a game happens in — flat/round/voxel/board ground, surface laws, per-place physics */
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

export function resolveWorldPhysics(
  worldFeature: { kind: string; physics?: PhysicsConfig } | undefined,
  base: PhysicsConfig | undefined,
): PhysicsConfig | undefined {
  if (worldFeature === undefined || worldFeature.kind !== "place" || worldFeature.physics === undefined) return base;
  return base === undefined ? worldFeature.physics : { ...base, ...definedOnly(worldFeature.physics) };
}

export function isPlaceWorld(worldFeature: { kind: string } | undefined): worldFeature is PlaceWorldFeature {
  return worldFeature?.kind === "place";
}
