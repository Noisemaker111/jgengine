import type { ModelDims } from "@jgengine/core/scene/assetCatalog";
import type { AssetSpace } from "@jgengine/core/scene/assetSpace";
import type { CollisionMeshData } from "@jgengine/core/scene/collisionMesh";

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

export type AssetDownload = PinnedDownload | ScrapeDownload;

export function isScrapeDownload(download: AssetDownload): download is ScrapeDownload {
  return "scrape" in download;
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
  /** Direct archive URL tried as a last resort when the primary provider path fails; see `downloadPackArchive`. */
  mirror?: string;
}

export interface IndexEntry {
  id: string;
  source: string;
  categories: readonly string[];
  file: string;
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
