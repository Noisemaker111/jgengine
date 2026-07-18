/**
 * Persistent editor-shell layout state: which workspace is active, which panels are open, their
 * sizes, and dock tab selections. Kept apart from `uiStore` (transient interaction state) so
 * layout preferences survive reloads without entangling gizmo/placement churn. Persistence is
 * throttled so drag-resizing never writes localStorage per pointer move.
 */

/** Left-rail workspace modes. Only some are backed by full panels today; the rest are staged. */
export type EditorWorkspace =
  | "scene"
  | "terrain"
  | "assets"
  | "materials"
  | "scripting"
  | "animation"
  | "audio"
  | "lighting"
  | "ai"
  | "multiplayer";

/** Bottom dock tool tabs. */
export type BottomDockTab = "content" | "console" | "profiler" | "animation" | "assistant";

/** Inspector header tabs. */
export type InspectorTab = "inspector" | "components" | "materials";

/** Left dock content pages (hierarchy plus the existing data panels). */
export type LeftDockPage = "hierarchy" | "collections" | "prefabs" | "catalogs";

/** Content-browser presentation density. */
export type BrowserViewMode = "grid" | "list";

/** The persisted + live shell layout state. */
export interface ShellLayoutState {
  workspace: EditorWorkspace;
  leftOpen: boolean;
  rightOpen: boolean;
  bottomOpen: boolean;
  leftWidth: number;
  rightWidth: number;
  bottomHeight: number;
  leftPage: LeftDockPage;
  bottomTab: BottomDockTab;
  inspectorTab: InspectorTab;
  browserView: BrowserViewMode;
  /** Inspector section collapse state, keyed by section id; absent = open. */
  collapsed: Record<string, boolean>;
}

/** Bounds applied to persisted/live panel sizes so restored layouts can never crush the viewport. */
export const LAYOUT_LIMITS = {
  leftWidth: { min: 220, max: 420 },
  rightWidth: { min: 260, max: 460 },
  bottomHeight: { min: 160, max: 480 },
} as const;

/** Default shell layout, matching the reference composition. */
export const DEFAULT_LAYOUT: ShellLayoutState = {
  workspace: "scene",
  leftOpen: true,
  rightOpen: true,
  bottomOpen: true,
  leftWidth: 288,
  rightWidth: 320,
  bottomHeight: 236,
  leftPage: "hierarchy",
  bottomTab: "content",
  inspectorTab: "inspector",
  browserView: "grid",
  collapsed: {},
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Normalizes any partially-persisted layout into a valid state (sizes clamped, unions guarded). */
export function normalizeLayout(raw: unknown): ShellLayoutState {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_LAYOUT };
  const record = raw as Partial<Record<keyof ShellLayoutState, unknown>>;
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  const num = (value: unknown, fallback: number, limit: { min: number; max: number }): number =>
    typeof value === "number" && Number.isFinite(value) ? clamp(value, limit.min, limit.max) : fallback;
  const bool = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);
  return {
    workspace: pick(
      record.workspace,
      ["scene", "terrain", "assets", "materials", "scripting", "animation", "audio", "lighting", "ai", "multiplayer"],
      DEFAULT_LAYOUT.workspace,
    ),
    leftOpen: bool(record.leftOpen, DEFAULT_LAYOUT.leftOpen),
    rightOpen: bool(record.rightOpen, DEFAULT_LAYOUT.rightOpen),
    bottomOpen: bool(record.bottomOpen, DEFAULT_LAYOUT.bottomOpen),
    leftWidth: num(record.leftWidth, DEFAULT_LAYOUT.leftWidth, LAYOUT_LIMITS.leftWidth),
    rightWidth: num(record.rightWidth, DEFAULT_LAYOUT.rightWidth, LAYOUT_LIMITS.rightWidth),
    bottomHeight: num(record.bottomHeight, DEFAULT_LAYOUT.bottomHeight, LAYOUT_LIMITS.bottomHeight),
    leftPage: pick(record.leftPage, ["hierarchy", "collections", "prefabs", "catalogs"], DEFAULT_LAYOUT.leftPage),
    bottomTab: pick(record.bottomTab, ["content", "console", "profiler", "animation", "assistant"], DEFAULT_LAYOUT.bottomTab),
    inspectorTab: pick(record.inspectorTab, ["inspector", "components", "materials"], DEFAULT_LAYOUT.inspectorTab),
    browserView: pick(record.browserView, ["grid", "list"], DEFAULT_LAYOUT.browserView),
    collapsed:
      typeof record.collapsed === "object" && record.collapsed !== null
        ? Object.fromEntries(
            Object.entries(record.collapsed as Record<string, unknown>).filter(
              (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
            ),
          )
        : {},
  };
}

