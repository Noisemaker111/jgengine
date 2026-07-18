import { useState } from "react";

import {
  collectDescendants,
  editorParentOf,
  findEditorNote,
  findEditorPath,
  isEditorObjectLocked,
  type EditorSession,
  type EditorVolume,
} from "@jgengine/core/editor/index";
import { readVegetationSettings, vegetationFootprint } from "@jgengine/core/world/vegetation";
import {
  getSceneKind,
  isSceneKind,
  parseParams,
  type SceneKindObject,
} from "@jgengine/core/scene/sceneKinds";
import { getAssetGenerator } from "@jgengine/core/scene/assetGenerator";
import type { TriggerSourceKind } from "@jgengine/core/scene/authoredTriggers";
import { useGameContext } from "@jgengine/react/provider";

import {
  canAuthorTrigger,
  clearMaterialAssignmentPatch,
  clearTriggerInstallPatch,
  defaultTriggerInstallPatch,
  hasAuthoredTrigger,
  hasMaterialAssignment,
} from "./authoredComponentMeta";
import { SchemaInspector, type MetaPatch } from "./SchemaInspector";
import { TriggerInspector } from "./TriggerInspector";
import type { EditorHostApi } from "./session";
import type { EditorUiStore } from "./uiStore";
import { TERRAIN_MATERIALS } from "./uiStore";
import { shallowArrayEqual, useStoreSelector } from "./useStoreSelector";
import { INPUT } from "./chromeStyles";
import { NumberField } from "./chromeFields";
import { AxisNumberField, FieldRow, SectionAction } from "./shell/fields";
import { Icon, kindIcon } from "./shell/icons";
import type { InspectorTab } from "./shell/layoutStore";
import { FOCUS_RING, INPUT_CLS, NUMERIC } from "./shell/theme";
import { CollapsibleSection, EmptyState, IconButton, PanelTabs } from "./shell/ui";

function VegetationFields({
  volume,
  onMeta,
}: {
  volume: EditorVolume;
  onMeta: (patch: Record<string, unknown>, coalesce: string) => void;
}) {
  const settings = readVegetationSettings(volume);
  if (settings === null) return null;
  const footprint = vegetationFootprint(volume);
  const areaM2 = (footprint.maxX - footprint.minX) * (footprint.maxZ - footprint.minZ);
  const sliderMax = settings.item === "grass" ? 12 : 1;
  const estimated = Math.floor(areaM2 * settings.density);
  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">item</span>
        <input
          className={`w-32 ${INPUT}`}
          value={settings.item}
          placeholder="grass"
          onChange={(event) => onMeta({ item: event.target.value }, "veg:item")}
        />
      </label>
      <label className="block space-y-1">
        <span className="flex items-center justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">density /m²</span>
          <span className="text-cyan-200">{settings.density.toFixed(2)}</span>
        </span>
        <input
          type="range"
          min={0}
          max={sliderMax}
          step={sliderMax / 200}
          className="w-full accent-emerald-400"
          value={Math.min(settings.density, sliderMax)}
          onChange={(event) => onMeta({ density: Number(event.target.value) }, "veg:density")}
        />
      </label>
      <NumberField label="density" step={0.01} value={settings.density} onCommit={(value) => onMeta({ density: Math.max(0, value) }, "veg:density")} />
      <NumberField label="min scale" step={0.05} value={settings.minScale} onCommit={(value) => onMeta({ minScale: value }, "veg:minScale")} />
      <NumberField label="max scale" step={0.05} value={settings.maxScale} onCommit={(value) => onMeta({ maxScale: value }, "veg:maxScale")} />
      <NumberField label="spacing" step={0.25} value={settings.minDistance} onCommit={(value) => onMeta({ minDistance: Math.max(0, value) }, "veg:minDistance")} />
      <label className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">seed</span>
        <input
          className={`w-32 ${INPUT}`}
          value={settings.seed}
          placeholder="reroll…"
          onChange={(event) => onMeta({ seed: event.target.value }, "veg:seed")}
        />
      </label>
      <div className="text-[10px] text-neutral-500">≈ {estimated.toLocaleString()} {settings.item === "grass" ? "blades" : "placements"} over {Math.round(areaM2).toLocaleString()} m²</div>
    </div>
  );
}

/** Builds the resolver-facing view of a document object for a registered scene kind's inspector. */
function markerObject(marker: { id: string; kind: string; position: { x: number; y: number; z: number }; rotationY?: number; meta?: Record<string, unknown> }): SceneKindObject {
  return { id: marker.id, kind: marker.kind, position: marker.position, ...(marker.rotationY === undefined ? {} : { rotationY: marker.rotationY }), ...(marker.meta === undefined ? {} : { meta: marker.meta }) };
}

function volumeObject(volume: EditorVolume): SceneKindObject {
  return {
    id: volume.id,
    kind: volume.kind,
    center: volume.center,
    ...(volume.halfExtents === undefined ? {} : { halfExtents: volume.halfExtents }),
    ...(volume.radius === undefined ? {} : { radius: volume.radius }),
    ...(volume.meta === undefined ? {} : { meta: volume.meta }),
  };
}

