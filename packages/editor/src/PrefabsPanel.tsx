import { useState } from "react";

import type { EditorPrefab, EditorSession } from "@jgengine/core/editor/index";

import type { EditorHostApi } from "./session";
import { shallowArrayEqual, useStoreSelector } from "./useStoreSelector";

const INPUT =
  "rounded-md border border-white/10 bg-black/40 px-2 py-1 outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-400/60 focus:bg-black/60";
const BTN =
  "rounded-md bg-white/[0.04] px-2 py-1 text-neutral-300 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/10 hover:text-neutral-100";

function newPrefabId(): string {
  return `prefab_${Date.now().toString(36)}_${Math.floor(Math.random() * 1296).toString(36)}`;
}

/**
 * Reusable object stamps: "make prefab" extracts the current selection into a named, serializable
 * fragment centered on its own bounds; "insert" stamps a fresh, freshly-id'd instance at the
 * camera focus point, tagged so `detach_prefab_instance` can later break the link. Prefabs travel
 * with the document — export/import (or copy the `prefabs` array) to reuse across games.
 * @internal — mounted by `EditorChrome` as a left-aside tab.
 */
export function PrefabsPanel({ session, api }: { session: EditorSession; api: EditorHostApi }) {
  const document = useStoreSelector(session, (state) => state.document);
  const selection = useStoreSelector(session, (state) => state.selection, shallowArrayEqual);
  const [name, setName] = useState("");
  const prefabs = document.prefabs;

  const makeFromSelection = () => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || selection.length === 0) return;
    session.dispatch({ type: "createPrefab", id: newPrefabId(), name: trimmed, ids: selection });
    setName("");
  };

  const insertAt = (prefab: EditorPrefab) => {
    const focus = api.getFocusTarget() ?? { x: 0, y: 0, z: 0 };
    session.dispatch({ type: "insertPrefab", prefabId: prefab.id, at: focus });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
      <div className="flex gap-1">
        <input
          className={`min-w-0 flex-1 ${INPUT}`}
          placeholder="New prefab name…"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") makeFromSelection();
          }}
        />
        <button type="button" className={BTN} disabled={selection.length === 0 || name.trim().length === 0} onClick={makeFromSelection}>
          Make prefab
        </button>
      </div>
      {selection.length === 0 ? (
        <div className="text-[10px] text-neutral-500">Select objects, name them, then make a prefab from the selection.</div>
      ) : null}
      <div className="min-h-0 flex-1 space-y-1 overflow-auto pr-1">
        {prefabs.length === 0 ? (
          <div className="text-neutral-600">No prefabs yet.</div>
        ) : (
          prefabs.map((prefab) => {
            const count =
              prefab.fragment.markers.length +
              prefab.fragment.volumes.length +
              prefab.fragment.paths.length +
              prefab.fragment.annotations.length;
            return (
              <div key={prefab.id} className="flex items-center gap-2 rounded-md bg-white/[0.03] p-1.5 ring-1 ring-inset ring-white/[0.06]">
                <div className="min-w-0 flex-1 truncate">
                  <div className="truncate text-neutral-100">{prefab.name}</div>
                  <div className="text-[10px] text-neutral-500">{count} objects</div>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-md bg-cyan-500/20 px-2 py-0.5 text-cyan-200 ring-1 ring-inset ring-cyan-400/30 transition-colors hover:bg-cyan-500/30"
                  onClick={() => insertAt(prefab)}
                >
                  Insert
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded-md bg-rose-500/15 px-2 py-0.5 text-rose-200 ring-1 ring-inset ring-rose-400/25 transition-colors hover:bg-rose-500/25"
                  onClick={() => session.dispatch({ type: "deletePrefab", prefabId: prefab.id })}
                >
                  Delete
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
