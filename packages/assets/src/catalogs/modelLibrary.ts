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

/** The game kinds the library is curated for; an entry lists every kind it fits. */
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

/** Every genre, in browse order. */
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

/** A Poly Haven model (CC0), fetched from `api.polyhaven.com` at its 1k texture tier. */
export interface PolyHavenModelOrigin {
  provider: "polyhaven";
  /** Poly Haven asset id, e.g. `street_lamp_01`. */
  asset: string;
  /** Triangle ratio kept for the near level (1 keeps the scan's full mesh). */
  near: number;
  /** Triangle ratio kept for the far level. */
  far: number;
  /**
   * Regular expression a top-level node name must match to be kept. Several Poly Haven files ship
   * variants side by side (a clean and an aged hydrant); this keeps one.
   */
  keep?: string;
  /**
   * Simplifier error budget for the near and far levels (defaults 0.002 and 0.03). Foliage scans
   * with hundreds of thousands of leaf triangles need a looser budget to reach their ratio.
   */
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
  /** Generator service and model, e.g. `fal.ai tripo-h3.1`. */
  generator: string;
  /** The prompt or reference the model was generated from. */
  prompt: string;
  /** Path of the committed GLB under the game's generated-model base path. */
  file: string;
}

/** One animation a Rocketbox entry carries, taken from the shared Rocketbox animation library. */
export interface RocketboxClip {
  /** Clip name in the output GLB; `Idle`, `Walk` and `Run` drive the engine's locomotion states. */
  name: string;
  /** File in Rocketbox's `Assets/Animations/all_animations_max_motextr_<folder>`. */
  file: string;
  /** `static` clips are already in place; `xy` clips travel and take `inPlace`. */
  folder: "static" | "xy";
  /** Remove the clip's travel along the ground so the game's own movement carries the body. */
  inPlace?: boolean;
}

/**
 * A rigged Microsoft Rocketbox avatar or animal (MIT), converted from FBX at a pinned commit of
 * `github.com/microsoft/Microsoft-Rocketbox`. One skinned GLB with its clips; no far level.
 */
export interface RocketboxModelOrigin {
  provider: "rocketbox";
  /** Folder under `Assets/`, e.g. `Avatars/Professions/Police_Male_01`. */
  path: string;
  /** Root bone name the in-place pass edits. */
  rootBone: string;
  clips: readonly RocketboxClip[];
  /** Names for the clips embedded in the model file itself, in order (Rocketbox animals). */
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
  /** Node names (regex, matched anywhere in the tree) the far level leaves out, such as an interior nobody sees past 40 m. */
  farDrop?: string;
  /** `Material/slot` texture slots to clear (`slot` is `baseColor` or `emissive`), e.g. a logo on a tyre wall. */
  scrub?: readonly string[];
}

/**
 * A model the engine builds itself from code and CC0 materials (no download), for shapes no licensed
 * scan covers. `builder` names the function in `modelLibraryAuthored`.
 */
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

/** One named realistic model with its source, credit and license. */
export interface ModelLibraryEntry {
  /** Stable name `<group>/<model>`, e.g. `city/street-lamp`. Names are the data contract. */
  name: string;
  title: string;
  genres: readonly ModelLibraryGenre[];
  /** What a game might call it; `findLibraryModel` matches against these first. */
  intents: readonly string[];
  origin: ModelLibraryOrigin;
  /** Credited author(s), as the source lists them. */
  author: string;
  /** SPDX id (`CC0-1.0`) or, for a generated model, the generator's output terms. */
  license: string;
  /** The page the asset is published on. */
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

/** Known gaps: requests with no licensed realistic model yet, and how each would be closed. */
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

/** Every library entry. */
export const MODEL_LIBRARY: readonly ModelLibraryEntry[] = [...MODEL_LIBRARY_ENTRIES, ...MODEL_LIBRARY_RIGGED_ENTRIES];

const byName = new Map(MODEL_LIBRARY.map((entry) => [entry.name, entry]));

/** The entry with this exact name, or `null`. */
export function findLibraryModelByName(name: string): ModelLibraryEntry | null {
  return byName.get(name) ?? null;
}

/** Every entry name, in library order. */
export function libraryModelNames(): readonly string[] {
  return MODEL_LIBRARY.map((entry) => entry.name);
}

function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 0);
}

/** One ranked answer to "what do you have for X". */
export interface ModelLibraryMatch {
  entry: ModelLibraryEntry;
  score: number;
}

/** Narrowing for {@link findLibraryModel}. */
export interface FindLibraryModelOptions {
  genre?: ModelLibraryGenre;
  limit?: number;
}

/**
 * Rank library models for a plain-words request: an exact intent wins, then intent and title word
 * overlap; a genre filter narrows the set. An empty result with a matching `libraryModelGap` means
 * the library knows it has nothing realistic for that request.
 * @capability model-library ask for a realistic licensed model by what it is ("street lamp", "office desk")
 */
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

/** The known gap a request falls in, when the library has no realistic answer for it. */
export function libraryModelGap(query: string): ModelLibraryGap | null {
  const wanted = query.trim().toLowerCase();
  return MODEL_LIBRARY_GAPS.find((gap) => gap.intents.some((intent) => intent === wanted)) ?? null;
}

/** Folder an entry's pulled files live in, relative to the models root: `library/<name>`. */
export function libraryModelDir(name: string): string {
  return `library/${name}`;
}

/** URL and LOD options for {@link libraryModel}. */
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

/** Credit lines for the library models a game uses, one per entry: title, author, license, page. */
export function libraryModelCredits(names: readonly string[]): readonly string[] {
  return names.map((name) => {
    const entry = byName.get(name);
    if (entry === undefined) throw new TypeError(`Unknown library model "${name}"`);
    return `${entry.title} by ${entry.author} (${entry.license}) ${entry.homepage}`;
  });
}
