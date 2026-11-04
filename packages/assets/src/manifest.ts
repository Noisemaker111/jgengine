import type { ModelDims } from "@jgengine/core/scene/assetCatalog";
import type { AssetSpace } from "@jgengine/core/scene/assetSpace";
import type { CollisionMeshData } from "@jgengine/core/scene/collisionMesh";

import type { GlbMetrics } from "./glbMetrics";
import type { MaterialMapRole } from "./materials";

export type { ModelDims };
export type { AssetSpace };
export type { CollisionMeshData };

export type AssetProvider =
  | "quaternius"
  | "kaykit"
  | "polypizza"
  | "itch"
  | "ambientcg"
  | "gameicons"
  | "custom";

/**
 * What a source's archive contains: GLB models (default), one PBR material's
 * texture maps, or a pack of individual 2D sprite/icon files (SVG/PNG).
 */
export type AssetSourceKind = "model" | "material" | "sprite";

export interface PinnedDownload {
  url: string;
  sha256?: string;
}

export interface ScrapeDownload {
  scrape: string;
}

/**
 * A Poly Pizza bundle (the `poly.pizza/bundle/<slug>` path), zipped on download as one `.glb` per
 * model. Every model's licence must match the source's.
 */
export interface PolyPizzaBundleDownload {
  polyPizzaBundle: string;
}

/** A free itch.io download: the game page URL and the title of the upload to take. */
export interface ItchDownload {
  itch: string;
  upload: string;
}

export type AssetDownload = PinnedDownload | ScrapeDownload | PolyPizzaBundleDownload | ItchDownload;

export function isScrapeDownload(download: AssetDownload): download is ScrapeDownload {
  return "scrape" in download;
}

/** Where a download comes from, for logs and errors. @internal */
export function downloadLabel(download: AssetDownload): string {
  if ("scrape" in download) return download.scrape;
  if ("polyPizzaBundle" in download) return `https://poly.pizza/bundle/${download.polyPizzaBundle}`;
  if ("itch" in download) return `${download.itch} (${download.upload})`;
  return download.url;
}

export interface AssetSource {
  id: string;
  /** What the archive contains: GLB models (default), a PBR material's texture maps, or a sprite/icon pack. */
  kind?: AssetSourceKind;
  provider: AssetProvider;
  title: string;
  license: string;
  author: string;
  categories: readonly string[];
  download: AssetDownload;
  homepage?: string;
  /**
   * How a sprite pack's files are laid out once pulled: `flat` (default) dedupes every file by its
   * basename into one folder; `folders` keeps each file's path below the archive's root folder, for
   * packs whose files share names across folders (game-icons.net's per-artist folders).
   */
  spriteLayout?: "flat" | "folders";
  /** Map roles present in the pinned material archive, used by the catalog and checked during pull. */
  materialMaps?: readonly MaterialMapRole[];
  /** Direct archive URL tried as a last resort when the primary provider path fails; see `downloadPackArchive`. */
  mirror?: string;
  /**
   * Why this model pack contributes nothing to the generated index yet. A model source with
   * no index entries has never been pulled, so nothing has ever checked that its pinned URL
   * points at the pack it is titled after or that the archive even ships `glTF/` — the shape
   * that let a Street Pack sit in the catalogue as "Downtown City MegaKit". `verifyData`
   * requires this string rather than letting the gap pass silently.
   */
  unpulled?: string;
}

/**
 * One pulled model pack's index: its source id and every entry measured from its GLBs. Each pack
 * is its own named export in `@jgengine/assets/generated/packs`, so a game bundles only the packs it
 * imports and hands to `buildCatalog({ packs })`.
 */
export interface AssetPack {
  readonly id: string;
  readonly entries: readonly IndexEntry[];
}

/** The name a pack is exported under in `generated/packs`: its source id in camelCase (`kaykit-dungeon` → `kaykitDungeon`). */
export function packExportName(sourceId: string): string {
  const words = sourceId.split(/[^a-zA-Z0-9]+/).filter((word) => word.length > 0);
  const name = words.map((word, i) => (i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1))).join("");
  if (!/^[a-zA-Z_$]/.test(name)) throw new Error(`source id "${sourceId}" does not make a valid pack export name`);
  return name;
}

/** The original export names imported from `generated/packs`, including imports renamed locally. */
export function importedPackNames(text: string): ReadonlySet<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']@jgengine\/assets\/generated\/packs["']/g)) {
    for (const name of (match[1] ?? "").matchAll(/([A-Za-z_$][\w$]*)(?:\s+as\s+[A-Za-z_$][\w$]*)?/g)) {
      if (name[1] !== undefined) found.add(name[1]);
    }
  }
  return found;
}

/** A source-owned model or sprite id, with optional offline model measurements. */
export interface IndexEntry {
  id: string;
  source: string;
  categories: readonly string[];
  file: string;
  /** Offline byte, stored-triangle, and image inventory measured at reindex; absent if inspection fails. */
  metrics?: GlbMetrics;
  /** Footprint/center/minY measured from the GLB at reindex; absent when the model could not be read. */
  dims?: ModelDims;
  /** Opt-in compact triangle mesh extracted at reindex (see {@link "@jgengine/core/scene/collisionMesh".CollisionMeshData}); present only for ids in `COLLISION_MESH_ASSET_IDS` whose geometry extracted. */
  collisionMesh?: CollisionMeshData;
  /** Animation clip names read from the GLB at reindex; absent for unrigged/unreadable models. */
  clips?: readonly string[];
  /** Authored asset-space metadata (canonical facing, unit scale, footprint, anchor, bounds, rotation policy); absent unless a curator overrides the measured defaults. */
  space?: AssetSpace;
}

export interface AssetAlias {
  key: string;
  target: string;
}

export interface SingleAsset {
  id: string;
  url: string;
  license: string;
  author: string;
  categories: readonly string[];
}
