import { filterLibraryMaterials, libraryMaterialAsset } from "@jgengine/assets/catalogs/materialLibrary";
import type { MaterialAsset } from "@jgengine/core/material/materialAsset";
import { useMemo, useState } from "react";

import { FOCUS_RING, INPUT_CLS, MICRO_LABEL } from "./shell/theme";

/** Adopting a library name writes a real, editable material asset into the scene document. */
export interface MaterialLibraryBrowserProps {
  /** URL prefix the pulled maps resolve under; matches `assets pull library --dir <public>`. */
  basePath?: string;
  /** Called with the asset the author should now assign to a mesh or slot. */
  onAdopt(asset: MaterialAsset): void;
  /** Reports a name that could not be built, so a broken library entry is visible instead of silent. */
  onError(message: string): void;
}

/**
 * Browses the shared ambientCG material library by name and adds one entry to the document's
 * material assets. Names, response parameters and CC0 attribution come from `@jgengine/assets`;
 * this panel owns presentation only.
 * @internal Mounted by the materials workspace.
 */
export function MaterialLibraryBrowser({ basePath = "/materials", onAdopt, onError }: MaterialLibraryBrowserProps) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => filterLibraryMaterials(query), [query]);
  const adopt = (name: string) => {
    try {
      onAdopt(libraryMaterialAsset(name, { basePath }));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };
  return <details className="rounded-[6px] border border-white/[0.07] bg-white/[0.02]">
    <summary className={`cursor-pointer p-2 text-[11px] text-neutral-300 ${FOCUS_RING}`}>Material library ({rows.length})</summary>
    <div className="space-y-2 px-2 pb-2">
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by name, group or source…" aria-label="Filter material library" className={`h-7 w-full px-2 ${INPUT_CLS}`} />
      <p className="text-[10px] leading-snug text-neutral-500">ambientCG PBR surfaces, pulled per source with <code>assets pull library</code>. Adding one creates a reusable asset; assign it to a mesh slot or world surface.</p>
      <div className="max-h-64 space-y-0.5 overflow-auto" role="list" aria-label="Material library">
        {rows.map((entry) => <button key={entry.name} type="button" role="listitem" onClick={() => adopt(entry.name)} title={`${entry.name}${entry.source === undefined ? " (shader surface)" : ` · ${entry.source}`}`} className={`block w-full rounded-[5px] px-1.5 py-1 text-left hover:bg-white/[0.04] ${FOCUS_RING}`}>
          <span className="block truncate text-[11px] text-neutral-200">{entry.title}</span>
          <span className="block truncate text-[9px] text-neutral-600">{entry.name} · {entry.group} · {entry.surface} · {entry.tileMetres} m tile</span>
        </button>)}
        {rows.length === 0 ? <p className="px-1.5 py-1 text-[10px] text-neutral-500">No library material matches “{query}”.</p> : null}
      </div>
      <div className={MICRO_LABEL}>{rows.length} of {filterLibraryMaterials("").length} materials</div>
    </div>
  </details>;
}
