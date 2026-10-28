/**
 * Shared model-import helpers used by the standalone editor strip and the in-game Content Browser.
 * Host-agnostic and free of React/shell so unit tests can exercise the importer without a DOM or three.
 */

import { addGameAssetFiles } from "@jgengine/core/assets/assetBase";

/** One user-supplied model the editor can place: a stable id and a resolvable URL. */
export interface StandaloneAsset {
  id: string;
  url: string;
  label?: string;
}

const MODEL_FILE = /\.(glb|gltf)$/i;

/** Route the `@jgengine/node` editor host plugin persists uploaded models on; must match its `IMPORT_ROUTE`. */
const IMPORT_ASSET_ROUTE = "/__jgengine/import-asset";

function assetId(name: string): string {
  return name.replace(MODEL_FILE, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "asset";
}

/**
 * Persists a dropped model file through the editor host so it survives reload as a durable catalog asset,
 * returning the host-assigned id/url (which the manifest scan re-lists on reload). Resolves `null` when no
 * host is listening — a plain browser mount with no dev server — so the caller can fall back to a blob URL.
 */
export type AssetImporter = (file: File) => Promise<StandaloneAsset | null>;

/**
 * Uploads a model to the editor host plugin's import endpoint and returns the durable asset it persisted.
 * Returns `null` on any failure (no host, non-model, network error) so imports degrade to ephemeral blobs.
 * The default {@link AssetImporter} `StandaloneEditor` and the in-game Content Browser use.
 * @internal
 */
export async function importAssetToHost(
  file: File,
  route: string = IMPORT_ASSET_ROUTE,
): Promise<StandaloneAsset | null> {
  try {
    const response = await fetch(route, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-jg-filename": encodeURIComponent(file.name),
      },
      body: file,
    });
    if (!response.ok) return null;
    const asset = (await response.json()) as Partial<StandaloneAsset>;
    if (typeof asset.id !== "string" || typeof asset.url !== "string") return null;
    return { id: asset.id, url: asset.url, label: asset.label ?? file.name };
  } catch {
    return null;
  }
}

/** Route a game's dev server serves shared-library pulls on; must match `LIBRARY_PULL_ROUTE` in `games/shared/provisionAssets.ts`. */
const LIBRARY_PULL_ROUTE = "/__jgengine/library-pull";

/**
 * Asks the dev server to serve one shared-library asset (`polyhaven:ArmChair_01`) in game `game`,
 * pulling it through the shared asset store, and resolves the URL the game loads it from. The served
 * files join the running game's asset list, so a host serving many games (the dev runner) resolves
 * them. Null when no host answers or the pull fails.
 * @internal
 */
export async function pullLibraryAssetToHost(
  key: string,
  game: string,
  route: string = LIBRARY_PULL_ROUTE,
  fetchImpl: (route: string, init: RequestInit) => Promise<Response> = (target, init) => fetch(target, init),
): Promise<string | null> {
  try {
    const response = await fetchImpl(route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, game }) });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || !("url" in body) || typeof body.url !== "string") return null;
    if ("files" in body && Array.isArray(body.files)) addGameAssetFiles(body.files.filter((file): file is string => typeof file === "string"));
    return body.url;
  } catch {
    return null;
  }
}

/**
 * Turns dropped files into placeable assets: each model is persisted through `importer` when a host answers,
 * else falls back to an ephemeral `blob:` URL (lost on reload). Non-model files are skipped. Pure and
 * host-agnostic so the import wiring is testable without a DOM.
 * @internal
 */
export async function loadDroppedAssets(
  files: readonly File[],
  importer: AssetImporter,
): Promise<StandaloneAsset[]> {
  const out: StandaloneAsset[] = [];
  for (const file of files) {
    if (!MODEL_FILE.test(file.name)) continue;
    const persisted = await importer(file);
    out.push(persisted ?? { id: assetId(file.name), url: URL.createObjectURL(file), label: file.name });
  }
  return out;
}

/**
 * Appends freshly dropped assets, replacing any prior entry that shares an id (re-imports stay a
 * single catalog entry). Shared by the standalone strip and the in-game Content Browser importer.
 * @internal
 */
export function mergeStandaloneAssets(
  current: readonly StandaloneAsset[],
  next: readonly StandaloneAsset[],
): StandaloneAsset[] {
  if (next.length === 0) return [...current];
  const byId = new Map(current.map((asset) => [asset.id, asset]));
  for (const asset of next) byId.set(asset.id, asset);
  return Array.from(byId.values());
}
