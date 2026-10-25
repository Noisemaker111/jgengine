import { Check, Loader2 } from "lucide-react";

import { BuilderIcon } from "@/dev/builder/components/builderIcons";
import { BUILDER_CSS } from "@/dev/builder/components/builderStyles";
import { MaterialPalette } from "@/dev/builder/components/MaterialPalette";
import { PlaceToolHints, PlaceToolPanel } from "@/dev/builder/components/PlaceToolPanel";
import { SelectionInspector } from "@/dev/builder/components/SelectionInspector";
import {
  BuilderStore,
  type BuilderTool,
  useBuilderState,
} from "@/dev/builder/builderStore";
import { isCatalogBuilderCategory } from "@/dev/builder/builderPlaceableCatalog";
import { cn } from "@/components/ui/cn";

const TABS = [
  { id: "tool", label: "Tool" },
  { id: "scene", label: "Scene" },
  { id: "save", label: "Save" },
] as const;

const TOOL_TITLES: Record<BuilderTool, string> = {
  select: "Select & move",
  wall: "Draw wall",
  primitive: "Place object",
  material: "Paint material",
  delete: "Delete",
  stamp: "Place copies",
};

export function PropertiesPanel() {
  const state = useBuilderState();
  const tab = state.propertiesTab;
  const panelTitle = TOOL_TITLES[state.tool];

  return (
    <aside className={BUILDER_CSS.propsShell} aria-label="Builder properties">
      <header className={BUILDER_CSS.propsHeader}>
        <div className="grid gap-0.5">
          <span className={BUILDER_CSS.propsTitle}>{panelTitle}</span>
          <span className="font-mono text-[10px] text-[var(--brand-cream-dim)]">
            {isCatalogBuilderCategory(state.itemType)
              ? `${state.selectedRefs.length} selected · tool ${state.tool}`
              : `${state.mapData.mapId} · ${state.mapData.environment.floor.width}×${state.mapData.environment.floor.depth}`}
          </span>
        </div>
      </header>

      <div className={BUILDER_CSS.tabRow} role="tablist">
        {TABS.map((candidate) => {
          const active = candidate.id === tab;
          return (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={cn(BUILDER_CSS.tab, active && BUILDER_CSS.tabActive)}
              onClick={() => BuilderStore.setPropertiesTab(candidate.id)}
            >
              {candidate.label}
            </button>
          );
        })}
      </div>

      <div className={BUILDER_CSS.propsBody}>
        {tab === "tool" ? <ToolTab /> : null}
        {tab === "scene" ? <SceneTab /> : null}
        {tab === "save" ? <SaveTab /> : null}
      </div>
    </aside>
  );
}

function ToolTab() {
  const state = useBuilderState();

  if (state.tool === "stamp" && state.activePlacement) {
    return (
      <section className={BUILDER_CSS.propsSection}>
        <p className={BUILDER_CSS.propsSectionLabel}>Placing</p>
        <p className={BUILDER_CSS.hintBox}>
          Armed {state.activePlacement.label}. Click the floor for each copy, or press{" "}
          <kbd className="rounded bg-black/40 px-1 font-mono text-[10px]">Esc</kbd> to stop.
        </p>
      </section>
    );
  }

  return (
    <>
      {state.tool === "primitive" ? <PlaceToolPanel /> : null}
      {state.tool === "material" ? <MaterialPalette /> : null}
      {state.tool === "wall" ? <WallHints /> : null}
      {state.tool === "delete" ? <DeleteHints /> : null}
      {state.tool === "select" ? <SelectionInspector /> : null}
      {state.tool === "primitive" ? <PlaceToolHints /> : null}
      {state.tool !== "primitive" && state.tool !== "stamp" ? <ToolHint tool={state.tool} /> : null}
    </>
  );
}