/** Subscribable store over {@link ShellLayoutState} with clamped resize helpers. */
export interface ShellLayoutStore {
  getState(): ShellLayoutState;
  patch(partial: Partial<ShellLayoutState>): void;
  subscribe(listener: () => void): () => void;
  /** Applies a resize delta to one panel dimension, clamped to {@link LAYOUT_LIMITS}. */
  resize(dimension: "leftWidth" | "rightWidth" | "bottomHeight", delta: number): void;
  /** Switches workspace; opening a workspace re-opens its home panel. */
  setWorkspace(workspace: EditorWorkspace): void;
  toggleSection(id: string): void;
  /** Restores {@link DEFAULT_LAYOUT}. */
  reset(): void;
}

function storageKey(gameId: string): string {
  return `jgeditor:shell:${gameId}`;
}

/** How long resize/patch churn batches before one localStorage write. */
export const LAYOUT_PERSIST_DELAY_MS = 400;

/** Creates the shell layout store, seeded from localStorage when available. */
export function createShellLayoutStore(gameId: string): ShellLayoutStore {
  let state: ShellLayoutState = { ...DEFAULT_LAYOUT };
  try {
    const raw = localStorage.getItem(storageKey(gameId));
    if (raw !== null) state = normalizeLayout(JSON.parse(raw));
  } catch {
    // Sandboxed/denied storage falls back to defaults.
  }

  const listeners = new Set<() => void>();
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  const schedulePersist = () => {
    if (persistTimer !== null) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      try {
        localStorage.setItem(storageKey(gameId), JSON.stringify(state));
      } catch {
        // Persistence is best-effort.
      }
    }, LAYOUT_PERSIST_DELAY_MS);
  };
  const emit = () => {
    for (const listener of listeners) listener();
    schedulePersist();
  };

  const store: ShellLayoutStore = {
    getState: () => state,
    patch(partial) {
      state = { ...state, ...partial };
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    resize(dimension, delta) {
      const limit = LAYOUT_LIMITS[dimension];
      const next = clamp(state[dimension] + delta, limit.min, limit.max);
      if (next === state[dimension]) return;
      state = { ...state, [dimension]: next };
      emit();
    },
    setWorkspace(workspace) {
      const partial: Partial<ShellLayoutState> = { workspace };
      if (workspace === "scene" || workspace === "terrain") {
        partial.leftOpen = true;
        partial.leftPage = "hierarchy";
      }
      if (workspace === "assets") {
        partial.bottomOpen = true;
        partial.bottomTab = "content";
      }
      if (workspace === "ai") {
        partial.bottomOpen = true;
        partial.bottomTab = "assistant";
      }
      // Network owns the left dock; lighting is a viewport panel but keeps hierarchy open for context.
      if (workspace === "multiplayer" || workspace === "lighting") {
        partial.leftOpen = true;
      }
      state = { ...state, ...partial };
      emit();
    },
    toggleSection(id) {
      const collapsed = { ...state.collapsed, [id]: !(state.collapsed[id] === true) };
      state = { ...state, collapsed };
      emit();
    },
    reset() {
      state = { ...DEFAULT_LAYOUT };
      emit();
    },
  };
  return store;
}
