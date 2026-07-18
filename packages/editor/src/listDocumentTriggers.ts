/**
 * Pure collect of authored behavior triggers from a scene document for the scripting workspace.
 * Object-centric: one row per marker/volume that carries at least one valid on/action binding.
 * Runtime dispatch still uses {@link collectAuthoredTriggers}; this is the editor list model.
 */

import {
  readTriggerSpecs,
  type TriggerEvent,
  type TriggerSourceKind,
} from "@jgengine/core/scene/authoredTriggers";
import type { SceneDocumentLike, SceneMarkerLike, SceneVolumeLike } from "@jgengine/core/world/sceneShapes";

/** One on/action binding shown on a document trigger row. */
export interface DocumentTriggerBinding {
  on: TriggerEvent;
  action: string;
}

/**
 * A marker or volume that owns one or more authored triggers, with a display label for the
 * scripting workspace list.
 */
export interface DocumentTriggerEntry {
  sourceId: string;
  sourceKind: TriggerSourceKind;
  objectKind: string;
  /** Marker/volume label when present; otherwise the object id. */
  label: string;
  bindings: readonly DocumentTriggerBinding[];
}

/** Document slice the list helper needs — `EditorDocument` satisfies this structurally. */
export interface DocumentTriggersSource {
  markers: readonly (SceneMarkerLike & { label?: string })[];
  volumes: readonly (SceneVolumeLike & { label?: string })[];
}

function labelOf(object: { id: string; label?: string }): string {
  const label = object.label;
  return typeof label === "string" && label.length > 0 ? label : object.id;
}

function bindingsFromMeta(meta: Record<string, unknown> | undefined): DocumentTriggerBinding[] {
  return readTriggerSpecs(meta).map((spec) => ({ on: spec.on, action: spec.action }));
}

/**
 * List every marker and volume on `document` that has at least one valid authored trigger.
 * Pure — no session, registry, or runtime state. Markers are listed before volumes; order within
 * each collection matches the document. Prefer this over {@link collectAuthoredTriggers} when the
 * UI wants one row per object rather than one row per binding.
 */
export function listDocumentTriggers(document: DocumentTriggersSource | SceneDocumentLike): DocumentTriggerEntry[] {
  const out: DocumentTriggerEntry[] = [];
  for (const marker of document.markers) {
    const bindings = bindingsFromMeta(marker.meta);
    if (bindings.length === 0) continue;
    out.push({
      sourceId: marker.id,
      sourceKind: "marker",
      objectKind: marker.kind,
      label: labelOf(marker as SceneMarkerLike & { label?: string }),
      bindings,
    });
  }
  for (const volume of document.volumes) {
    const bindings = bindingsFromMeta(volume.meta);
    if (bindings.length === 0) continue;
    out.push({
      sourceId: volume.id,
      sourceKind: "volume",
      objectKind: volume.kind,
      label: labelOf(volume as SceneVolumeLike & { label?: string }),
      bindings,
    });
  }
  return out;
}