function ToolHint({ tool }: { tool: BuilderTool }) {
  const hints: Record<BuilderTool, string> = {
    select: "Click any object to select it, then drag in the world or use the move pad. Hold Shift to add to the selection. The colored arrows resize.",
    wall: "Click one floor point, then click another — a wall is drawn between them, snapped to the grid. Press Esc to cancel an in-progress wall.",
    primitive: "Pick a source and shape on this panel, then click the floor to place.",
    material: "Click a part to paint it with the active material. Use Floor / Walls buttons to paint by surface.",
    delete: "Click any object to remove it. Or hit Delete while something is selected.",
    stamp: "Click the floor to place another copy of the armed item. Press Esc when finished.",
  };
  return (
    <section className={BUILDER_CSS.propsSection}>
      <p className={BUILDER_CSS.hintBox}>{hints[tool]}</p>
    </section>
  );
}

function WallHints() {
  return (
    <>
      <section className={BUILDER_CSS.propsSection}>
        <p className={BUILDER_CSS.propsSectionLabel}>How to draw</p>
        <p className={BUILDER_CSS.hintBox}>
          1. Click the floor at the wall's start. A teal preview extends from that point.
          <br />2. Click the floor at the wall's end. The wall is placed and selected.
        </p>
      </section>
      <ToolHint tool="wall" />
    </>
  );
}

function DeleteHints() {
  return (
    <>
      <section className={BUILDER_CSS.propsSection}>
        <p className={BUILDER_CSS.propsSectionLabel}>Delete</p>
        <p className={BUILDER_CSS.hintBox}>
          Click any object in the scene to remove it. Or press <kbd className="rounded bg-black/40 px-1 font-mono text-[10px]">Del</kbd> while something is selected.
        </p>
      </section>
      <ToolHint tool="delete" />
    </>
  );
}

function SceneTab() {
  const state = useBuilderState();
  const room = state.roomDraft;

  return (
    <>
      <section className={BUILDER_CSS.propsSection}>
        <p className={BUILDER_CSS.propsSectionLabel}>Room</p>
        <div className="grid grid-cols-2 gap-1.5">
          <NumberCell
            label="Width"
            value={room.width}
            onChange={(value) => BuilderStore.updateRoomDraft({ width: value, template: "custom" })}
          />
          <NumberCell
            label="Depth"
            value={room.depth}
            onChange={(value) => BuilderStore.updateRoomDraft({ depth: value, template: "custom" })}
          />
          <NumberCell
            label="Wall H"
            value={room.wallHeight}
            onChange={(value) => BuilderStore.updateRoomDraft({ wallHeight: value, template: "custom" })}
          />
          <NumberCell
            label="Wall T"
            value={room.wallThickness}
            step={0.01}
            onChange={(value) => BuilderStore.updateRoomDraft({ wallThickness: value, template: "custom" })}
          />
        </div>
        <button
          type="button"
          className={cn(BUILDER_CSS.primaryButton, "mt-2 w-full")}
          onClick={() => BuilderStore.startNewRoom()}
        >
          <BuilderIcon id="generate-ai" size="sm" />
          Rebuild room from draft
        </button>
      </section>

    </>
  );
}

