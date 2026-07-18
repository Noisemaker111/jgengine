/** @internal Movement below this (px) counts as a click; above is a camera drag (#866). */
export const RIGHT_CLICK_SLOP_PX = 4;

/** @internal True when the pointer released within the drag-vs-click threshold of its down position. */
export function isPointerClick(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  thresholdPx: number = RIGHT_CLICK_SLOP_PX,
): boolean {
  return Math.hypot(endX - startX, endY - startY) <= thresholdPx;
}

/** @internal One entry in the editor viewport context menu. */
export type EditorContextActionId =
  | "frame"
  | "frameAll"
  | "duplicate"
  | "delete"
  | "createPrefab"
  | "parentTo"
  | "unparent"
  | "copy"
  | "paste"
  | "addMarker"
  | "addVolume"
  | "addPath"
  | "addNote"
  | "openAssets";

/** @internal Label + id for one editor context-menu verb. */
export interface EditorContextAction {
  id: EditorContextActionId;
  label: string;
  disabled?: boolean;
  separatorBefore?: boolean;
}

/** @internal Inputs for {@link buildEditorContextMenu}. */
export interface BuildEditorContextMenuInput {
  hitId: string | null;
  selection: readonly string[];
  canPaste: boolean;
  /** True when at least one selected/hit object has a parent (offers Unparent). */
  canUnparent?: boolean;
}

/**
 * @internal Selection-aware editor context verbs (#866). Hit/selection → frame/duplicate/delete/copy/prefab;
 * empty ground → place tools + paste when clipboard has content. Shared by viewport and hierarchy rows.
 */
export function buildEditorContextMenu(input: BuildEditorContextMenuInput): readonly EditorContextAction[] {
  const hasSelection = input.selection.length > 0 || input.hitId !== null;
  if (hasSelection) {
    return [
      { id: "frame", label: "Frame" },
      { id: "duplicate", label: "Duplicate" },
      { id: "copy", label: "Copy" },
      { id: "delete", label: "Delete", separatorBefore: true },
      { id: "createPrefab", label: "Create prefab…", separatorBefore: true },
      { id: "parentTo", label: "Parent to…", separatorBefore: true },
      ...(input.canUnparent === true
        ? ([{ id: "unparent", label: "Unparent" }] as const satisfies readonly EditorContextAction[])
        : []),
      { id: "paste", label: "Paste", disabled: !input.canPaste, separatorBefore: true },
    ];
  }
  return [
    { id: "paste", label: "Paste", disabled: !input.canPaste },
    { id: "addMarker", label: "Add marker", separatorBefore: true },
    { id: "addVolume", label: "Add volume (zone)" },
    { id: "addPath", label: "Draw path" },
    { id: "addNote", label: "Add note" },
    { id: "openAssets", label: "Place asset…", separatorBefore: true },
    { id: "frameAll", label: "Frame all", separatorBefore: true },
  ];
}
