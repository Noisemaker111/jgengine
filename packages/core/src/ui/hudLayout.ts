export type HudAnchor =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

export interface HudPlacement {
  anchor: HudAnchor;
  dx: number;
  dy: number;
}

export interface HudRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HudSize {
  width: number;
  height: number;
}

export interface HudPanelState {
  id: string;
  placement: HudPlacement;
  z: number;
  moved: boolean;
  width?: number;
  height?: number;
  visible: boolean;
  type?: string;
}

export interface HudLayoutState {
  panels: Record<string, HudPanelState>;
  locked: boolean;
  editing: boolean;
}

export interface HudLayoutOptions {
  snap?: number;
  locked?: boolean;
  /**
   * Called after a panel placement/size is authored (move, resize, hydrate from document).
   * Canvas mode + agent RPCs use this to write undoable scene-document patches.
   */
  onDocumentPatch?: (id: string, panel: import("./hudDocument").EditorUiPanelLayout) => void;
}

/** @internal */
export function isPanelDraggable(state: HudLayoutState, id: string): boolean {
  return state.panels[id] !== undefined && (state.editing || !state.locked);
}

export interface HudLayoutStore {
  getState(): HudLayoutState;
  subscribe(listener: (state: HudLayoutState) => void): () => void;
  register(
    id: string,
    placement: HudPlacement,
    options?: { width?: number; height?: number; visible?: boolean; type?: string },
  ): void;
  move(id: string, rect: HudRect, viewport: HudSize): void;
  resize(id: string, size: HudSize): void;
  setVisible(id: string, visible: boolean): void;
  bringToFront(id: string): void;
  setLocked(locked: boolean): void;
  setEditing(editing: boolean): void;
  reset(id?: string): void;
  serialize(): string;
  hydrate(raw: string | null | undefined): void;
  /** Apply scene-document `ui` section as the source of truth for registered/pending panels. */
  applyDocumentUi(ui: import("./hudDocument").EditorUiDocument | undefined): void;
  /** Snapshot moved/resized panels as a document ui section. */
  toDocumentUi(): import("./hudDocument").EditorUiDocument;
}

export const HUD_ANCHOR_FRACTIONS: Record<HudAnchor, { fx: number; fy: number }> = {
  "top-left": { fx: 0, fy: 0 },
  top: { fx: 0.5, fy: 0 },
  "top-right": { fx: 1, fy: 0 },
  left: { fx: 0, fy: 0.5 },
  center: { fx: 0.5, fy: 0.5 },
  right: { fx: 1, fy: 0.5 },
  "bottom-left": { fx: 0, fy: 1 },
  bottom: { fx: 0.5, fy: 1 },
  "bottom-right": { fx: 1, fy: 1 },
};

const HUD_ANCHORS = Object.keys(HUD_ANCHOR_FRACTIONS) as HudAnchor[];

/** @internal */
export function isHudAnchor(value: unknown): value is HudAnchor {
  return typeof value === "string" && value in HUD_ANCHOR_FRACTIONS;
}

/** @internal */
export function anchoredPlacement(
  anchor: HudAnchor,
  inset: { x: number; y: number },
): HudPlacement {
  const { fx, fy } = HUD_ANCHOR_FRACTIONS[anchor];
  return {
    anchor,
    dx: fx === 1 ? -inset.x : inset.x,
    dy: fy === 1 ? -inset.y : inset.y,
  };
}

/** @internal */
export function nearestAnchor(rect: HudRect, viewport: HudSize): HudAnchor {
  const cx = viewport.width > 0 ? (rect.x + rect.width / 2) / viewport.width : 0.5;
  const cy = viewport.height > 0 ? (rect.y + rect.height / 2) / viewport.height : 0.5;
  let best: HudAnchor = "center";
  let bestDist = Infinity;
  for (const anchor of HUD_ANCHORS) {
    const { fx, fy } = HUD_ANCHOR_FRACTIONS[anchor];
    const dist = (cx - fx) * (cx - fx) + (cy - fy) * (cy - fy);
    if (dist < bestDist) {
      bestDist = dist;
      best = anchor;
    }
  }
  return best;
}

/** @internal */
export function clampRect(rect: HudRect, viewport: HudSize): HudRect {
  return {
    x: Math.max(0, Math.min(rect.x, viewport.width - rect.width)),
    y: Math.max(0, Math.min(rect.y, viewport.height - rect.height)),
    width: rect.width,
    height: rect.height,
  };
}

/** @internal */
export function placementFromRect(rect: HudRect, viewport: HudSize, snap = 1): HudPlacement {
  const clamped = clampRect(rect, viewport);
  const anchor = nearestAnchor(clamped, viewport);
  const { fx, fy } = HUD_ANCHOR_FRACTIONS[anchor];
  const step = snap > 0 ? snap : 1;
  const dx = clamped.x + fx * clamped.width - fx * viewport.width;
  const dy = clamped.y + fy * clamped.height - fy * viewport.height;
  return {
    anchor,
    dx: Math.round(dx / step) * step,
    dy: Math.round(dy / step) * step,
  };
}