function pathObject(path: NonNullable<ReturnType<typeof findEditorPath>>): SceneKindObject {
  return { id: path.id, kind: path.kind, points: path.points.map((point) => ({ x: point.x, y: point.y, z: point.z })), ...(path.meta === undefined ? {} : { meta: path.meta }) };
}

/** Auto-generated inspector for a registered scene kind's params (schema-driven, no per-kind JSX). */
function KindInspector({ object, meta, onMeta }: { object: SceneKindObject; meta: Record<string, unknown> | undefined; onMeta: MetaPatch }) {
  const definition = getSceneKind(object.kind);
  if (definition === undefined) return null;
  const note = definition.note?.(object, parseParams(definition.schema, object.meta));
  return (
    <SchemaInspector
      schema={definition.schema}
      label={definition.label}
      meta={meta}
      onMeta={onMeta}
      {...(definition.accent === undefined ? {} : { accent: definition.accent })}
      {...(note === undefined ? {} : { note })}
    />
  );
}

/** Auto-generated inspector for a placed generator asset's params (building/bookcase/…). */
function GeneratorInspector({ meta, onMeta }: { meta: Record<string, unknown> | undefined; onMeta: MetaPatch }) {
  const assetId = typeof meta?.["assetId"] === "string" ? (meta["assetId"] as string) : undefined;
  const generator = assetId === undefined ? undefined : getAssetGenerator(assetId);
  if (generator === undefined) return null;
  return <SchemaInspector schema={generator.schema} label={`${generator.label} (generator)`} accent="#a78bfa" meta={meta} onMeta={onMeta} />;
}

/**
 * Tags an object as a gameplay spot with a clearance radius: scatter keeps foliage off it and the
 * runtime ground flattens under it (via `clearanceZonesFrom` → `environment({ clearings })`). 0 = untagged.
 */
function ClearanceField({
  meta,
  onMeta,
}: {
  meta: Record<string, unknown> | undefined;
  onMeta: (patch: Record<string, unknown>, coalesce: string) => void;
}) {
  const value = typeof meta?.["clearance"] === "number" ? (meta["clearance"] as number) : 0;
  return (
    <FieldRow label="Clearance" title="Radius (m) foliage stays clear of and terrain flattens under; 0 = no clearance">
      <AxisNumberField label="m" step={0.5} value={value} onCommit={(next) => onMeta({ clearance: Math.max(0, next) }, "clearance")} />
    </FieldRow>
  );
}

/** Inspector row to parent the selected object under another (excludes itself and its descendants). */
function ParentField({ session, id }: { session: EditorSession; id: string }) {
  const document = session.getState().document;
  const current = editorParentOf(document, id) ?? "";
  const banned = collectDescendants(document, [id]);
  banned.add(id);
  const labelOf = (node: { id: string; label?: string }) => node.label ?? node.id;
  const candidates = [
    ...document.markers.map((m) => ({ id: m.id, label: labelOf(m) })),
    ...document.volumes.map((v) => ({ id: v.id, label: labelOf(v) })),
    ...document.paths.map((p) => ({ id: p.id, label: labelOf(p) })),
    ...document.annotations.map((n) => ({ id: n.id, label: n.text.slice(0, 30) || n.id })),
  ].filter((entry) => !banned.has(entry.id));
  return (
    <FieldRow label="Parent">
      <select
        className={`h-6.5 w-full min-w-0 px-1.5 ${INPUT_CLS}`}
        value={current}
        aria-label="Parent object"
        onChange={(event) => session.dispatch({ type: "setParent", ids: [id], parentId: event.target.value === "" ? null : event.target.value })}
      >
        <option value="">— none (root) —</option>
        {candidates.map((entry) => (
          <option key={entry.id} value={entry.id}>{entry.label}</option>
        ))}
      </select>
    </FieldRow>
  );
}

function KindColorFields({
  kind,
  color,
  onKind,
  onColor,
}: {
  kind: string;
  color: string | undefined;
  onKind: (kind: string) => void;
  onColor: (color: string | undefined) => void;
}) {
  return (
    <div className="space-y-2">
      <FieldRow label="Kind">
        <input
          className={`h-6.5 w-full min-w-0 px-2 ${INPUT_CLS}`}
          value={kind}
          aria-label="Object kind"
          onChange={(event) => {
            const next = event.target.value.trim();
            if (next.length > 0) onKind(next);
          }}
        />
      </FieldRow>
      <FieldRow label="Color">
        <input
          type="color"
          className="h-6.5 w-9 shrink-0 cursor-pointer rounded-[5px] border border-white/10 bg-black/40"
          title="Display color"
          aria-label="Display color"
          value={color ?? "#ffffff"}
          onChange={(event) => onColor(event.target.value)}
        />
        {color !== undefined ? (
          <SectionAction label="Reset to kind default color" onClick={() => onColor(undefined)}>
            reset
          </SectionAction>
        ) : (
          <span className="text-[10px] text-neutral-600">kind default</span>
        )}
      </FieldRow>
    </div>
  );
}

