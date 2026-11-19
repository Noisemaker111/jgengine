// @skill jgengine-gameplay
export interface CodexEntryDef<TMeta = unknown> {
  id: string;
  name: string;
  category?: string;
  description?: string;
  lore?: string;
  /** Icon/image id or glyph the game renders; the engine never picks art. */
  icon?: string;
  secret?: boolean;
  fragments?: number;
  meta?: TMeta;
}

export interface CodexEntryView<TMeta = unknown> extends CodexEntryDef<TMeta> {
  discovered: boolean;
  discoveredAt: number | null;
  scanned: number;
  fragments: number;
}

export interface CodexSnapshot {
  discovered: Record<string, number>;
  progress?: Record<string, number>;
}

export interface Codex<TMeta = unknown> {
  discover(id: string): CodexEntryView<TMeta> | null;
  scan(id: string, count?: number): CodexEntryView<TMeta> | null;
  isDiscovered(id: string): boolean;
  get(id: string): CodexEntryView<TMeta> | null;
  list(category?: string): readonly CodexEntryView<TMeta>[];
  categories(): readonly string[];
  discoveredCount(): number;
  total(): number;
  /** Fraction discovered, `[0, 1]`. */
  completion(): number;
  subscribe(listener: () => void): () => void;
  snapshot(): CodexSnapshot;
  restore(snapshot: CodexSnapshot): void;
}

export interface CodexOptions<TMeta = unknown> {
  entries: readonly CodexEntryDef<TMeta>[];
  /** Injected clock (ms). Default `Date.now`. */
  now?: () => number;
  onDiscover?: (entry: CodexEntryView<TMeta>) => void;
}

/**
 * A codex / bestiary / lorebook: a fixed set of defined entries plus per-player
 * discovery tracking, fragment scanning (learn an entry after N scans), with categories, secret masking, completion, an
 * `onDiscover` seam, and serializable `snapshot`/`restore`. The view `list()`
 * keeps a stable identity between changes so the UI reads it through
 * `useSyncExternalStore` without re-projecting each frame.
 *
 * @capability codex codex/bestiary/lorebook of defined entries with discovery tracking, fragment scans, categories, secret masking, completion, an onDiscover seam, and serializable state
 */
export function createCodex<TMeta = unknown>(options: CodexOptions<TMeta>): Codex<TMeta> {
  const now = options.now ?? Date.now;
  const order: string[] = [];
  const defs = new Map<string, CodexEntryDef<TMeta>>();
  for (const def of options.entries) {
    if (defs.has(def.id)) continue;
    defs.set(def.id, def);
    order.push(def.id);
  }
  const discoveredAt = new Map<string, number>();
  const progress = new Map<string, number>();
  const needed = (id: string): number => Math.max(1, Math.floor(defs.get(id)!.fragments ?? 1));
  const listeners = new Set<() => void>();
  let cache: readonly CodexEntryView<TMeta>[] | null = null;

  function notify(): void {
    cache = null;
    for (const listener of listeners) listener();
  }

  function viewOf(id: string): CodexEntryView<TMeta> {
    const def = defs.get(id)!;
    const at = discoveredAt.get(id) ?? null;
    const fragments = needed(id);
    return { ...def, discovered: at !== null, discoveredAt: at, scanned: at !== null ? fragments : (progress.get(id) ?? 0), fragments };
  }

  const codex: Codex<TMeta> = {
    discover(id) {
      if (!defs.has(id) || discoveredAt.has(id)) return null;
      discoveredAt.set(id, now());
      progress.delete(id);
      const view = viewOf(id);
      options.onDiscover?.(view);
      notify();
      return view;
    },
    scan(id, count = 1) {
      if (!defs.has(id) || discoveredAt.has(id)) return null;
      if (!Number.isFinite(count) || count < 0) throw new Error("codex.scan count must be a non-negative number.");
      const scanned = (progress.get(id) ?? 0) + Math.floor(count);
      if (scanned >= needed(id)) return codex.discover(id);
      progress.set(id, scanned);
      notify();
      return viewOf(id);
    },
    isDiscovered(id) {
      return discoveredAt.has(id);
    },
    get(id) {
      return defs.has(id) ? viewOf(id) : null;
    },
    list(category) {
      if (cache === null) cache = order.map(viewOf);
      return category === undefined ? cache : cache.filter((view) => view.category === category);
    },
    categories() {
      const seen: string[] = [];
      for (const id of order) {
        const category = defs.get(id)!.category;
        if (category !== undefined && !seen.includes(category)) seen.push(category);
      }
      return seen;
    },
    discoveredCount() {
      return discoveredAt.size;
    },
    total() {
      return order.length;
    },
    completion() {
      return order.length === 0 ? 0 : discoveredAt.size / order.length;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return { discovered: Object.fromEntries(discoveredAt), progress: Object.fromEntries(progress) };
    },
    restore(snapshot) {
      discoveredAt.clear();
      for (const [id, at] of Object.entries(snapshot.discovered)) {
        if (defs.has(id)) discoveredAt.set(id, at);
      }
      progress.clear();
      for (const [id, scanned] of Object.entries(snapshot.progress ?? {})) {
        if (defs.has(id) && !discoveredAt.has(id) && scanned > 0) progress.set(id, Math.min(scanned, needed(id) - 1));
      }
      notify();
    },
  };

  return codex;
}
