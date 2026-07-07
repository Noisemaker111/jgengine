import type { PlayerProfileRecord } from "./hostPersistence";
import type { RuntimePlayerRow } from "./snapshot";

export type PersistenceScope = "run" | "meta";

export interface ScopeSchema {
  run: readonly string[];
}

export interface ScopedState<T = Record<string, unknown>> {
  meta: Partial<T>;
  run: Partial<T>;
}

export function partitionScopes<T extends Record<string, unknown>>(
  state: T,
  schema: ScopeSchema,
): ScopedState<T> {
  const runKeys = new Set(schema.run);
  const meta: Partial<T> = {};
  const run: Partial<T> = {};
  for (const key of Object.keys(state) as (keyof T)[]) {
    if (runKeys.has(key as string)) run[key] = state[key];
    else meta[key] = state[key];
  }
  return { meta, run };
}

export function resetRun<T extends Record<string, unknown>>(scoped: ScopedState<T>): ScopedState<T> {
  return { meta: scoped.meta, run: {} };
}

export function mergeScopes<T extends Record<string, unknown>>(scoped: ScopedState<T>): Partial<T> {
  return { ...scoped.meta, ...scoped.run };
}

const RUN_FIELD_DEFAULTS: Partial<Record<keyof RuntimePlayerRow, unknown>> = {
  inventories: {},
  economy: {},
  unlocks: [],
  quests: undefined,
  social: undefined,
  leaderboard: {},
  session: {},
};

export function clearRunFields(player: RuntimePlayerRow, runFields: readonly string[]): RuntimePlayerRow {
  const next: RuntimePlayerRow = { ...player };
  for (const field of runFields) {
    if (field === "userId") continue;
    const key = field as keyof RuntimePlayerRow;
    if (key in RUN_FIELD_DEFAULTS) {
      const template = RUN_FIELD_DEFAULTS[key];
      if (template === undefined) delete (next as Record<string, unknown>)[field];
      else (next as Record<string, unknown>)[field] = Array.isArray(template) ? [...template] : { ...template };
    } else {
      delete (next as Record<string, unknown>)[field];
    }
  }
  return next;
}

export function applyRunReset(
  profile: PlayerProfileRecord,
  runFields: readonly string[],
  now: number,
): PlayerProfileRecord {
  return {
    ...profile,
    playerState: clearRunFields(profile.playerState, runFields),
    revision: profile.revision + 1,
    updatedAt: now,
  };
}

export interface ScenarioReset {
  gameId: string;
  serverId?: string;
  wipeChunks?: boolean;
  wipeServerSession?: boolean;
  resetPlayers?: PersistenceScope | "none";
  runFields?: readonly string[];
}

export interface NormalizedScenarioReset {
  gameId: string;
  serverId: string | null;
  wipeChunks: boolean;
  wipeServerSession: boolean;
  resetPlayers: "run" | "none";
  runFields: readonly string[];
}

export function planScenarioReset(reset: ScenarioReset): NormalizedScenarioReset {
  return {
    gameId: reset.gameId,
    serverId: reset.serverId ?? null,
    wipeChunks: reset.wipeChunks ?? true,
    wipeServerSession: reset.wipeServerSession ?? true,
    resetPlayers: reset.resetPlayers === "run" ? "run" : "none",
    runFields: reset.runFields ?? [],
  };
}