function SaveTab() {
  const state = useBuilderState();
  const { groupDraft, assetSaveStatus, assetSaveError, lastExport } = state;
  const canSave = groupDraft.label.trim().length > 0;
  const isSource = state.editingLibraryEntryId !== null;

  return (
    <>
      <section className={BUILDER_CSS.propsSection}>
        <p className={BUILDER_CSS.propsSectionLabel}>Asset details</p>
        <div className="grid gap-2">
          <label className="grid gap-1">
            <span className={BUILDER_CSS.inlineLabel}>Slug</span>
            <input
              className={BUILDER_CSS.fieldNumber}
              value={groupDraft.slug}
              onChange={(event) => BuilderStore.updateGroupDraft({ slug: event.target.value })}
            />
          </label>
          <label className="grid gap-1">
            <span className={BUILDER_CSS.inlineLabel}>Label</span>
            <input
              className={BUILDER_CSS.fieldNumber}
              value={groupDraft.label}
              onChange={(event) => BuilderStore.updateGroupDraft({ label: event.target.value })}
            />
          </label>
          <label className="grid gap-1">
            <span className={BUILDER_CSS.inlineLabel}>Tags</span>
            <input
              className={BUILDER_CSS.fieldNumber}
              value={groupDraft.tags}
              placeholder="garage, place, exterior"
              onChange={(event) => BuilderStore.updateGroupDraft({ tags: event.target.value })}
            />
          </label>
          <label className="grid gap-1">
            <span className={BUILDER_CSS.inlineLabel}>Prompt</span>
            <textarea
              className="game-input min-h-16 px-2 py-1.5 text-[12px] leading-snug"
              value={groupDraft.prompt}
              onChange={(event) => BuilderStore.updateGroupDraft({ prompt: event.target.value })}
            />
          </label>
        </div>
      </section>

      <section className={BUILDER_CSS.propsSection}>
        <p className={BUILDER_CSS.propsSectionLabel}>Save</p>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            className={BUILDER_CSS.defaultButton}
            disabled={!canSave}
            onClick={() => BuilderStore.saveToLibrary("selection")}
          >
            <BuilderIcon id="save" size="sm" />
            Selection
          </button>
          <button
            type="button"
            className={BUILDER_CSS.defaultButton}
            disabled={!canSave}
            onClick={() => BuilderStore.saveToLibrary("scene")}
          >
            <BuilderIcon id="save" size="sm" />
            Whole scene
          </button>
          <button
            type="button"
            className={cn(BUILDER_CSS.primaryButton, "col-span-2")}
            disabled={assetSaveStatus === "saving"}
            onClick={() => void BuilderStore.saveCurrentAsset()}
          >
            {assetSaveStatus === "saving" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                {isSource ? "Save to source" : "Save asset"}
              </>
            )}
          </button>
        </div>
        {assetSaveStatus === "error" && assetSaveError ? (
          <p className={cn(BUILDER_CSS.errorBox, "mt-2")}>{assetSaveError}</p>
        ) : null}
        {assetSaveStatus === "saved" ? (
          <p className="mt-2 text-[11px] text-[var(--brand-teal)]">Saved.</p>
        ) : null}
      </section>

      <section className={BUILDER_CSS.propsSection}>
        <p className={BUILDER_CSS.propsSectionLabel}>Export snippets</p>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            className={BUILDER_CSS.defaultButton}
            onClick={() => BuilderStore.promoteSelectionToCatalog()}
          >
            <BuilderIcon id="generate-ai" size="sm" />
            Catalog snippet
          </button>
          <button
            type="button"
            className={BUILDER_CSS.defaultButton}
            onClick={() => BuilderStore.copySelectionJson()}
          >
            <BuilderIcon id="copy" size="sm" />
            Selection JSON
          </button>
          <button
            type="button"
            className={BUILDER_CSS.defaultButton}
            onClick={() => BuilderStore.copyMapJson()}
          >
            <BuilderIcon id="copy" size="sm" />
            Map JSON
          </button>
          <button
            type="button"
            className={BUILDER_CSS.defaultButton}
            onClick={() => BuilderStore.copyWorldBuilderSnippet()}
          >
            <BuilderIcon id="copy" size="sm" />
            Builder snippet
          </button>
        </div>
        {lastExport ? (
          <pre className={cn(BUILDER_CSS.monacoReadout, "mt-2")}>{lastExport}</pre>
        ) : null}
      </section>
    </>
  );
}

interface NumberCellProps {
  label: string;
  value: number;
  step?: number;
  onChange: (value: number) => void;
}

function NumberCell({ label, value, step = 0.1, onChange }: NumberCellProps) {
  return (
    <label className="grid gap-1">
      <span className={BUILDER_CSS.inlineLabel}>{label}</span>
      <input
        className={BUILDER_CSS.fieldNumber}
        type="number"
        step={step}
        value={value}
        onChange={(event) => {
          const next = Number.parseFloat(event.target.value);
          if (!Number.isNaN(next)) onChange(next);
        }}
      />
    </label>
  );
}
