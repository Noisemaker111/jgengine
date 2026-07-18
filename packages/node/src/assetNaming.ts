import { extname } from "node:path";

/** File extensions the editor treats as placeable models. */
export const MODEL_EXT = /\.(glb|gltf)$/i;

/**
 * Derives the stable catalog id a model's workspace-relative path resolves under — lowercased,
 * extension-stripped, non-alphanumerics collapsed to single hyphens. The folder scan and every
 * durable import share this so a placement referencing the id resolves regardless of how the
 * asset entered the catalog.
 * @internal
 */
export function assetIdFromRel(rel: string): string {
  const cleaned = rel
    .replace(MODEL_EXT, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return cleaned.length > 0 ? cleaned : "asset";
}

/**
 * Strips path components and unsafe characters from an uploaded model filename, keeping its
 * `.glb`/`.gltf` extension — so an untrusted upload name can never escape its target folder.
 * @internal
 */
export function safeAssetFilename(filename: string): string {
  const base = (filename.split(/[\\/]/).pop() ?? "").trim();
  const ext = extname(base).toLowerCase();
  const stem = base
    .slice(0, base.length - ext.length)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return (stem.length > 0 ? stem : "asset") + ext;
}
