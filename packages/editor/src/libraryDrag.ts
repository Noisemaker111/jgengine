import type { LibraryEntry } from "@jgengine/assets/library/assetLibrary";
import { isLibraryLicense } from "@jgengine/assets/library/libraryLicense";
import type { LibraryKind } from "@jgengine/assets/library/librarySources";

import { mergeEditorAssets, type EditorAssetEntry } from "./AssetBrowser";
import type { EditorHostApi } from "./session";

/** Custom drag mime for a shared-library model or character card dragged toward the viewport. */
export const LIBRARY_DRAG_MIME = "application/x-jgengine-library-asset";

/** The fields of a library entry a drop needs to pull, credit and place it. */
export type LibraryDragPayload = Pick<LibraryEntry, "key" | "title" | "kind" | "author" | "license">;

const PLACEABLE_KINDS: readonly LibraryKind[] = ["model", "character"];

/** True for library kinds the viewport can place as a mesh. @internal */
export function isPlaceableLibraryKind(kind: LibraryKind): boolean {
  return PLACEABLE_KINDS.includes(kind);
}

/** Serializes a library entry for HTML5 drag into the viewport. @internal */
export function encodeLibraryDragPayload(entry: LibraryDragPayload): string {
  return JSON.stringify({ key: entry.key, title: entry.title, kind: entry.kind, author: entry.author, license: entry.license });
}

/** Parses a library drag payload; null when missing, malformed or not a placeable kind. @internal */
export function decodeLibraryDragPayload(raw: string): LibraryDragPayload | null {
  if (raw.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const get = (name: string): unknown => Object.getOwnPropertyDescriptor(parsed, name)?.value;
  const key = get("key");
  const title = get("title");
  const kind = get("kind");
  const author = get("author");
  const license = get("license");
  if (typeof key !== "string" || key.length === 0 || typeof title !== "string" || typeof author !== "string") return null;
  if (kind !== "model" && kind !== "character") return null;
  if (!isLibraryLicense(license)) return null;
  return { key, title, kind, author, license };
}

/** Where a viewport drop landed, in world space. */
export interface LibraryDropPoint {
  x: number;
  y: number;
  z: number;
}

/** Called by the viewport when a library card is dropped on it. */
export type LibraryDropHandler = (payload: LibraryDragPayload, point: LibraryDropPoint) => void;

/**
 * Hands viewport library drops to the editor chrome: the viewport and the chrome mount in separate
 * React trees, so the chrome sets `handler` and the viewport's drop zone calls it.
 * @internal
 */
export interface LibraryDropTarget {
  handler: LibraryDropHandler | null;
}

/** An empty {@link LibraryDropTarget}. @internal */
export function createLibraryDropTarget(): LibraryDropTarget {
  return { handler: null };
}

/**
 * Lists a pulled library model in the host's assets right away, so a `place_asset` that follows
 * in the same tick stamps its URL and catalog id on the marker. Returns the asset entry.
 * @internal
 */
export function registerLibraryAsset(api: Pick<EditorHostApi, "getAssets" | "setAssets">, payload: LibraryDragPayload, url: string): EditorAssetEntry {
  const asset: EditorAssetEntry = { id: payload.key, label: payload.title, kind: "model", url };
  const current: EditorAssetEntry[] = api.getAssets().map((info) => ({
    id: info.id,
    label: info.label,
    kind: info.kind === "catalog" || info.kind === "marker" ? info.kind : "model",
    ...(info.url === undefined ? {} : { url: info.url }),
  }));
  api.setAssets(mergeEditorAssets(current, [asset]));
  return asset;
}

/**
 * The drop flow: serve the entry through `add` (pull into the shared store, register), then place it
 * at `point` as a document marker, which the scene save writes to `editor.scene.json`. Resolves the
 * placed marker id, or null when the pull or the placement failed.
 * @internal
 */
export async function placeLibraryDrop(
  api: Pick<EditorHostApi, "handle">,
  payload: LibraryDragPayload,
  point: LibraryDropPoint,
  add: (payload: LibraryDragPayload) => Promise<string | null>,
): Promise<string | null> {
  const url = await add(payload);
  if (url === null) return null;
  const response = api.handle({ method: "place_asset", id: payload.key, kind: "prop", x: point.x, y: point.y, z: point.z });
  if (!response.ok) return null;
  const result = response.result;
  return typeof result === "object" && result !== null && "id" in result && typeof result.id === "string" ? result.id : null;
}
