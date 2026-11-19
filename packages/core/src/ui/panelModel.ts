/**
 * Headless, serializable model for a set of player-toggled windows/panels — the data layer behind a
 * WoW-style UI where B opens the bag, C the character sheet, and ESC closes the topmost window. It
 * carries *which panels are open*, their focus/z stacking order, per-panel position overrides, and
 * exclusive-group membership, with zero rendering opinion. The UI chrome in
 * `@jgengine/core/ui/panels.view` consumes this; a game keeps layout, skin, keybinds, and window content
 * caller-owned. Pure and immutable: every reducer returns a new state and never mutates its input.
 */

/** A pixel position override for a panel (top-left, relative to the host surface). */
export interface PanelPosition {
  x: number;
  y: number;
}

export interface PanelDef {
  id: string;
  title?: string;
  hotkey?: string;
  initial?: boolean;
  group?: string;
  closable?: boolean;
}

/** @internal Serializable per-panel metadata lifted from {@link PanelDef} so reducers stay `(state, id)` pure. */
export interface PanelMeta {
  group?: string;
  closable?: boolean;
}

/**
 * Serializable state for a set of panels: which are `open`, their `z` focus stack (higher renders on
 * top), optional per-panel `pos` overrides, and the `meta` registry (group/closable) captured from
 * the defs so the reducers below need no defs argument. Plain JSON — persist and rehydrate it freely.
 */
export interface PanelState {
  open: Record<string, true>;
  z: Record<string, number>;
  pos: Record<string, PanelPosition>;
  meta: Record<string, PanelMeta>;
  /** Next z value to assign on open/focus — monotonic so focus order is deterministic. */
  nextZ: number;
}

/**
 * Build the initial {@link PanelState} from the panel defs: panels flagged `initial` start open (in
 * declaration order, respecting group exclusivity), and every def's group/closable is captured into
 * the state so later reducers need no defs.
 *
 * @capability panel-state serializable open/z/position state for a set of toggleable game windows
 */
export function createPanelState(defs: readonly PanelDef[]): PanelState {
  const meta: Record<string, PanelMeta> = {};
  for (const def of defs) {
    const entry: PanelMeta = {};
    if (def.group !== undefined) entry.group = def.group;
    if (def.closable !== undefined) entry.closable = def.closable;
    meta[def.id] = entry;
  }
  let state: PanelState = { open: {}, z: {}, pos: {}, meta, nextZ: 1 };
  for (const def of defs) {
    if (def.initial === true) state = openPanel(state, def.id);
  }
  return state;
}

export function isOpen(state: PanelState, id: string): boolean {
  return state.open[id] === true;
}

/** @internal Whether panel `id` may be closed by the player (default true). */
function isClosable(state: PanelState, id: string): boolean {
  return state.meta[id]?.closable !== false;
}

/**
 * Open panel `id`, raising it to the top of the focus stack. If it belongs to a `group`, the other
 * open panels in that group are closed (exclusive windows). Opening an already-open panel just
 * refocuses it. Position overrides are preserved.
 *
 * @capability panel-open open a window, raise its z, and enforce exclusive-group membership
 */
export function openPanel(state: PanelState, id: string): PanelState {
  const group = state.meta[id]?.group;
  const open: Record<string, true> = { ...state.open };
  const z: Record<string, number> = { ...state.z };
  let nextZ = state.nextZ;
  if (group !== undefined) {
    for (const otherId of Object.keys(open)) {
      if (otherId !== id && state.meta[otherId]?.group === group) {
        delete open[otherId];
        delete z[otherId];
      }
    }
  }
  open[id] = true;
  z[id] = nextZ++;
  return { ...state, open, z, nextZ };
}

/** @capability panel-close close a window while remembering its last position */
export function closePanel(state: PanelState, id: string): PanelState {
  if (state.open[id] !== true) return state;
  const open: Record<string, true> = { ...state.open };
  const z: Record<string, number> = { ...state.z };
  delete open[id];
  delete z[id];
  return { ...state, open, z };
}

/** @capability panel-toggle toggle a window open/closed from a single keybind */
export function togglePanel(state: PanelState, id: string): PanelState {
  return isOpen(state, id) ? closePanel(state, id) : openPanel(state, id);
}

/**
 * Raise open panel `id` to the top of the focus stack (assign it the highest z). No-op if it is
 * closed or already on top, so a pointer-down that refocuses the top window returns the same state.
 *
 * @capability panel-focus raise a window to the top of the focus/z stack
 */
export function focusPanel(state: PanelState, id: string): PanelState {
  if (state.open[id] !== true) return state;
  if (topPanel(state) === id) return state;
  return { ...state, z: { ...state.z, [id]: state.nextZ }, nextZ: state.nextZ + 1 };
}

/** @internal The id of the top (highest-z) open panel, or null when none are open. */
function topPanel(state: PanelState): string | null {
  let top: string | null = null;
  let topZ = -Infinity;
  for (const id of Object.keys(state.open)) {
    const value = state.z[id] ?? 0;
    if (value > topZ) {
      topZ = value;
      top = id;
    }
  }
  return top;
}

/** @capability panel-close-top close the focused (topmost) closable window — the ESC behavior */
export function closeTopPanel(state: PanelState): PanelState {
  const ordered = orderedOpenIds(state);
  for (let i = ordered.length - 1; i >= 0; i--) {
    const id = ordered[i]!;
    if (isClosable(state, id)) return closePanel(state, id);
  }
  return state;
}

/** @internal Open panel ids sorted ascending by z (render order — last is on top). */
function orderedOpenIds(state: PanelState): string[] {
  return Object.keys(state.open).sort((a, b) => (state.z[a] ?? 0) - (state.z[b] ?? 0));
}

/** @capability panel-hotkey resolve a keybind (code or key) to the panel id it toggles */
export function panelByHotkey(defs: readonly PanelDef[], code: string): string | null {
  const needle = code.toLowerCase();
  for (const def of defs) {
    if (def.hotkey !== undefined && def.hotkey.toLowerCase() === needle) return def.id;
  }
  return null;
}

/**
 * Set panel `id`'s position override — the drag commit. Does not require the panel to be open, so a
 * caller can pre-place a window before it is shown.
 *
 * @capability panel-move override a window's on-surface position (the drag commit)
 */
export function movePanel(state: PanelState, id: string, pos: PanelPosition): PanelState {
  return { ...state, pos: { ...state.pos, [id]: { x: pos.x, y: pos.y } } };
}

/**
 * The open panels' defs sorted ascending by z — the render order for a window host (map to elements
 * so the last, highest-z window paints on top). Defs unknown to the state are skipped.
 *
 * @capability panel-ordered-open open panels' defs in z/render order for a window host
 */
export function orderedOpen(state: PanelState, defs: readonly PanelDef[]): PanelDef[] {
  return defs
    .filter((def) => state.open[def.id] === true)
    .sort((a, b) => (state.z[a.id] ?? 0) - (state.z[b.id] ?? 0));
}
