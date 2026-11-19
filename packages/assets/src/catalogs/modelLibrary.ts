import { humanoidAnimation } from "@jgengine/core/anim/humanoidActions";
import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { MODEL_LIBRARY_ENTRIES } from "./modelLibraryEntries";
import { MODEL_LIBRARY_RIGGED_ENTRIES } from "./modelLibraryRiggedEntries";

/**
 * The realistic model library: real-world-scale, licensed, compressed models a game asks for by what
 * it needs ("street lamp", "boulder", "office desk") rather than by pack and file name.
 *
 * Every entry records where its bytes come from, who made them and under which license, so a game's
 * credits and provenance follow from the names it uses. `assets pull model:<name>` (or
 * `assets pull model-library`) downloads an entry from its official source, compresses it with
 * meshopt, writes a near and a far detail level and grounds it at its own origin; `libraryModel`
 * turns a name into the `ModelConfig` that draws it with that LOD pair.
 */

export type ModelLibraryGenre =
  | "city"
  | "park"
  | "nature"
  | "creature"
  | "survival"
  | "industrial"
  | "scifi"
  | "tower-defense"
  | "office";

export const MODEL_LIBRARY_GENRES: readonly ModelLibraryGenre[] = [
  "city",
  "park",
  "nature",
  "creature",
  "survival",
  "industrial",
  "scifi",
  "tower-defense",
  "office",
];

export interface PolyHavenModelOrigin {
  provider: "polyhaven";
  asset: string;
  near: number;
  far: number;
  /**
   * Regular expression a top-level node name must match to be kept. Several Poly Haven files ship
   * variants side by side (a clean and an aged hydrant); this keeps one.
   */
  keep?: string;
  error?: readonly [near: number, far: number];
  /**
   * Leaf-card thinning for foliage: loose cards cannot be simplified (each is its own island), so
   * the levels keep this share of the islands on primitives whose material name matches `material`.
   */
  thin?: { material: string; near: number; far: number };
}

/**
 * A model a game generated itself (text or image to 3D, e.g. LLMville's fal.ai diorama-assets
 * skill). The library never runs or pays for a generator: the game generates, reviews and commits
 * the GLB, then registers it here with the generator and terms it was made under. `assets pull`
 * skips these; `libraryModel` serves the committed file from `generatedBasePath`.
 */
export interface GeneratedModelOrigin {
  provider: "generated";
  generator: string;
  prompt: string;
  /** Path of the committed GLB under the game's generated-model base path. */
  file: string;
}

export interface RocketboxClip {
  /** Clip name in the output GLB; `Idle`, `Walk` and `Run` drive the engine's locomotion states. */
  name: string;
  file: string;
  folder: "static" | "xy" | "xyz";
  /** Remove the clip's travel along the ground so the game's own movement carries the body. */
  inPlace?: boolean;
}

/**
 * A rigged Microsoft Rocketbox avatar or animal (MIT), converted from FBX at a pinned commit of
 * `github.com/microsoft/Microsoft-Rocketbox`. One skinned GLB with its clips; no far level.
 */
export interface RocketboxModelOrigin {
  provider: "rocketbox";
  path: string;
  rootBone: string;
  clips: readonly RocketboxClip[];
  embeddedClips?: readonly string[];
  roughness?: number;
}

/**
 * A Khronos glTF Sample Assets model, fetched from `KhronosGroup/glTF-Sample-Assets` at a pinned
 * commit. `drop` names nodes to remove before compression (trademarked logos the license excludes).
 */
export interface KhronosModelOrigin {
  provider: "khronos";
  model: string;
  near: number;
  far: number;
  drop?: string;
  farDrop?: string;
  scrub?: readonly string[];
}

export interface AuthoredModelOrigin {
  provider: "authored";
  builder: string;
}

/** Where an entry's bytes come from: a scan or rig pulled from its source, an engine-authored model, or a game-committed generated one. */
export type ModelLibraryOrigin =
  | PolyHavenModelOrigin
  | RocketboxModelOrigin
  | KhronosModelOrigin
  | AuthoredModelOrigin
  | GeneratedModelOrigin;

export interface ModelLibraryEntry {
  name: string;
  title: string;
  genres: readonly ModelLibraryGenre[];
  intents: readonly string[];
  origin: ModelLibraryOrigin;
  author: string;
  license: string;
  homepage: string;
}

/**
 * Things games ask for that no licensed realistic source in the library covers yet, and the route
 * to close each one. `findLibraryModel` returns the gap instead of a wrong-looking substitute.
 */
export interface ModelLibraryGap {
  intents: readonly string[];
  reason: string;
  route: string;
}

export const MODEL_LIBRARY_GAPS: readonly ModelLibraryGap[] = [
  {
    intents: ["truck", "bus", "van", "police car", "taxi", "pickup", "motorcycle"],
    reason: "The one license-clean realistic car is the Khronos concept car (`vehicle/sports-car`); no CC0 or CC-BY trucks, buses, vans or liveried cars exist on the official sources.",
    route: "Tint `vehicle/sports-car` per role, or register a generated model.",
  },
  {
    intents: ["palm tree", "palm", "coconut tree"],
    reason: "No CC0 scanned palm at game size; Poly Haven's island trees run to millions of triangles and ambientCG has no palm frond atlas.",
    route: "A game-authored or generated palm.",
  },
  {
    intents: ["cat", "wolf", "bear", "zombie", "monster", "fish", "lion"],
    reason: "Rocketbox covers farm animals, dogs, deer and birds; nothing licensed covers predators, cats or monsters.",
    route: "A generated model, or a licensed rigged creature pack.",
  },
  {
    intents: ["spaceship", "drone", "mech", "humanoid robot", "android"],
    reason: "No CC0 or MIT realistic sci-fi vehicles or humanoid robots; `scifi/robot-arm` covers industrial robots.",
    route: "A generated model.",
  },
];

