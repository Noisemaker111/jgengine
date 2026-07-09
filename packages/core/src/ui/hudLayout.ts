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
}

export interface HudLayoutState {
  panels: Record<string, HudPanelState>;
  locked: boolean;
}

export interface HudLayoutOptions {
  snap?: number;
  locked?: boolean;
}

export interface HudLayoutStore {
  getState(): HudLayoutState;
  subscribe(listener: (state: HudLayoutState) => void): () => void;
  register(id: string, placement: HudPlacement): void;
  move(id: string, rect: HudRect, viewport: HudSize): void;
  bringToFront(id: string): void;
  setLocked(locked: boolean): void;
  reset(id?: string): void;
  serialize(): string;
  hydrate(raw: string | null | undefined): void;
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

export function isHudAnchor(value: unknown): value is HudAnchor {
  return typeof value === "string" && value in HUD_ANCHOR_FRACTIONS;
}

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

export function clampRect(rect: HudRect, viewport: HudSize): HudRect {
  return {
    x: Math.max(0, Math.min(rect.x, viewport.width - rect.width)),
    y: Math.max(0, Math.min(rect.y, viewport.height - rect.height)),
    width: rect.width,
    height: rect.height,
  };
}

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

interface SerializedHudLayout {
  v: 1;
  panels: Record<string, HudPlacement>;
}

function parseSerialized(raw: string): Map<string, HudPlacement> {
  const out = new Map<string, HudPlacement>();
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
    const { anchor, dx, dy } = value as Partial<HudPlacement>;
    if (!isHudAnchor(anchor)) continue;
    if (typeof dx !== "number" || !Number.isFinite(dx)) continue;
    if (typeof dy !== "number" || !Number.isFinite(dy)) continue;
    out.set(id, { anchor, dx, dy });
  }
  return out;
}

export function createHudLayout(options?: HudLayoutOptions): HudLayoutStore {
  const snap = options?.snap ?? 1;
  const defaults = new Map<string, HudPlacement>();
  const pending = new Map<string, HudPlacement>();
  let topZ = 0;
  let state: HudLayoutState = { panels: {}, locked: options?.locked ?? false };
  const listeners = new Set<(next: HudLayoutState) => void>();

  const emit = () => {
    for (const listener of [...listeners]) listener(state);
  };

  const setPanel = (panel: HudPanelState) => {
    state = { ...state, panels: { ...state.panels, [panel.id]: panel } };
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    register(id, placement) {
      defaults.set(id, placement);
      if (state.panels[id] !== undefined) return;
      const override = pending.get(id);
      setPanel({
        id,
        placement: override ?? placement,
        z: ++topZ,
        moved: override !== undefined,
      });
    },
    move(id, rect, viewport) {
      const panel = state.panels[id];
      if (panel === undefined) return;
      const placement = placementFromRect(rect, viewport, snap);
      setPanel({ ...panel, placement, moved: true });
      emit();
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
    reset(id) {
      const ids = id === undefined ? Object.keys(state.panels) : [id];
      let changed = false;
      for (const panelId of ids) {
        pending.delete(panelId);
        const panel = state.panels[panelId];
        const fallback = defaults.get(panelId);
        if (panel === undefined || fallback === undefined || !panel.moved) continue;
        setPanel({ ...panel, placement: fallback, moved: false });
        changed = true;
      }
      if (changed) emit();
    },
    serialize() {
      const panels: Record<string, HudPlacement> = {};
      for (const panel of Object.values(state.panels)) {
        if (panel.moved) panels[panel.id] = panel.placement;
      }
      for (const [id, placement] of pending) {
        if (state.panels[id] === undefined) panels[id] = placement;
      }
      const data: SerializedHudLayout = { v: 1, panels };
      return JSON.stringify(data);
    },
    hydrate(raw) {
      if (raw === null || raw === undefined || raw === "") return;
      const parsed = parseSerialized(raw);
      if (parsed.size === 0) return;
      let changed = false;
      for (const [id, placement] of parsed) {
        const panel = state.panels[id];
        if (panel === undefined) {
          pending.set(id, placement);
          continue;
        }
        setPanel({ ...panel, placement, moved: true });
        changed = true;
      }
      if (changed) emit();
    },
  };
}
