import { useMemo, useState } from "react";

import { rolesFromClips } from "@jgengine/core/game/clipRoles";
import type { EditorSession } from "@jgengine/core/editor/index";

import { TERRAIN_MATERIALS } from "./uiStore";

/** A searchable, placeable asset shown in the editor's asset browser panel. */
export interface EditorAssetEntry {
  id: string;
  label: string;
  kind: "model" | "catalog" | "marker";
  url?: string;
  /** Animation clip names from the asset index — present on rigged catalog assets. */
  clips?: readonly string[];
}

/** "idle · walk · run" summary of a rigged asset's detected animation roles for the browser row badge.
 * @internal
 */
export function describeClipRoles(clips: readonly string[]): string {
  const roles = Object.keys(rolesFromClips(clips));
  return roles.length === 0 ? "no roles detected" : roles.join(" · ");
}

/** Custom drag mime carrying a material id — read by hierarchy rows and the viewport drop zone. */
export const MATERIAL_DRAG_MIME = "application/x-jgengine-material";

/**
 * Custom drag mime for placeable catalog assets. Payload is JSON
 * `{ id, label, kind }` so the viewport can call `place_asset` without a registry round-trip.
 */
export const ASSET_DRAG_MIME = "application/x-jgengine-editor-asset";

/** Serializes a placeable asset for HTML5 drag into the viewport. @internal */
export function encodeAssetDragPayload(entry: EditorAssetEntry): string {
  return JSON.stringify({ id: entry.id, label: entry.label, kind: entry.kind });
}

/** Parses an asset drag payload; returns null when the data is missing or malformed. @internal */
export function decodeAssetDragPayload(raw: string): EditorAssetEntry | null {
  if (raw.length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<EditorAssetEntry>;
    if (typeof parsed.id !== "string" || parsed.id.length === 0) return null;
    if (typeof parsed.label !== "string") return null;
    if (parsed.kind !== "model" && parsed.kind !== "catalog" && parsed.kind !== "marker") return null;
    return { id: parsed.id, label: parsed.label, kind: parsed.kind };
  } catch {
    return null;
  }
}

/** Materials palette: drag a chip onto an outliner row (assign to that object) or the viewport (paint terrain / assign to the object under the cursor). */
function MaterialsPalette() {
  return (
    <div className="flex flex-wrap gap-1 border-b border-white/[0.08] pb-2">
      {TERRAIN_MATERIALS.map((material) => (
        <div
          key={material.id}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData(MATERIAL_DRAG_MIME, material.id);
            event.dataTransfer.effectAllowed = "copy";
          }}
          title={`Drag ${material.label} onto an object or the viewport to assign/paint it`}
          className="flex cursor-grab items-center gap-1.5 rounded-full bg-black/30 px-2 py-1 text-[10px] text-neutral-300 ring-1 ring-inset ring-white/[0.08] active:cursor-grabbing"
        >
          <span className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-white/20" style={{ backgroundColor: material.color }} />
          {material.label}
        </div>
      ))}
    </div>
  );
}

/** Searchable panel for placing catalog assets or an empty marker into the scene. */
export function AssetBrowser({
  assets,
  session,
  onPlace,
}: {
  assets: readonly EditorAssetEntry[];
  session: EditorSession;
  onPlace: (entry: EditorAssetEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return assets;
    return assets.filter(
      (entry) => entry.id.toLowerCase().includes(needle) || entry.label.toLowerCase().includes(needle),
    );
  }, [assets, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <MaterialsPalette />
      <input
        type="search"
        placeholder="Search assets…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-400/60 focus:bg-black/60"
      />
      <div className="min-h-0 flex-1 space-y-0.5 overflow-auto pr-1">
        {filtered.map((entry) => (
          <div key={entry.id} className="group flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-white/[0.06]">
            <div className="min-w-0 flex-1 truncate">
              <div className="truncate text-neutral-100">{entry.label}</div>
              <div className="truncate text-[10px] text-neutral-500">
                {entry.kind} · {entry.id}
              </div>
              {entry.clips !== undefined && entry.clips.length > 0 ? (
                <div
                  className="truncate text-[10px] text-emerald-400/80"
                  title={`${entry.clips.length} animation clips (auto-animates when placed):\n${entry.clips.join("\n")}`}
                >
                  ▶ {entry.clips.length} clips · {describeClipRoles(entry.clips)}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md bg-cyan-500/20 px-2 py-0.5 text-cyan-200 opacity-0 ring-1 ring-inset ring-cyan-400/30 transition-all hover:bg-cyan-500/30 focus-visible:opacity-100 group-hover:opacity-100"
              onClick={() => onPlace(entry)}
            >
              Place
            </button>
          </div>
        ))}
        {filtered.length === 0 ? <div className="text-neutral-500">No assets match.</div> : null}
      </div>
      <button
        type="button"
        className="rounded-md bg-white/[0.05] px-2 py-1 text-neutral-300 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/10 hover:text-neutral-100"
        onClick={() => {
          const id = `marker_${Date.now().toString(36)}`;
          const focus = null;
          void focus;
          session.dispatch({
            type: "addMarker",
            marker: {
              id,
              kind: "prop",
              position: { x: 0, y: 0, z: 0 },
              label: "New marker",
              color: "#e2e8f0",
            },
          });
        }}
      >
        + Empty marker
      </button>
    </div>
  );
}

/** Turns a game's asset catalog ids into editor asset entries for the browser panel. */
export function assetsFromCatalog(
  ids: readonly string[],
  resolve?: (id: string) => { url?: string; clips?: readonly string[] } | null,
): EditorAssetEntry[] {
  return ids.map((id) => {
    const resolved = resolve?.(id);
    return {
      id,
      label: id,
      kind: "model" as const,
      ...(resolved?.url === undefined ? {} : { url: resolved.url }),
      ...(resolved?.clips === undefined ? {} : { clips: resolved.clips }),
    };
  });
}

/**
 * Converts a durable/ephemeral standalone import into a Content Browser entry.
 * Imported models are always kind `"model"` so place_asset stamps a catalogId for mesh resolution.
 * @internal
 */
export function editorAssetFromImport(asset: { id: string; url: string; label?: string }): EditorAssetEntry {
  return {
    id: asset.id,
    label: asset.label ?? asset.id,
    kind: "model",
    url: asset.url,
  };
}

/**
 * Merges imported model entries into the live browser list, replacing any prior entry that shares
 * an id (re-import stays a single catalog row).
 * @internal
 */
export function mergeEditorAssets(
  current: readonly EditorAssetEntry[],
  next: readonly EditorAssetEntry[],
): EditorAssetEntry[] {
  if (next.length === 0) return [...current];
  const byId = new Map(current.map((asset) => [asset.id, asset]));
  for (const asset of next) byId.set(asset.id, asset);
  return Array.from(byId.values());
}