export const MODEL_LIBRARY: readonly ModelLibraryEntry[] = [...MODEL_LIBRARY_ENTRIES, ...MODEL_LIBRARY_RIGGED_ENTRIES];

const byName = new Map(MODEL_LIBRARY.map((entry) => [entry.name, entry]));

export function findLibraryModelByName(name: string): ModelLibraryEntry | null {
  return byName.get(name) ?? null;
}

export function libraryModelNames(): readonly string[] {
  return MODEL_LIBRARY.map((entry) => entry.name);
}

function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 0);
}

export interface ModelLibraryMatch {
  entry: ModelLibraryEntry;
  score: number;
}

export interface FindLibraryModelOptions {
  genre?: ModelLibraryGenre;
  limit?: number;
}

/** @capability model-library ask for a realistic licensed model by what it is ("street lamp", "office desk") */
export function findLibraryModel(query: string, options: FindLibraryModelOptions = {}): readonly ModelLibraryMatch[] {
  const wanted = query.trim().toLowerCase();
  const queryWords = words(wanted);
  if (queryWords.length === 0) return [];
  const matches: ModelLibraryMatch[] = [];
  for (const entry of MODEL_LIBRARY) {
    if (options.genre !== undefined && !entry.genres.includes(options.genre)) continue;
    let score = 0;
    if (entry.name === wanted || entry.intents.includes(wanted)) score += 100;
    const intentWords = new Set(entry.intents.flatMap(words));
    const titleWords = new Set([...words(entry.title), ...words(entry.name)]);
    for (const word of queryWords) {
      if (intentWords.has(word)) score += 10;
      else if (titleWords.has(word)) score += 4;
    }
    if (score > 0) matches.push({ entry, score });
  }
  matches.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
  return matches.slice(0, options.limit ?? 10);
}

export function libraryModelGap(query: string): ModelLibraryGap | null {
  const wanted = query.trim().toLowerCase();
  return MODEL_LIBRARY_GAPS.find((gap) => gap.intents.some((intent) => intent === wanted)) ?? null;
}

export function libraryModelDir(name: string): string {
  return `library/${name}`;
}

export interface LibraryModelOptions {
  /** URL prefix pulled models are served under; defaults to `/models`. */
  basePath?: string;
  /** URL prefix a game serves its committed generated models from; defaults to `/models/generated`. */
  generatedBasePath?: string;
  /** Metres from the camera where the far level takes over. Default 40. */
  farDistance?: number;
  /** Normalize to this height in metres; omit to draw at the scan's real-world size. */
  targetHeight?: number;
}

/**
 * The `ModelConfig` that draws a library model: real-world size, grounded at its origin, with its
 * near and far levels switched by distance. Throws for an unknown name, so a typo fails at boot.
 * @capability library-model draw a realistic library model at real size with its near and far LOD
 */
export function libraryModel(name: string, options: LibraryModelOptions = {}): ModelConfig {
  const entry = byName.get(name);
  if (entry === undefined) throw new TypeError(`Unknown library model "${name}"`);
  if (entry.origin.provider === "generated") {
    return {
      url: `${options.generatedBasePath ?? "/models/generated"}/${entry.origin.file}`,
      anchor: "origin",
      ...(options.targetHeight === undefined ? {} : { targetHeight: options.targetHeight }),
    };
  }
  const dir = `${options.basePath ?? "/models"}/${libraryModelDir(name)}`;
  const size = options.targetHeight === undefined ? {} : { targetHeight: options.targetHeight };
  if (entry.origin.provider === "rocketbox") {
    const names = new Set(entry.origin.clips.map((clip) => clip.name));
    const embedded = entry.origin.embeddedClips ?? [];
    for (const clip of embedded) names.add(clip);
    const idle = names.has("Idle") ? "Idle" : [...names][0];
    if (idle === undefined) return { url: `${dir}/model.glb`, anchor: "origin", ...size };
    const walk = names.has("Walk") ? "Walk" : idle;
    const run = names.has("Run") ? { run: "Run" } : {};
    // Rocketbox people share one Biped skeleton, so the engine's authored actions pose on all of them.
    const human = entry.origin.path.startsWith("Avatars/");
    return {
      url: `${dir}/model.glb`,
      anchor: "origin",
      ...size,
      animation: human ? humanoidAnimation({ idle, walk, ...run }) : { states: { idle, walk, ...run, walkSpeed: 0.3, runSpeed: 3.2 } },
    };
  }
  if (entry.origin.provider === "authored") return { url: `${dir}/model.glb`, anchor: "origin", ...size };
  const near = `${dir}/near.gltf`;
  return {
    url: near,
    anchor: "origin",
    ...(options.targetHeight === undefined ? {} : { targetHeight: options.targetHeight }),
    variants: { levels: [{ url: near, maxDistance: options.farDistance ?? 40 }, { url: `${dir}/far.gltf` }] },
  };
}

export function libraryModelCredits(names: readonly string[]): readonly string[] {
  return names.map((name) => {
    const entry = byName.get(name);
    if (entry === undefined) throw new TypeError(`Unknown library model "${name}"`);
    return `${entry.title} by ${entry.author} (${entry.license}) ${entry.homepage}`;
  });
}
