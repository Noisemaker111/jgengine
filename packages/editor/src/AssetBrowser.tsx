import { useMemo, useState } from "react";

import type { EditorSession } from "@jgengine/core/editor/index";

/** A searchable, placeable asset shown in the editor's asset browser panel. */
export interface EditorAssetEntry {
  id: string;
  label: string;
  kind: "model" | "catalog" | "marker";
  url?: string;
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
      <div className="font-medium text-neutral-300">Assets</div>
      <input
        type="search"
        placeholder="Search assets…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="rounded border border-white/10 bg-black/40 px-2 py-1 text-neutral-100"
      />
      <div className="min-h-0 flex-1 space-y-0.5 overflow-auto pr-1">
        {filtered.map((entry) => (
          <div key={entry.id} className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-white/10">
            <div className="min-w-0 flex-1 truncate">
              <div className="truncate text-neutral-100">{entry.label}</div>
              <div className="truncate text-[10px] text-neutral-500">
                {entry.kind} · {entry.id}
              </div>
            </div>
            <button
              type="button"
              className="shrink-0 rounded bg-cyan-800/70 px-1.5 py-0.5 hover:bg-cyan-700"
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
        className="rounded bg-white/10 px-2 py-1 hover:bg-white/20"
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