/** @internal */
export function rectFromPlacement(
  placement: HudPlacement,
  size: HudSize,
  viewport: HudSize,
): HudRect {
  const { fx, fy } = HUD_ANCHOR_FRACTIONS[placement.anchor];
  return {
    x: fx * viewport.width + placement.dx - fx * size.width,
    y: fy * viewport.height + placement.dy - fy * size.height,
    width: size.width,
    height: size.height,
  };
}

interface PanelOverride {
  placement: HudPlacement;
  width?: number;
  height?: number;
  visible?: boolean;
  type?: string;
}

interface SerializedPanel {
  anchor: HudAnchor;
  dx: number;
  dy: number;
  width?: number;
  height?: number;
  visible?: boolean;
  type?: string;
}

interface SerializedHudLayout {
  v: 1 | 2;
  panels: Record<string, SerializedPanel>;
}

function parseSerialized(raw: string): Map<string, PanelOverride> {
  const out = new Map<string, PanelOverride>();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return out;
  }
  if (typeof data !== "object" || data === null) return out;
  const panels = (data as Partial<SerializedHudLayout>).panels;
  if (typeof panels !== "object" || panels === null) return out;
  for (const [id, value] of Object.entries(panels)) {
    if (typeof value !== "object" || value === null) continue;
    const record = value as Partial<SerializedPanel> & { placement?: Partial<HudPlacement> };
    const placementSource = record.placement ?? record;
    const { anchor, dx, dy } = placementSource;
    if (!isHudAnchor(anchor)) continue;
    if (typeof dx !== "number" || !Number.isFinite(dx)) continue;
    if (typeof dy !== "number" || !Number.isFinite(dy)) continue;
    const override: PanelOverride = { placement: { anchor, dx, dy } };
    if (typeof record.width === "number" && Number.isFinite(record.width)) override.width = record.width;
    if (typeof record.height === "number" && Number.isFinite(record.height)) override.height = record.height;
    if (typeof record.visible === "boolean") override.visible = record.visible;
    if (typeof record.type === "string") override.type = record.type;
    out.set(id, override);
  }
  return out;
}

const activeHudLayouts = new Set<HudLayoutStore>();

/** @internal Agent bridge seam — HudCanvas registers its store while mounted so headless drivers can reach canvas mode. */
export function registerActiveHudLayout(store: HudLayoutStore): () => void {
  activeHudLayouts.add(store);
  return () => {
    activeHudLayouts.delete(store);
  };
}

/** @internal */
export function listActiveHudLayouts(): HudLayoutStore[] {
  return [...activeHudLayouts];
}

function panelToUi(panel: HudPanelState): import("./hudDocument").EditorUiPanelLayout {
  const layout: import("./hudDocument").EditorUiPanelLayout = {
    anchor: panel.placement.anchor,
    dx: panel.placement.dx,
    dy: panel.placement.dy,
  };
  if (panel.width !== undefined) layout.width = panel.width;
  if (panel.height !== undefined) layout.height = panel.height;
  if (panel.visible === false) layout.visible = false;
  if (panel.type !== undefined) layout.type = panel.type;
  return layout;
}

function overrideToUi(id: string, override: PanelOverride): import("./hudDocument").EditorUiPanelLayout {
  const layout: import("./hudDocument").EditorUiPanelLayout = {
    anchor: override.placement.anchor,
    dx: override.placement.dx,
    dy: override.placement.dy,
  };
  if (override.width !== undefined) layout.width = override.width;
  if (override.height !== undefined) layout.height = override.height;
  if (override.visible !== undefined) layout.visible = override.visible;
  if (override.type !== undefined) layout.type = override.type;
  void id;
  return layout;
}

