import type { ParamSchema } from "../scene/sceneKinds";
import type { HudAnchor, HudPlacement, HudSize } from "./hudLayout";
import { isHudAnchor } from "./hudLayout";

/**
 * Which axes a panel type may grow when resized in canvas mode. Resize is semantic —
 * content reflows (longer track, more rows) — never a CSS scale of the whole panel.
 */
export type HudResizeAxes = "none" | "x" | "y" | "both";

/** Authored layout for one HUD panel inside `editor.scene.json` → `ui.panels`. */
export interface EditorUiPanelLayout {
  anchor: HudAnchor;
  dx: number;
  dy: number;
  width?: number;
  height?: number;
  visible?: boolean;
  /** Panel type id registered via {@link registerHudPanelType}; drives resize + schema. */
  type?: string;
}

/** Scene-document HUD section: panel id → layout. Single source of truth for placement. */
export interface EditorUiDocument {
  panels: Record<string, EditorUiPanelLayout>;
}

/** TSX-declared fallback when the document has no entry for a panel. */
export interface HudPanelFallback {
  anchor: HudAnchor;
  inset?: { x: number; y: number };
  width?: number;
  height?: number;
  visible?: boolean;
  type?: string;
}

/** Fully resolved panel layout after document + fallback merge. */
export interface ResolvedHudPanelLayout {
  placement: HudPlacement;
  width?: number;
  height?: number;
  visible: boolean;
  type?: string;
  /** True when the document owned at least one field (not pure TSX fallback). */
  fromDocument: boolean;
}

/** Declared panel type: growable axes, size limits, optional ParamSchema for the editor. */
export interface HudPanelTypeDef {
  id: string;
  label: string;
  resize: HudResizeAxes;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  defaultWidth?: number;
  defaultHeight?: number;
  schema?: ParamSchema;
}

const panelTypes = new Map<string, HudPanelTypeDef>();

/** Register a HUD panel type so the editor can list/add/configure it and canvas resize knows axes. */
export function registerHudPanelType(def: HudPanelTypeDef): void {
  panelTypes.set(def.id, def);
}

/** @internal Look up a registered panel type by id. */
export function getHudPanelType(id: string): HudPanelTypeDef | undefined {
  return panelTypes.get(id);
}

