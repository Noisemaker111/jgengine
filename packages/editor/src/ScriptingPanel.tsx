/**
 * Scripting workspace: lists every document object with an authored behavior trigger, selects them
 * for framing/inspection, and reuses {@link TriggerInspector} for edits. Writes go only through
 * session `setMarker` / `setVolume` meta patches (same path as the inspector Components tab).
 */

import { memo, useMemo } from "react";

import type { EditorSession } from "@jgengine/core/editor/index";

import { listDocumentTriggers, type DocumentTriggerEntry } from "./listDocumentTriggers";
import type { EditorHostApi } from "./session";
import { TriggerInspector } from "./TriggerInspector";
import { Icon } from "./shell/icons";
import { BORDER, CONTROL, CONTROL_ACTIVE, FOCUS_RING, MICRO_LABEL, TEXT_MUTED } from "./shell/theme";
import { shallowArrayEqual, useStoreSelector } from "./useStoreSelector";

function bindingSummary(entry: DocumentTriggerEntry): string {
  if (entry.bindings.length === 0) return "—";
  return entry.bindings.map((binding) => `${binding.on} → ${binding.action}`).join(" · ");
}

/**
 * Left-dock scripting workspace: document-wide trigger list + selected-object editor.
 * @internal — mounted by `EditorChrome` when the scripting rail workspace is active.
 */
export const ScriptingPanel = memo(function ScriptingPanel({
  session,
  api,
}: {
  session: EditorSession;
  api: EditorHostApi;
}) {
  const document = useStoreSelector(session, (state) => state.document);
  const selection = useStoreSelector(session, (state) => state.selection, shallowArrayEqual);
  const selectedId = selection[0];

  const entries = useMemo(() => listDocumentTriggers(document), [document]);

  const selectedEntry = selectedId === undefined ? undefined : entries.find((entry) => entry.sourceId === selectedId);
  const selectedMarker =
    selectedEntry?.sourceKind === "marker" ? document.markers.find((marker) => marker.id === selectedId) : undefined;
  const selectedVolume =
    selectedEntry?.sourceKind === "volume" ? document.volumes.find((volume) => volume.id === selectedId) : undefined;

  const selectEntry = (entry: DocumentTriggerEntry) => {
    session.dispatch({ type: "select", ids: [entry.sourceId] });
    api.handle({ method: "camera_goto", id: entry.sourceId });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-1 overflow-auto p-2">
        <div className="flex items-center gap-2">
          <div className={MICRO_LABEL}>Authored triggers</div>
          <span className={`ml-auto tabular-nums ${TEXT_MUTED}`}>{entries.length}</span>
        </div>
        {entries.length === 0 ? (
          <div className="rounded-[6px] border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-4 text-[11px] leading-relaxed text-neutral-500">
            No behavior triggers on this scene yet. Select a marker or volume in the hierarchy, open the Components
            tab, and add a trigger — or place a zone and set <span className="text-neutral-400">on</span> /{" "}
            <span className="text-neutral-400">action</span> in the inspector.
          </div>
        ) : (
          entries.map((entry) => {
            const selected = entry.sourceId === selectedId;
            return (
              <button
                key={`${entry.sourceKind}:${entry.sourceId}`}
                type="button"
                onClick={() => selectEntry(entry)}
                className={`flex w-full flex-col gap-0.5 rounded-[6px] px-2.5 py-2 text-left transition-colors ${FOCUS_RING} ${
                  selected ? CONTROL_ACTIVE : `${CONTROL} hover:bg-white/[0.06]`
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Icon name={entry.sourceKind === "volume" ? "cube" : "target"} size={12} />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-neutral-100">{entry.label}</span>
                  <span className={`shrink-0 text-[10px] ${TEXT_MUTED}`}>{entry.sourceKind}</span>
                </div>
                <div className={`truncate pl-[18px] text-[10px] ${TEXT_MUTED}`}>
                  {entry.objectKind} · {bindingSummary(entry)}
                </div>
              </button>
            );
          })
        )}
      </div>

      {selectedMarker !== undefined ? (
        <div className={`shrink-0 space-y-2 border-t ${BORDER} p-2.5`}>
          <div className={MICRO_LABEL}>Edit · {selectedMarker.label ?? selectedMarker.id}</div>
          <TriggerInspector
            target="marker"
            meta={selectedMarker.meta}
            onMeta={(patch, coalesce) =>
              session.dispatch(
                {
                  type: "setMarker",
                  id: selectedMarker.id,
                  patch: { meta: { ...selectedMarker.meta, ...patch } },
                },
                { coalesce: `${coalesce}:${selectedMarker.id}` },
              )
            }
          />
        </div>
      ) : null}

      {selectedVolume !== undefined ? (
        <div className={`shrink-0 space-y-2 border-t ${BORDER} p-2.5`}>
          <div className={MICRO_LABEL}>Edit · {selectedVolume.label ?? selectedVolume.id}</div>
          <TriggerInspector
            target="volume"
            meta={selectedVolume.meta}
            onMeta={(patch, coalesce) =>
              session.dispatch(
                {
                  type: "setVolume",
                  id: selectedVolume.id,
                  patch: { meta: { ...selectedVolume.meta, ...patch } },
                },
                { coalesce: `${coalesce}:${selectedVolume.id}` },
              )
            }
          />
        </div>
      ) : null}

      {selectedId !== undefined && selectedEntry === undefined ? (
        <div className={`shrink-0 border-t ${BORDER} px-2.5 py-2 text-[10px] text-neutral-500`}>
          Selection has no authored trigger. Pick a row above, or add a trigger on this object in the inspector.
        </div>
      ) : null}
    </div>
  );
});