/** @internal */
export function createHudLayout(options?: HudLayoutOptions): HudLayoutStore {
  const snap = options?.snap ?? 1;
  const onDocumentPatch = options?.onDocumentPatch;
  const defaults = new Map<string, PanelOverride>();
  const pending = new Map<string, PanelOverride>();
  let topZ = 0;
  let state: HudLayoutState = { panels: {}, locked: options?.locked ?? true, editing: false };
  const listeners = new Set<(next: HudLayoutState) => void>();

  const emit = () => {
    for (const listener of [...listeners]) listener(state);
  };

  const setPanel = (panel: HudPanelState) => {
    state = { ...state, panels: { ...state.panels, [panel.id]: panel } };
  };

  const notifyDocument = (panel: HudPanelState) => {
    onDocumentPatch?.(panel.id, panelToUi(panel));
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    register(id, placement, registerOptions) {
      const fallback: PanelOverride = {
        placement,
        width: registerOptions?.width,
        height: registerOptions?.height,
        visible: registerOptions?.visible,
        type: registerOptions?.type,
      };
      defaults.set(id, fallback);
      if (state.panels[id] !== undefined) return;
      const override = pending.get(id);
      const source = override ?? fallback;
      setPanel({
        id,
        placement: source.placement,
        z: ++topZ,
        moved: override !== undefined,
        width: source.width ?? fallback.width,
        height: source.height ?? fallback.height,
        visible: source.visible ?? fallback.visible !== false,
        type: source.type ?? fallback.type,
      });
    },
    move(id, rect, viewport) {
      const panel = state.panels[id];
      if (panel === undefined) return;
      const placement = placementFromRect(rect, viewport, snap);
      const next = { ...panel, placement, moved: true };
      setPanel(next);
      emit();
      notifyDocument(next);
    },
    resize(id, size) {
      const panel = state.panels[id];
      if (panel === undefined) return;
      const width = Math.max(1, Math.round(size.width));
      const height = Math.max(1, Math.round(size.height));
      if (panel.width === width && panel.height === height) return;
      const next = { ...panel, width, height, moved: true };
      setPanel(next);
      emit();
      notifyDocument(next);
    },
    setVisible(id, visible) {
      const panel = state.panels[id];
      if (panel === undefined || panel.visible === visible) return;
      const next = { ...panel, visible, moved: true };
      setPanel(next);
      emit();
      notifyDocument(next);
    },
    bringToFront(id) {
      const panel = state.panels[id];
      if (panel === undefined || panel.z === topZ) return;
      setPanel({ ...panel, z: ++topZ });
      emit();
    },
    setLocked(locked) {
      if (state.locked === locked) return;
      state = { ...state, locked };
      emit();
    },
    setEditing(editing) {
      if (state.editing === editing) return;
      state = { ...state, editing };
      emit();
    },
    reset(id) {
      const ids = id === undefined ? Object.keys(state.panels) : [id];
      let changed = false;
      for (const panelId of ids) {
        pending.delete(panelId);
        const panel = state.panels[panelId];
        const fallback = defaults.get(panelId);
        if (panel === undefined || fallback === undefined) continue;
        const hasAuthored =
          panel.moved ||
          panel.width !== fallback.width ||
          panel.height !== fallback.height ||
          panel.visible !== (fallback.visible !== false);
        if (!hasAuthored) continue;
        setPanel({
          ...panel,
          placement: fallback.placement,
          width: fallback.width,
          height: fallback.height,
          visible: fallback.visible !== false,
          type: fallback.type,
          moved: false,
        });
        changed = true;
      }
      if (changed) emit();
    },
    serialize() {
      const panels: Record<string, SerializedPanel> = {};
      for (const panel of Object.values(state.panels)) {
        if (!panel.moved) continue;
        panels[panel.id] = {
          anchor: panel.placement.anchor,
          dx: panel.placement.dx,
          dy: panel.placement.dy,
          ...(panel.width === undefined ? {} : { width: panel.width }),
          ...(panel.height === undefined ? {} : { height: panel.height }),
          ...(panel.visible === false ? { visible: false } : {}),
          ...(panel.type === undefined ? {} : { type: panel.type }),
        };
      }
      for (const [id, override] of pending) {
        if (state.panels[id] !== undefined) continue;
        panels[id] = {
          anchor: override.placement.anchor,
          dx: override.placement.dx,
          dy: override.placement.dy,
          ...(override.width === undefined ? {} : { width: override.width }),
          ...(override.height === undefined ? {} : { height: override.height }),
          ...(override.visible === undefined ? {} : { visible: override.visible }),
          ...(override.type === undefined ? {} : { type: override.type }),
        };
      }
      const data: SerializedHudLayout = { v: 2, panels };
      return JSON.stringify(data);
    },
    hydrate(raw) {
      if (raw === null || raw === undefined || raw === "") return;
      const parsed = parseSerialized(raw);
      if (parsed.size === 0) return;
      let changed = false;
      for (const [id, override] of parsed) {
        const panel = state.panels[id];
        if (panel === undefined) {
          pending.set(id, override);
          continue;
        }
        setPanel({
          ...panel,
          placement: override.placement,
          width: override.width ?? panel.width,
          height: override.height ?? panel.height,
          visible: override.visible ?? panel.visible,
          type: override.type ?? panel.type,
          moved: true,
        });
        changed = true;
      }
      if (changed) emit();
    },
    applyDocumentUi(ui) {
      if (ui === undefined) return;
      let changed = false;
      for (const [id, layout] of Object.entries(ui.panels)) {
        const override: PanelOverride = {
          placement: { anchor: layout.anchor, dx: layout.dx, dy: layout.dy },
          width: layout.width,
          height: layout.height,
          visible: layout.visible,
          type: layout.type,
        };
        const panel = state.panels[id];
        if (panel === undefined) {
          pending.set(id, override);
          continue;
        }
        setPanel({
          ...panel,
          placement: override.placement,
          width: override.width ?? panel.width,
          height: override.height ?? panel.height,
          visible: override.visible ?? panel.visible,
          type: override.type ?? panel.type,
          moved: true,
        });
        changed = true;
      }
      if (changed) emit();
    },
    toDocumentUi() {
      const panels: Record<string, import("./hudDocument").EditorUiPanelLayout> = {};
      for (const panel of Object.values(state.panels)) {
        if (panel.moved) panels[panel.id] = panelToUi(panel);
      }
      for (const [id, override] of pending) {
        if (state.panels[id] === undefined) panels[id] = overrideToUi(id, override);
      }
      return { panels };
    },
  };
}