/** Every registered panel type, sorted by id — editor palette / agent listing. */
export function listHudPanelTypes(): HudPanelTypeDef[] {
  return [...panelTypes.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** @internal Test seam — clear the registry between tests. */
export function clearHudPanelTypes(): void {
  panelTypes.clear();
}

/** @internal Convert a document panel layout into a runtime placement. */
export function placementFromUiPanel(panel: EditorUiPanelLayout): HudPlacement {
  return { anchor: panel.anchor, dx: panel.dx, dy: panel.dy };
}

/** @internal Build a document panel layout from a runtime placement plus optional size/visibility. */
export function uiPanelFromPlacement(
  placement: HudPlacement,
  options?: {
    width?: number;
    height?: number;
    visible?: boolean;
    type?: string;
  },
): EditorUiPanelLayout {
  const panel: EditorUiPanelLayout = {
    anchor: placement.anchor,
    dx: placement.dx,
    dy: placement.dy,
  };
  if (options?.width !== undefined) panel.width = options.width;
  if (options?.height !== undefined) panel.height = options.height;
  if (options?.visible !== undefined) panel.visible = options.visible;
  if (options?.type !== undefined) panel.type = options.type;
  return panel;
}

function fallbackPlacement(fallback: HudPanelFallback): HudPlacement {
  const inset = fallback.inset ?? { x: 16, y: 16 };
  const { anchor } = fallback;
  const edgeX = anchor.endsWith("right") || anchor === "right";
  const edgeY = anchor.startsWith("bottom") || anchor === "bottom";
  return {
    anchor,
    dx: edgeX ? -inset.x : inset.x,
    dy: edgeY ? -inset.y : inset.y,
  };
}

/**
 * Resolve a panel's layout: document entry wins field-by-field over TSX fallback.
 * TSX props are fallback-only — the scene document is the source of truth once authored.
 */
export function resolveHudPanelLayout(
  docPanel: EditorUiPanelLayout | undefined,
  fallback: HudPanelFallback,
): ResolvedHudPanelLayout {
  if (docPanel === undefined) {
    return {
      placement: fallbackPlacement(fallback),
      width: fallback.width,
      height: fallback.height,
      visible: fallback.visible !== false,
      type: fallback.type,
      fromDocument: false,
    };
  }
  return {
    placement: placementFromUiPanel(docPanel),
    width: docPanel.width ?? fallback.width,
    height: docPanel.height ?? fallback.height,
    visible: docPanel.visible ?? fallback.visible !== false,
    type: docPanel.type ?? fallback.type,
    fromDocument: true,
  };
}

/** @internal Read a panel layout from a document ui section, or undefined when absent. */
export function findUiPanel(
  ui: EditorUiDocument | undefined,
  id: string,
): EditorUiPanelLayout | undefined {
  return ui?.panels[id];
}

/** @internal Immutable patch of one panel into a ui section (creates the section when missing). */
export function patchUiPanel(
  ui: EditorUiDocument | undefined,
  id: string,
  patch: Partial<EditorUiPanelLayout>,
): EditorUiDocument {
  const existing = ui?.panels[id];
  const base: EditorUiPanelLayout =
    existing !== undefined
      ? { ...existing }
      : {
          anchor: isHudAnchor(patch.anchor) ? patch.anchor : "top-left",
          dx: typeof patch.dx === "number" ? patch.dx : 0,
          dy: typeof patch.dy === "number" ? patch.dy : 0,
        };
  const next: EditorUiPanelLayout = { ...base };
  if (patch.anchor !== undefined && isHudAnchor(patch.anchor)) next.anchor = patch.anchor;
  if (typeof patch.dx === "number" && Number.isFinite(patch.dx)) next.dx = patch.dx;
  if (typeof patch.dy === "number" && Number.isFinite(patch.dy)) next.dy = patch.dy;
  if (typeof patch.width === "number" && Number.isFinite(patch.width)) next.width = patch.width;
  if (typeof patch.height === "number" && Number.isFinite(patch.height)) next.height = patch.height;
  if (typeof patch.visible === "boolean") next.visible = patch.visible;
  if (typeof patch.type === "string") next.type = patch.type;
  return {
    panels: {
      ...(ui?.panels ?? {}),
      [id]: next,
    },
  };
}

/** @internal Remove a panel entry from the ui section; returns undefined when the section empties. */
export function removeUiPanel(
  ui: EditorUiDocument | undefined,
  id: string,
): EditorUiDocument | undefined {
  if (ui === undefined || ui.panels[id] === undefined) return ui;
  const panels = { ...ui.panels };
  delete panels[id];
  return Object.keys(panels).length === 0 ? undefined : { panels };
}

/**
 * Semantic resize: apply pixel deltas only on growable axes, clamped to min/max.
 * Never scales content — callers reflow layout size (track length, list rows).
 */
export function resizePanelSize(
  current: HudSize,
  delta: { dw: number; dh: number },
  axes: HudResizeAxes,
  limits?: {
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
  },
): HudSize {
  if (axes === "none") return { ...current };
  let width = current.width;
  let height = current.height;
  if (axes === "x" || axes === "both") width = current.width + delta.dw;
  if (axes === "y" || axes === "both") height = current.height + delta.dh;
  const minW = limits?.minWidth ?? 1;
  const minH = limits?.minHeight ?? 1;
  const maxW = limits?.maxWidth ?? Number.POSITIVE_INFINITY;
  const maxH = limits?.maxHeight ?? Number.POSITIVE_INFINITY;
  return {
    width: Math.max(minW, Math.min(maxW, Math.round(width))),
    height: Math.max(minH, Math.min(maxH, Math.round(height))),
  };
}

/** @internal Resolve resize axes + limits for a panel type id (defaults to none when unregistered). */
export function resolvePanelResize(typeId: string | undefined): {
  axes: HudResizeAxes;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
} {
  if (typeId === undefined) return { axes: "none" };
  const def = panelTypes.get(typeId);
  if (def === undefined) return { axes: "none" };
  return {
    axes: def.resize,
    minWidth: def.minWidth,
    maxWidth: def.maxWidth,
    minHeight: def.minHeight,
    maxHeight: def.maxHeight,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** @internal Decode a single panel layout from untrusted JSON; null when invalid. */
export function decodeUiPanelLayout(raw: unknown): EditorUiPanelLayout | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (!isHudAnchor(value.anchor)) return null;
  if (!isFiniteNumber(value.dx) || !isFiniteNumber(value.dy)) return null;
  const panel: EditorUiPanelLayout = {
    anchor: value.anchor,
    dx: value.dx,
    dy: value.dy,
  };
  if (isFiniteNumber(value.width)) panel.width = value.width;
  if (isFiniteNumber(value.height)) panel.height = value.height;
  if (typeof value.visible === "boolean") panel.visible = value.visible;
  if (typeof value.type === "string" && value.type.length > 0) panel.type = value.type;
  return panel;
}

/** @internal Decode a ui section from untrusted JSON; undefined when absent, empty object when empty panels. */
export function decodeEditorUiDocument(raw: unknown): EditorUiDocument | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const panelsRaw = (raw as Record<string, unknown>).panels;
  if (typeof panelsRaw !== "object" || panelsRaw === null || Array.isArray(panelsRaw)) {
    return { panels: {} };
  }
  const panels: Record<string, EditorUiPanelLayout> = {};
  for (const [id, entry] of Object.entries(panelsRaw)) {
    if (id.length === 0) continue;
    const decoded = decodeUiPanelLayout(entry);
    if (decoded !== null) panels[id] = decoded;
  }
  return { panels };
}

/** @internal Deep-clone a ui section for document history snapshots. */
export function cloneEditorUiDocument(ui: EditorUiDocument | undefined): EditorUiDocument | undefined {
  if (ui === undefined) return undefined;
  const panels: Record<string, EditorUiPanelLayout> = {};
  for (const [id, panel] of Object.entries(ui.panels)) {
    panels[id] = { ...panel };
  }
  return { panels };
}

/** @internal Convert a layout store-style placement map into a document ui section. */
export function uiDocumentFromPlacements(
  panels: Record<string, EditorUiPanelLayout>,
): EditorUiDocument {
  const out: Record<string, EditorUiPanelLayout> = {};
  for (const [id, panel] of Object.entries(panels)) {
    out[id] = { ...panel };
  }
  return { panels: out };
}
