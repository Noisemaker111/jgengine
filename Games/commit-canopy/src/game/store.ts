import type { ReadableEngineStore } from "@jgengine/react/engineStore";

import {
  contributions,
  generateYear,
  summarize,
  type ContributionData,
  type ContributionStats,
  type DayCell,
  type GitHubProfile,
} from "@jgengine/github";

export type CanopyStatus = "idle" | "loading" | "ready" | "error";

export interface CanopyState {
  cells: DayCell[];
  stats: ContributionStats;
  profile: GitHubProfile | null;
  source: ContributionData["source"] | null;
  status: CanopyStatus;
  error: string | null;
  hovered: number | null;
}

export interface CanopyStore extends ReadableEngineStore<CanopyState> {
  setHovered(index: number | null): void;
  loadUser(username: string): Promise<void>;
}

export function createCanopyStore(): CanopyStore {
  const demoCells = generateYear(1);
  let state: CanopyState = {
    cells: demoCells,
    stats: summarize(demoCells),
    profile: null,
    source: null,
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

export const store = createCanopyStore();
