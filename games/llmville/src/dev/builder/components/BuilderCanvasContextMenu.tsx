import { Maximize2, PaintBucket } from "lucide-react";

import { BuilderIcon } from "@/dev/builder/components/builderIcons";
import {
  BuilderStore,
  type BuilderSelectionRef,
  useBuilderState,
} from "@/dev/builder/builderStore";
import { selectionRefLabel, selectionRefKey } from "@/dev/builder/components/Viewport";
import { cn } from "@/components/ui/cn";

export interface BuilderCanvasContextMenuState {
  x: number;
  y: number;
  ref: BuilderSelectionRef | null;
}

export function BuilderCanvasContextMenu({
  menu,
  copyAfter,
  onClose,
}: {
  menu: BuilderCanvasContextMenuState;
  copyAfter: (action: () => void) => void;
  onClose: () => void;
}) {
  const state = useBuilderState();
  const hasSelection = state.selectedRefs.length > 0;
  const canUngroup = state.selectedRefs.length === 1 && state.selectedRefs[0]?.kind === "decor";
  const refInSelection = menu.ref
    ? state.selectedRefs.some((candidate) => selectionRefKey(candidate) === selectionRefKey(menu.ref as BuilderSelectionRef))
    : false;
  const runAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      className="fixed z-50 w-56 rounded-md border border-[var(--surface-border)] bg-[var(--surface-strong)] p-1 text-[12px] text-[var(--brand-cream)] shadow-2xl backdrop-blur"
      style={{ left: menu.x, top: menu.y }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="border-b border-[var(--surface-border)] px-2 py-1.5 font-game text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--brand-cream-dim)]">
        {menu.ref ? selectionRefLabel(menu.ref) : "Workbench"}
      </div>
      {menu.ref ? (
        <>
          <MenuButton
            onClick={() => runAction(() => BuilderStore.selectRef(menu.ref as BuilderSelectionRef, false))}
            label="Select only"
          />
          <MenuButton
            onClick={() => runAction(() => BuilderStore.selectRef(menu.ref as BuilderSelectionRef, true))}
            label={refInSelection ? "Remove from selection" : "Add to selection"}
            disabled={refInSelection && state.selectedRefs.length === 1}
          />
        </>
      ) : null}
      <MenuButton
        disabled={!hasSelection}
        onClick={() => runAction(() => BuilderStore.duplicateSelection())}
        icon={<BuilderIcon id="copy" size="sm" />}
        label="Duplicate selection"
      />
      <MenuButton
        disabled={!hasSelection}
        onClick={() => runAction(() => BuilderStore.applyMaterialToSelection())}
        icon={<PaintBucket className="h-3.5 w-3.5" />}
        label="Paint with active material"
      />
      <MenuButton
        disabled={!hasSelection}
        onClick={() => runAction(() => BuilderStore.rotateSelection90())}
        label="Rotate 90°"
      />
      <MenuButton
        disabled={!hasSelection}
        onClick={() => runAction(() => BuilderStore.fitSelectionToFloor())}
        icon={<Maximize2 className="h-3.5 w-3.5" />}
        label="Fit to floor"
      />
      <MenuButton
        disabled={!hasSelection}
        onClick={() => runAction(() => BuilderStore.glueSelection())}
        icon={<BuilderIcon id="group" size="sm" />}
        label="Glue selection"
      />
      <MenuButton
        disabled={!canUngroup}
        onClick={() => runAction(() => BuilderStore.ungroupSelection())}
        icon={<BuilderIcon id="ungroup" size="sm" />}
        label="Ungroup"
      />
      <MenuButton
        disabled={!hasSelection}
        onClick={() => runAction(() => BuilderStore.saveToLibrary("selection"))}
        label="Save selection to library"
      />
      <MenuButton
        onClick={() => runAction(() => BuilderStore.saveToLibrary("scene"))}
        label="Save whole scene"
      />
      <MenuButton
        disabled={!hasSelection}
        onClick={() => runAction(() => BuilderStore.promoteSelectionToCatalog())}
        label="Promote to catalog"
      />
      <MenuButton
        disabled={!hasSelection}
        onClick={() => runAction(() => copyAfter(() => BuilderStore.copySelectionJson()))}
        icon={<BuilderIcon id="copy" size="sm" />}
        label="Copy selection JSON"
      />
      <div className="my-1 border-t border-[var(--surface-border)]" />
      <MenuButton
        disabled={!hasSelection}
        onClick={() => runAction(() => BuilderStore.deleteSelected())}
        icon={<BuilderIcon id="delete" size="sm" />}
        label="Delete selection"
        danger
      />
    </div>
  );
}

function MenuButton({
  disabled,
  onClick,
  label,
  icon,
  danger,
}: {
  disabled?: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition",
        disabled
          ? "text-[var(--brand-cream-dim)]/40"
          : danger
            ? "text-[#f0a097] hover:bg-[var(--destructive)]/15"
            : "text-[var(--brand-cream)] hover:bg-[var(--brand-teal)]/12 hover:text-[var(--brand-teal)]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

