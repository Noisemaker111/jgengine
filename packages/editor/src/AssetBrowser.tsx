import { useMemo, useState } from "react";

import type { EditorSession } from "@jgengine/core/editor/index";

import { TERRAIN_MATERIALS } from "./uiStore";

/** A searchable, placeable asset shown in the editor's asset browser panel. */
export interface EditorAssetEntry {
  id: string;
  label: string;
  kind: "model" | "catalog" | "marker";
  url?: string;
}

/** Custom drag mime carrying a material id — read by `OutlinerPanel` rows and the viewport drop zone. */
export const MATERIAL_DRAG_MIME = "application/x-jgengine-material";

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
export function assetsFromCatalog(ids: readonly string[], resolve?: (id: string) => { url?: string } | null): EditorAssetEntry[] {
  return ids.map((id) => {
    const resolved = resolve?.(id);
    return {
      id,
      label: id,
      kind: "model" as const,
      ...(resolved?.url === undefined ? {} : { url: resolved.url }),
    };
  });
}