/** Header card identifying the selected object: type glyph, editable name, kind, id, lock state. */
function ObjectHeader({
  kind,
  id,
  label,
  placeholder,
  locked,
  onLabel,
}: {
  kind: string;
  id: string;
  label: string;
  placeholder: string;
  locked: boolean;
  onLabel?: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] border border-white/[0.08] bg-white/[0.03] text-cyan-300">
        <Icon name={kindIcon(kind)} size={17} />
      </div>
      <div className="min-w-0 flex-1">
        {onLabel !== undefined ? (
          <input
            className={`h-6.5 w-full px-2 font-medium text-cyan-100 ${INPUT_CLS}`}
            value={label}
            placeholder={placeholder}
            aria-label="Object name"
            onChange={(event) => onLabel(event.target.value)}
          />
        ) : (
          <div className="truncate text-[12px] font-medium text-cyan-100">{label.length > 0 ? label : placeholder}</div>
        )}
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-neutral-500">
          <span>{kind}</span>
          <span className="text-neutral-700">·</span>
          <span className="truncate" title={id}>{id}</span>
          {locked ? <Icon name="lock" size={10} className="shrink-0 text-amber-400/80" aria-label="Locked via collection" /> : null}
        </div>
      </div>
    </div>
  );
}

interface SectionState {
  collapsed: Record<string, boolean>;
  toggle: (id: string) => void;
}

/**
 * Add/remove bar for optional authored components (trigger, material). Only offers real
 * data-model seams — no invented component system.
 */
