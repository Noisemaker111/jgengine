import type { ReadableEngineStore } from "@jgengine/react/engineStore";

import {
  contributions,
  summarize,
  syntheticYear,
  type ContributionData,
  type ContributionStats,
  type DayCell,
  type GitHubProfile,
} from "@jgengine/github";

export type CanopyStatus = "idle" | "loading" | "ready" | "error";

export interface CanopyState {
  seed: number;
  cells: DayCell[];
  stats: ContributionStats;
  profile: GitHubProfile | null;
  source: ContributionData["source"];
  status: CanopyStatus;
  error: string | null;
  hovered: number | null;
}

export interface CanopyStore extends ReadableEngineStore<CanopyState> {
  setHovered(index: number | null): void;
  regrow(): void;
  loadUser(username: string): Promise<void>;
}

function nextSeed(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

export function createCanopyStore(initialSeed: number): CanopyStore {
  const first = syntheticYear(initialSeed);
  let state: CanopyState = {
    seed: initialSeed,
    cells: first.cells,
    stats: summarize(first.cells),
    profile: null,
    source: "synthetic",
    status: "idle",
    error: null,
    hovered: null,
  };
  const listeners = new Set<(next: CanopyState) => void>();

  function emit(): void {
    for (const listener of listeners) listener(state);
  }

  function apply(patch: Partial<CanopyState>): void {
    state = { ...state, ...patch };
    emit();
  }

  function show(data: ContributionData, patch: Partial<CanopyState> = {}): void {
    apply({
      cells: data.cells,
      stats: summarize(data.cells),
      profile: data.profile,
      source: data.source,
      hovered: null,
      ...patch,
    });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setHovered(index) {
      if (state.hovered === index) return;
      apply({ hovered: index });
    },
    regrow() {
      const seed = nextSeed(state.seed);
      show(syntheticYear(seed), { seed, status: "idle", error: null });
    },
    async loadUser(username) {
      const name = username.trim();
      if (name.length === 0 || state.status === "loading") return;
      apply({ status: "loading", error: null });
      try {
        const data = await contributions(name);
        show(data, { status: "ready", error: null });
      } catch (error) {
        apply({ status: "error", error: error instanceof Error ? error.message : "Lookup failed" });
      }
    },
  };
}

export const store = createCanopyStore(20240107);
