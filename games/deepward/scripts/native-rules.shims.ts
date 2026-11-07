/** Browser globals the native host (embedded V8, or Bun) lacks; imported before the game so it sees them at load. */
// The native host (and Bun) have no browser storage; Deepward's save record needs one, so a run starts
// from an empty in-memory record, as a first launch does.
if (typeof (globalThis as { localStorage?: unknown }).localStorage === "undefined") {
  const items = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    get length() { return items.size; },
    key: (i: number) => [...items.keys()][i] ?? null,
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => { items.set(k, String(v)); },
    removeItem: (k: string) => { items.delete(k); },
    clear: () => { items.clear(); },
  };
}

export {};