function ComponentAddBar({
  target,
  meta,
  onMeta,
  api,
  selectionIds,
}: {
  target: TriggerSourceKind;
  meta: Record<string, unknown> | undefined;
  onMeta: (patch: Record<string, unknown>, coalesce: string) => void;
  api?: EditorHostApi;
  selectionIds: readonly string[];
}) {
  const offerTrigger = canAuthorTrigger(target) && !hasAuthoredTrigger(meta);
  const offerMaterial = api !== undefined && selectionIds.length > 0 && !hasMaterialAssignment(meta);
  if (!offerTrigger && !offerMaterial) return null;
  return (
    <div className="space-y-1.5 rounded-[6px] border border-dashed border-white/[0.1] bg-white/[0.02] p-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">Add component</div>
      <div className="flex flex-wrap gap-1.5">
        {offerTrigger ? (
          <button
            type="button"
            className={`rounded-[5px] border border-amber-400/25 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-100 transition-colors hover:bg-amber-500/20 ${FOCUS_RING}`}
            onClick={() => {
              const patch = defaultTriggerInstallPatch(target, meta);
              if (patch !== null) onMeta(patch, "component:add-trigger");
            }}
          >
            + Trigger
          </button>
        ) : null}
        {offerMaterial ? (
          <label className="flex items-center gap-1.5 text-[11px] text-neutral-400">
            <span className="sr-only">Add material</span>
            <select
              className={`h-7 max-w-[10rem] px-1.5 ${INPUT_CLS}`}
              defaultValue=""
              aria-label="Add material component"
              onChange={(event) => {
                const materialId = event.target.value;
                if (materialId.length === 0) return;
                api.handle({ method: "assign_material", ids: [...selectionIds], materialId });
                event.currentTarget.value = "";
              }}
            >
              <option value="">+ Material…</option>
              {TERRAIN_MATERIALS.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  icon,
  sections,
  children,
  trailing,
}: {
  id: string;
  title: string;
  icon?: Parameters<typeof CollapsibleSection>[0]["icon"];
  sections: SectionState;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <CollapsibleSection
      title={title}
      {...(icon === undefined ? {} : { icon })}
      open={sections.collapsed[id] !== true}
      onToggle={() => sections.toggle(id)}
      {...(trailing === undefined ? {} : { trailing })}
    >
      {children}
    </CollapsibleSection>
  );
}

/** Materials tab: assign the terrain material palette to the current selection over the real RPC. */
function MaterialsTab({
  api,
  selection,
  meta,
}: {
  api: EditorHostApi | undefined;
  selection: readonly string[];
  meta: Record<string, unknown> | undefined;
}) {
  const current = typeof meta?.["materialId"] === "string" ? (meta["materialId"] as string) : null;
  if (selection.length === 0) {
    return (
      <EmptyState
        icon="sphere"
        title="No selection"
        description="Select an object to view or assign its material. Chips can also be dragged onto hierarchy rows or the viewport."
      />
    );
  }
  return (
    <div className="space-y-2.5 p-2.5">
      <div className="text-[10px] text-neutral-500">
        Assigned material
        <div className="mt-1 flex items-center gap-2 rounded-[6px] border border-white/[0.07] bg-white/[0.02] px-2.5 py-2 text-[12px] text-neutral-200">
          {current !== null ? (
            <>
              <span
                className="h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-white/20"
                style={{ backgroundColor: TERRAIN_MATERIALS.find((material) => material.id === current)?.color ?? "#888" }}
              />
              {current}
            </>
          ) : (
            <span className="text-neutral-500">none — kind default appearance</span>
          )}
        </div>
      </div>
      <div className="text-[10px] text-neutral-500">Palette</div>
      <div className="flex flex-wrap gap-1.5">
        {TERRAIN_MATERIALS.map((material) => (
          <button
            key={material.id}
            type="button"
            disabled={api === undefined}
            onClick={() => api?.handle({ method: "assign_material", ids: [...selection], materialId: material.id })}
            className={`flex items-center gap-1.5 rounded-[6px] border px-2 py-1 text-[11px] transition-colors ${FOCUS_RING} ${
              current === material.id
                ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
                : "border-white/[0.08] bg-[#191d24] text-neutral-300 hover:bg-[#1f242d]"
            }`}
            title={`Assign ${material.label} to selection`}
          >
            <span className="h-3 w-3 rounded-full ring-1 ring-inset ring-white/20" style={{ backgroundColor: material.color }} />
            {material.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The right-hand inspector as an isolated, selector-subscribed panel: tabbed (Inspector /
 * Components / Materials), with collapsible component cards over the live selected object.
 * Reads only the document + selection slices (via `useStoreSelector`) and the ui store's
 * `pathPoint` slice, so UI-only churn never rerenders it on `EditorChrome`'s render tick.
 * @internal — mounted by `EditorChrome` inside the right dock.
 */
export function InspectorPanel({
  session,
  ui,
  onClose,
  api,
  tab,
  onSelectTab,
  collapsed,
  onToggleSection,
}: {
  session: EditorSession;
  ui: EditorUiStore;
  onClose?: () => void;
  /** Host API for RPC-backed actions (material assignment, camera). */
  api?: EditorHostApi;
  /** Controlled active tab; omit for local state. */
  tab?: InspectorTab;
  onSelectTab?: (tab: InspectorTab) => void;
  /** Controlled section collapse state (persisted by the shell layout store). */
  collapsed?: Record<string, boolean>;
  onToggleSection?: (id: string) => void;
}) {
  const document = useStoreSelector(session, (state) => state.document);
  const selection = useStoreSelector(session, (state) => state.selection, shallowArrayEqual);
  const pathPoint = useStoreSelector(ui, (state) => state.pathPoint);
  const ctx = useGameContext();
  const [localTab, setLocalTab] = useState<InspectorTab>("inspector");
  const [localCollapsed, setLocalCollapsed] = useState<Record<string, boolean>>({});
  const [linkedExtents, setLinkedExtents] = useState(false);

  const activeTab = tab ?? localTab;
  const selectTab = onSelectTab ?? setLocalTab;
  const sections: SectionState = {
    collapsed: collapsed ?? localCollapsed,
    toggle:
      onToggleSection ??
      ((id: string) => setLocalCollapsed((previous) => ({ ...previous, [id]: !(previous[id] === true) }))),
  };

  const selectedId = selection[0];
  const selectedMarker = document.markers.find((marker) => marker.id === selectedId);
  const selectedVolume = document.volumes.find((volume) => volume.id === selectedId);
  const selectedPath = selectedId === undefined ? undefined : findEditorPath(document, selectedId);
  const selectedNote = selectedId === undefined ? undefined : findEditorNote(document, selectedId);
  const documentMiss =
    selectedId !== undefined &&
    selectedMarker === undefined &&
    selectedVolume === undefined &&
    selectedPath === undefined &&
    selectedNote === undefined;
  const liveEntity = documentMiss ? ctx.scene.entity.get(selectedId) : null;
  const liveObject = documentMiss && liveEntity === null ? ctx.scene.object.get(selectedId) : null;

  const selectedMeta = selectedMarker?.meta ?? selectedVolume?.meta ?? selectedPath?.meta;

  let body: React.ReactNode = null;

  if (activeTab === "materials") {
    body = <MaterialsTab api={api} selection={selection} meta={selectedMeta} />;
  } else if (selection.length > 1) {
    const positions = selection
      .map((id) => {
        const marker = document.markers.find((entry) => entry.id === id);
        if (marker !== undefined) return { id, position: marker.position };
        const volume = document.volumes.find((entry) => entry.id === id);
        if (volume !== undefined) return { id, position: volume.center };
        const note = document.annotations.find((entry) => entry.id === id);
        if (note !== undefined) return { id, position: note.position };
        return null;
      })
      .filter((entry): entry is { id: string; position: { x: number; y: number; z: number } } => entry !== null);

    const axisValues = (axis: "x" | "y" | "z") => {
      if (positions.length === 0) return { value: 0, mixed: true };
      const first = positions[0]!.position[axis];
      const mixed = positions.some((entry) => entry.position[axis] !== first);
      return { value: first, mixed };
    };
    const commitAxis = (axis: "x" | "y" | "z", value: number) => {
      for (const entry of positions) {
        session.dispatch(
          {
            type: "setTransform",
            id: entry.id,
            position: { ...entry.position, [axis]: value },
          },
          { coalesce: `multi-pos:${axis}:${entry.id}` },
        );
      }
    };

    body = (
      <div className="space-y-2.5 p-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] border border-white/[0.08] bg-white/[0.03] text-cyan-300">
            <Icon name="layers" size={17} />
          </div>
          <div>
            <div className="text-[12px] font-medium text-neutral-100">{selection.length} objects selected</div>
            <div className="text-[10px] text-neutral-500">
              Shared fields show “—” when mixed; writing applies to every selected object
            </div>
          </div>
        </div>
        <div className="max-h-28 space-y-0.5 overflow-auto rounded-[6px] border border-white/[0.06] bg-black/20 p-1.5 text-[10px] text-neutral-500">
          {selection.map((id) => (
            <div key={id} className="truncate">{id}</div>
          ))}
        </div>
        {positions.length > 0 ? (
          <div className="space-y-1.5 rounded-[6px] border border-white/[0.06] bg-white/[0.02] p-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">Position</div>
            <FieldRow label="Position">
              {(["x", "y", "z"] as const).map((axis) => {
                const { value, mixed } = axisValues(axis);
                return (
                  <AxisNumberField
                    key={axis}
                    axis={axis}
                    label={axis}
                    step={0.5}
                    value={value}
                    mixed={mixed}
                    onCommit={(next) => commitAxis(axis, next)}
                  />
                );
              })}
            </FieldRow>
          </div>
        ) : null}
        <div className="flex gap-1.5">
          <button
            type="button"
            className={`flex-1 rounded-[5px] border border-white/[0.07] bg-[#191d24] px-2 py-1.5 text-[11px] text-neutral-200 transition-colors hover:bg-[#1f242d] ${FOCUS_RING}`}
            onClick={() => session.dispatch({ type: "duplicate", ids: selection })}
          >
            Duplicate
          </button>
          <button
            type="button"
            className={`flex-1 rounded-[5px] border border-rose-400/25 bg-rose-500/15 px-2 py-1.5 text-[11px] text-rose-200 transition-colors hover:bg-rose-500/25 ${FOCUS_RING}`}
            onClick={() => session.dispatch({ type: "removeMany", ids: selection })}
          >
            Delete all
          </button>
        </div>
      </div>
    );
  } else if (selectedMarker !== undefined) {
    const marker = selectedMarker;
    const onMeta = (patch: Record<string, unknown>, coalesce: string) =>
      session.dispatch({ type: "setMarker", id: marker.id, patch: { meta: { ...marker.meta, ...patch } } }, { coalesce: `${coalesce}:${marker.id}` });
    const hasTrigger = hasAuthoredTrigger(marker.meta);
    const hasMaterial = hasMaterialAssignment(marker.meta);
    const hasGenerator = typeof marker.meta?.["assetId"] === "string" && getAssetGenerator(marker.meta["assetId"] as string) !== undefined;
    const hasKindParams = isSceneKind(marker.kind);
    const componentCards = (
      <>
        <ComponentAddBar
          target="marker"
          meta={marker.meta}
          onMeta={onMeta}
          api={api}
          selectionIds={[marker.id]}
        />
        {hasKindParams ? (
          <Section id="kindParams" title="Kind parameters" icon="settings" sections={sections}>
            <KindInspector object={markerObject(marker)} meta={marker.meta} onMeta={onMeta} />
          </Section>
        ) : null}
        {hasTrigger ? (
          <Section
            id="trigger"
            title="Trigger"
            icon="target"
            sections={sections}
            trailing={
              <SectionAction label="Remove trigger component" onClick={() => onMeta(clearTriggerInstallPatch(), "component:remove-trigger")}>
                remove
              </SectionAction>
            }
          >
            <TriggerInspector target="marker" meta={marker.meta} onMeta={onMeta} />
          </Section>
        ) : null}
        {hasMaterial ? (
          <Section
            id="material"
            title="Material"
            icon="sphere"
            sections={sections}
            trailing={
              <SectionAction label="Remove material assignment" onClick={() => onMeta(clearMaterialAssignmentPatch(), "component:remove-material")}>
                remove
              </SectionAction>
            }
          >
            <div className="text-[11px] text-neutral-300">
              materialId: <span className={NUMERIC}>{String(marker.meta?.["materialId"])}</span>
            </div>
          </Section>
        ) : null}
        {hasGenerator ? (
          <Section id="generator" title="Generator" icon="cube" sections={sections}>
            <GeneratorInspector meta={marker.meta} onMeta={onMeta} />
          </Section>
        ) : null}
        {!hasKindParams && !hasTrigger && !hasMaterial && !hasGenerator && !canAuthorTrigger("marker") ? (
          <EmptyState
            icon="settings"
            title="No components"
            description="This marker has no optional components. Games that register trigger actions enable Add trigger here."
          />
        ) : null}
      </>
    );
    body = (
      <div className="space-y-2 p-2.5">
        <ObjectHeader
          kind={marker.kind}
          id={marker.id}
          label={marker.label ?? ""}
          placeholder={marker.id}
          locked={isEditorObjectLocked(document, marker.id)}
          onLabel={(value) => session.dispatch({ type: "setMarker", id: marker.id, patch: { label: value } }, { coalesce: `label:${marker.id}` })}
        />
        {activeTab === "inspector" ? (
          <>
            <Section
              id="transform"
              title="Transform"
              icon="move"
              sections={sections}
              trailing={
                <SectionAction
                  label="Reset position to origin"
                  onClick={() => session.dispatch({ type: "setTransform", id: marker.id, position: { x: 0, y: 0, z: 0 } })}
                >
                  reset
                </SectionAction>
              }
            >
              <div className="space-y-1.5">
                <FieldRow label="Position">
                  {(["x", "y", "z"] as const).map((axis) => (
                    <AxisNumberField
                      key={axis}
                      axis={axis}
                      label={axis}
                      step={0.5}
                      value={marker.position[axis]}
                      onCommit={(value) =>
                        session.dispatch(
                          { type: "setTransform", id: marker.id, position: { ...marker.position, [axis]: value } },
                          { coalesce: `pos:${axis}:${marker.id}` },
                        )
                      }
                    />
                  ))}
                </FieldRow>
                <FieldRow label="Rotation">
                  <AxisNumberField
                    axis="y"
                    label="y°"
                    step={5}
                    precision={1}
                    value={Math.round((((marker.rotationY ?? 0) * 180) / Math.PI) * 10) / 10}
                    onCommit={(value) =>
                      session.dispatch(
                        { type: "setTransform", id: marker.id, rotationY: (value * Math.PI) / 180 },
                        { coalesce: `rot:${marker.id}` },
                      )
                    }
                  />
                </FieldRow>
              </div>
            </Section>
            <Section id="appearance" title="Appearance" icon="sphere" sections={sections}>
              <KindColorFields
                kind={marker.kind}
                color={marker.color}
                onKind={(kind) => session.dispatch({ type: "setMarker", id: marker.id, patch: { kind } }, { coalesce: `kind:${marker.id}` })}
                onColor={(color) => session.dispatch({ type: "setMarker", id: marker.id, patch: { color } }, { coalesce: `color:${marker.id}` })}
              />
            </Section>
            <Section id="placement" title="Placement" icon="pin" sections={sections}>
              <div className="space-y-2">
                <ClearanceField meta={marker.meta} onMeta={onMeta} />
                <ParentField session={session} id={marker.id} />
              </div>
            </Section>
            {marker.meta !== undefined ? (
              <Section id="meta" title="Raw metadata" icon="script" sections={sections}>
                <pre className="max-h-48 overflow-auto rounded-[5px] border border-white/[0.06] bg-black/40 p-2 text-[10px] text-neutral-400">
                  {JSON.stringify(marker.meta, null, 2)}
                </pre>
              </Section>
            ) : null}
          </>
        ) : (
          componentCards
        )}
      </div>
    );
  } else if (selectedVolume !== undefined) {
    const volume = selectedVolume;
    const onMeta = (patch: Record<string, unknown>, coalesce: string) =>
      session.dispatch({ type: "setVolume", id: volume.id, patch: { meta: { ...volume.meta, ...patch } } }, { coalesce: `${coalesce}:${volume.id}` });
    const setExtent = (axis: "x" | "y" | "z", value: number) => {
      const current = { x: volume.halfExtents?.x ?? 5, y: volume.halfExtents?.y ?? 5, z: volume.halfExtents?.z ?? 5 };
      const next = linkedExtents
        ? { x: Math.max(0.5, value), y: Math.max(0.5, value), z: Math.max(0.5, value) }
        : { ...current, [axis]: Math.max(0.5, value) };
      session.dispatch({ type: "setVolume", id: volume.id, patch: { halfExtents: next } }, { coalesce: `he:${linkedExtents ? "all" : axis}:${volume.id}` });
    };
    const hasTrigger = hasAuthoredTrigger(volume.meta);
    const hasMaterial = hasMaterialAssignment(volume.meta);
    const hasVegetation = readVegetationSettings(volume) !== null;
    const hasKindParams = isSceneKind(volume.kind);
    const componentCards = (
      <>
        <ComponentAddBar
          target="volume"
          meta={volume.meta}
          onMeta={onMeta}
          api={api}
          selectionIds={[volume.id]}
        />
        {hasKindParams ? (
          <Section id="kindParams" title="Kind parameters" icon="settings" sections={sections}>
            <KindInspector object={volumeObject(volume)} meta={volume.meta} onMeta={onMeta} />
          </Section>
        ) : null}
        {hasTrigger ? (
          <Section
            id="trigger"
            title="Trigger"
            icon="target"
            sections={sections}
            trailing={
              <SectionAction label="Remove trigger component" onClick={() => onMeta(clearTriggerInstallPatch(), "component:remove-trigger")}>
                remove
              </SectionAction>
            }
          >
            <TriggerInspector target="volume" meta={volume.meta} onMeta={onMeta} />
          </Section>
        ) : null}
        {hasMaterial ? (
          <Section
            id="material"
            title="Material"
            icon="sphere"
            sections={sections}
            trailing={
              <SectionAction label="Remove material assignment" onClick={() => onMeta(clearMaterialAssignmentPatch(), "component:remove-material")}>
                remove
              </SectionAction>
            }
          >
            <div className="text-[11px] text-neutral-300">
              materialId: <span className={NUMERIC}>{String(volume.meta?.["materialId"])}</span>
            </div>
          </Section>
        ) : null}
        {hasVegetation ? (
          <Section id="vegetation" title="Vegetation" icon="terrain" sections={sections}>
            <div className="mb-1.5 text-[10px] text-neutral-500">
              Owned by volume kind <span className={NUMERIC}>vegetation</span> — change kind in Inspector to remove.
            </div>
            <VegetationFields volume={volume} onMeta={onMeta} />
          </Section>
        ) : null}
        {!hasKindParams && !hasTrigger && !hasMaterial && !hasVegetation && !canAuthorTrigger("volume") ? (
          <EmptyState
            icon="settings"
            title="No components"
            description="This volume has no optional components. Games that register trigger actions enable Add trigger here."
          />
        ) : null}
      </>
    );
    body = (
      <div className="space-y-2 p-2.5">
        <ObjectHeader
          kind={volume.kind}
          id={volume.id}
          label={volume.label ?? ""}
          placeholder={volume.id}
          locked={isEditorObjectLocked(document, volume.id)}
          onLabel={(value) => session.dispatch({ type: "setVolume", id: volume.id, patch: { label: value } }, { coalesce: `label:${volume.id}` })}
        />
        {activeTab === "inspector" ? (
          <>
            <Section
              id="transform"
              title="Transform"
              icon="move"
              sections={sections}
              trailing={
                volume.shape === "box" ? (
                  <SectionAction label={linkedExtents ? "Unlink extents" : "Link extents (uniform)"} active={linkedExtents} onClick={() => setLinkedExtents((value) => !value)}>
                    link
                  </SectionAction>
                ) : undefined
              }
            >
              <div className="space-y-1.5">
                <FieldRow label="Center">
                  {(["x", "y", "z"] as const).map((axis) => (
                    <AxisNumberField
                      key={axis}
                      axis={axis}
                      label={axis}
                      step={0.5}
                      value={volume.center[axis]}
                      onCommit={(value) =>
                        session.dispatch(
                          { type: "setVolume", id: volume.id, patch: { center: { ...volume.center, [axis]: value } } },
                          { coalesce: `center:${axis}:${volume.id}` },
                        )
                      }
                    />
                  ))}
                </FieldRow>
                {volume.shape !== "box" ? (
                  <FieldRow label="Radius">
                    <AxisNumberField
                      label="r"
                      step={0.5}
                      value={volume.radius ?? 5}
                      onCommit={(value) => session.dispatch({ type: "setVolume", id: volume.id, patch: { radius: Math.max(0.5, value) } }, { coalesce: `radius:${volume.id}` })}
                    />
                  </FieldRow>
                ) : null}
                {volume.shape === "cylinder" ? (
                  <FieldRow label="Height">
                    <AxisNumberField
                      label="h"
                      step={0.5}
                      value={volume.height ?? 4}
                      onCommit={(value) => session.dispatch({ type: "setVolume", id: volume.id, patch: { height: Math.max(0.5, value) } }, { coalesce: `height:${volume.id}` })}
                    />
                  </FieldRow>
                ) : null}
                {volume.shape === "box" ? (
                  <FieldRow label="Extents">
                    {(["x", "y", "z"] as const).map((axis) => (
                      <AxisNumberField
                        key={axis}
                        axis={axis}
                        label={axis}
                        step={0.5}
                        value={volume.halfExtents?.[axis] ?? 5}
                        onCommit={(value) => setExtent(axis, value)}
                      />
                    ))}
                  </FieldRow>
                ) : null}
              </div>
            </Section>
            <Section id="appearance" title="Appearance" icon="sphere" sections={sections}>
              <KindColorFields
                kind={volume.kind}
                color={volume.color}
                onKind={(kind) => session.dispatch({ type: "setVolume", id: volume.id, patch: { kind } }, { coalesce: `kind:${volume.id}` })}
                onColor={(color) => session.dispatch({ type: "setVolume", id: volume.id, patch: { color } }, { coalesce: `color:${volume.id}` })}
              />
            </Section>
            <Section id="placement" title="Placement" icon="pin" sections={sections}>
              <div className="space-y-2">
                <ClearanceField meta={volume.meta} onMeta={onMeta} />
                <ParentField session={session} id={volume.id} />
              </div>
            </Section>
          </>
        ) : (
          componentCards
        )}
      </div>
    );
  } else if (selectedPath !== undefined) {
    const path = selectedPath;
    const onMeta = (patch: Record<string, unknown>, coalesce: string) =>
      session.dispatch({ type: "setPath", id: path.id, patch: { meta: { ...path.meta, ...patch } } }, { coalesce: `${coalesce}:${path.id}` });
    body = (
      <div className="space-y-2 p-2.5">
        <ObjectHeader
          kind={path.kind}
          id={path.id}
          label={path.label ?? ""}
          placeholder={path.id}
          locked={isEditorObjectLocked(document, path.id)}
          onLabel={(value) => session.dispatch({ type: "setPath", id: path.id, patch: { label: value } }, { coalesce: `label:${path.id}` })}
        />
        {activeTab === "inspector" ? (
          <>
            <Section id="path" title="Path" icon="spline" sections={sections}>
              <div className="space-y-1.5">
                <FieldRow label="Width">
                  <AxisNumberField
                    label="w"
                    step={0.5}
                    value={path.width ?? 4}
                    onCommit={(value) => session.dispatch({ type: "setPath", id: path.id, patch: { width: Math.max(0.5, value) } }, { coalesce: `width:${path.id}` })}
                  />
                </FieldRow>
                <div className={`text-[10px] text-neutral-500 ${NUMERIC}`}>{path.points.length} points</div>
                {pathPoint !== null && pathPoint.pathId === path.id ? (
                  <div className="space-y-1.5 rounded-[5px] border border-white/[0.06] bg-black/20 p-2">
                    <div className={`text-[10px] text-neutral-400 ${NUMERIC}`}>Point {pathPoint.index + 1}/{path.points.length}</div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        className={`flex-1 rounded-[5px] border border-white/[0.07] bg-[#191d24] px-2 py-1 text-[10px] text-neutral-200 transition-colors hover:bg-[#1f242d] ${FOCUS_RING}`}
                        onClick={() => {
                          const at = pathPoint.index;
                          const points = [...path.points.slice(0, at + 1), { ...path.points[at]! }, ...path.points.slice(at + 1)];
                          session.dispatch({ type: "setPath", id: path.id, patch: { points } });
                        }}
                      >
                        Insert point
                      </button>
                      <button
                        type="button"
                        className={`flex-1 rounded-[5px] border border-rose-400/25 bg-rose-500/15 px-2 py-1 text-[10px] text-rose-200 transition-colors hover:bg-rose-500/25 disabled:opacity-40 ${FOCUS_RING}`}
                        disabled={path.points.length <= 2}
                        onClick={() => {
                          const points = path.points.filter((_, index) => index !== pathPoint.index);
                          ui.patch({ pathPoint: null });
                          session.dispatch({ type: "setPath", id: path.id, patch: { points } });
                        }}
                      >
                        Delete point
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-neutral-600">Click a vertex sphere in the viewport to edit points.</div>
                )}
              </div>
            </Section>
            <Section id="appearance" title="Appearance" icon="sphere" sections={sections}>
              <KindColorFields
                kind={path.kind}
                color={path.color}
                onKind={(kind) => session.dispatch({ type: "setPath", id: path.id, patch: { kind } }, { coalesce: `kind:${path.id}` })}
                onColor={(color) => session.dispatch({ type: "setPath", id: path.id, patch: { color } }, { coalesce: `color:${path.id}` })}
              />
            </Section>
            <Section id="placement" title="Placement" icon="pin" sections={sections}>
              <ParentField session={session} id={path.id} />
            </Section>
          </>
        ) : isSceneKind(path.kind) ? (
          <Section id="kindParams" title="Kind parameters" icon="settings" sections={sections}>
            <KindInspector object={pathObject(path)} meta={path.meta} onMeta={onMeta} />
          </Section>
        ) : (
          <EmptyState icon="settings" title="No components" description="This path's kind registers no parameter schema." />
        )}
      </div>
    );
  } else if (selectedNote !== undefined) {
    const note = selectedNote;
    body = (
      <div className="space-y-2 p-2.5">
        <ObjectHeader kind="note" id={note.id} label={note.text.slice(0, 32)} placeholder={note.id} locked={false} />
        <Section id="note" title="Note" icon="note" sections={sections}>
          <textarea
            className={`h-24 w-full p-2 ${INPUT_CLS}`}
            value={note.text}
            aria-label="Note text"
            onChange={(event) => session.dispatch({ type: "setNote", id: note.id, patch: { text: event.target.value } }, { coalesce: `text:${note.id}` })}
          />
        </Section>
        <Section id="transform" title="Transform" icon="move" sections={sections}>
          <FieldRow label="Position">
            {(["x", "y", "z"] as const).map((axis) => (
              <AxisNumberField
                key={axis}
                axis={axis}
                label={axis}
                step={0.5}
                value={note.position[axis]}
                onCommit={(value) =>
                  session.dispatch(
                    { type: "setNote", id: note.id, patch: { position: { ...note.position, [axis]: value } } },
                    { coalesce: `npos:${axis}:${note.id}` },
                  )
                }
              />
            ))}
          </FieldRow>
        </Section>
      </div>
    );
  } else if (liveEntity !== null) {
    body = (
      <div className="space-y-2 p-2.5">
        <ObjectHeader kind={liveEntity.role} id={liveEntity.id} label={liveEntity.name} placeholder={liveEntity.id} locked={false} />
        <Section id="live" title="Live entity" icon="walk" sections={sections}>
          <div className={`space-y-1 text-[11px] text-neutral-400 ${NUMERIC}`}>
            <div>x {liveEntity.position[0].toFixed(1)} · y {liveEntity.position[1].toFixed(1)} · z {liveEntity.position[2].toFixed(1)}</div>
            <div className="text-[10px] text-neutral-600">Read-only live world object — edit its source data to move it permanently.</div>
          </div>
        </Section>
      </div>
    );
  } else if (liveObject !== null) {
    body = (
      <div className="space-y-2 p-2.5">
        <ObjectHeader kind="prop" id={liveObject.instanceId} label={liveObject.catalogId} placeholder={liveObject.instanceId} locked={false} />
        <Section id="live" title="Live object" icon="cube" sections={sections}>
          <div className={`space-y-1 text-[11px] text-neutral-400 ${NUMERIC}`}>
            <div>x {liveObject.position[0].toFixed(1)} · y {liveObject.position[1].toFixed(1)} · z {liveObject.position[2].toFixed(1)}</div>
            <div className="text-[10px] text-neutral-600">Read-only live world object — edit its source data to move it permanently.</div>
          </div>
        </Section>
      </div>
    );
  } else {
    body = (
      <EmptyState
        icon="cursor"
        title="Nothing selected"
        description="Click an object in the viewport or hierarchy to inspect it, or use Add to place new content."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelTabs
        ariaLabel="Inspector tabs"
        active={activeTab}
        onSelect={selectTab}
        tabs={[
          { id: "inspector", label: "Inspector" },
          { id: "components", label: "Components" },
          { id: "materials", label: "Materials" },
        ]}
        trailing={onClose !== undefined ? <IconButton icon="close" label="Close inspector" size={12} tone="ghost" onClick={onClose} /> : undefined}
      />
      <div className="min-h-0 flex-1 overflow-auto">{body}</div>
    </div>
  );
}
