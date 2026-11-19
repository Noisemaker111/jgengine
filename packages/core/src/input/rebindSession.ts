import {
  allActionCodes,
  bindingLabel,
  isActionLocked,
  isCodeList,
  normalizeKeyCode,
  type ActionCodes,
  type ActionCodesMap,
} from "./actionBindings";
import { applyBindingOverrides, type BindingOverrides } from "./bindingOverrides";

/**
 * One rebindable action as declared to {@link createRebindSession}. The `id` and
 * `label` are FREE strings the session never interprets — the game owns their
 * meaning and display text. `defaultCodes` is the authored binding the session
 * resets back to.
 */
export interface RebindActionConfig {
  id: string;
  label: string;
  /** The game's authored binding for this action; `reset` returns here. `locked: true` here makes the row read-only. */
  defaultCodes: ActionCodes;
  /**
   * Where the action is read (`"walk"`, `"menu"`). Actions in different contexts never run together, so
   * they may share a key without a conflict. Actions without one share a single context.
   */
  context?: string;
}

export type RebindSessionConfig = RebindSessionActionsConfig | RebindSessionMapConfig;

interface RebindSessionCommon {
  overrides?: BindingOverrides;
  /** Injected clock (ms) used to timestamp each rebind. Default `Date.now`. */
  now?: () => number;
}

export interface RebindSessionActionsConfig extends RebindSessionCommon {
  actions: readonly RebindActionConfig[];
}

export interface RebindSessionMapConfig extends RebindSessionCommon {
  input: ActionCodesMap;
  labels?: Record<string, string>;
}

export interface RebindRow {
  actionId: string;
  label: string;
  codes: ActionCodes;
  /** Normalized primary code driving this action (`"KeyW"`, `"Space"`), or `null` when unbound. */
  code: string | null;
  bindingLabel: string;
  isDefault: boolean;
  locked: boolean;
  /** Other action ids that share a normalized code with this row (the conflict set). */
  conflictWith: string[];
  /** Clock time (ms) this action was last rebound, or `null` if never rebound this session. */
  changedAt: number | null;
}

/** A group of actions bound to the same normalized code — the conflict this session detects. */
export interface RebindConflict {
  /** The shared normalized code. */
  code: string;
  actionIds: string[];
}

export interface RebindSessionSnapshot {
  overrides: BindingOverrides;
  /** When each action was last rebound (ms), by action id. */
  changedAt: Record<string, number>;
  /** The action currently armed for capture, or `null`. */
  capturingActionId: string | null;
}

export interface RebindSession {
  actions(): readonly RebindActionConfig[];
  rows(): RebindRow[];
  row(actionId: string): RebindRow | null;
  beginCapture(actionId: string): void;
  /** The action currently armed for capture, or `null`. */
  capturingActionId(): string | null;
  isCapturing(actionId?: string): boolean;
  /**
   * Feed a raw key/button code (e.g. a `KeyboardEvent.code`) to the armed action:
   * it is normalized (`normalizeKeyCode`) and recorded as that action's primary
   * override, preserving the action's hold/toggle/repeat shape, then capture
   * disarms. Returns whether an assignment happened (false when nothing is armed).
   */
  capture(code: string): boolean;
  cancelCapture(): void;
  /** Every conflict group — actions that share a normalized code. Empty when clean. */
  conflicts(): RebindConflict[];
  /** Whether any two actions share a normalized code. */
  hasConflicts(): boolean;
  reset(actionId: string): void;
  resetAll(): void;
  isDefault(actionId: string): boolean;
  overrides(): BindingOverrides;
  apply(persistFn?: (overrides: BindingOverrides) => void): BindingOverrides;
  subscribe(listener: () => void): () => void;
  snapshot(): RebindSessionSnapshot;
  restore(snapshot: RebindSessionSnapshot): void;
}

function allCodes(codes: ActionCodes): string[] {
  return [...allActionCodes(codes)];
}

function primaryCode(codes: ActionCodes): string | null {
  return allCodes(codes)[0] ?? null;
}

function withPrimaryCode(codes: ActionCodes, code: string): ActionCodes {
  if (isCodeList(codes)) {
    return [code, ...codes.slice(1)];
  }
  const modes = codes;
  if (modes.hold !== undefined && modes.hold.length > 0) {
    return { ...modes, hold: [code, ...modes.hold.slice(1)] };
  }
  if (modes.toggle !== undefined && modes.toggle.length > 0) {
    return { ...modes, toggle: [code, ...modes.toggle.slice(1)] };
  }
  return { ...modes, hold: [code] };
}

function normalizeConfig(config: RebindSessionConfig): RebindActionConfig[] {
  if ("actions" in config) return config.actions.map((a) => ({ ...a }));
  const labels = config.labels ?? {};
  return Object.keys(config.input).map((id) => ({
    id,
    label: labels[id] ?? id,
    defaultCodes: config.input[id]!,
  }));
}

/**
 * A conflict-aware key-remap session over the action-binding model — the missing
 * editor behind a controls-settings menu. It takes the game's authored actions
 * ({@link RebindActionConfig}s, or an {@link ActionCodesMap} + labels) plus the
 * player's saved {@link BindingOverrides}, and tracks the *effective* binding per
 * action (default merged with the override via `applyBindingOverrides`). `rows()`
 * exposes each action's label, current key glyph (via `bindingLabel`), whether it
 * is still the default, and which other actions it collides with; `conflicts()`
 * groups every action pair sharing a normalized code (the value-add a raw
 * override map can't give you). `beginCapture`/`capture`/`cancelCapture` drive a
 * "press a key" rebind (codes normalized via `normalizeKeyCode`), `reset`/
 * `resetAll` return to defaults, and `overrides()`/`apply()` hand the caller the
 * `BindingOverrides` to persist. Nothing here is genre-specific: action ids and
 * labels are free strings the session never interprets, and hold/toggle/repeat
 * binding shapes survive a rebind. `snapshot`/`restore` round-trips the editor
 * (including the in-flight capture) through a save.
 *
 * @capability key-rebinding conflict-aware key-remap session over the action-binding model — capture/reassign, conflict detection, reset-to-defaults, persist overrides, snapshot/restore
 */
export function createRebindSession(config: RebindSessionConfig): RebindSession {
  const now = config.now ?? Date.now;
  const actionList = normalizeConfig(config);
  const defaultMap: ActionCodesMap = {};
  for (const action of actionList) defaultMap[action.id] = action.defaultCodes;
  const knownIds = new Set(actionList.map((a) => a.id));
  const lockedIds = new Set(actionList.filter((a) => isActionLocked(a.defaultCodes)).map((a) => a.id));

  const overrides: BindingOverrides = {};
  const changedAt = new Map<string, number>();
  let capturingActionId: string | null = null;
  const listeners = new Set<() => void>();

  function ingestOverrides(source: BindingOverrides): void {
    for (const id of Object.keys(source)) {
      if (knownIds.has(id) && !lockedIds.has(id)) overrides[id] = source[id]!;
    }
  }
  if (config.overrides !== undefined) ingestOverrides(config.overrides);

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function effectiveMap(): ActionCodesMap {
    return applyBindingOverrides(defaultMap, overrides);
  }

  function bucketKey(context: string | undefined, code: string): string {
    return `${context ?? ""}\u0000${code}`;
  }

  /** Map of context + normalized code → the code and the action ids currently bound to it there. */
  function codeIndex(): Map<string, { code: string; actionIds: string[] }> {
    const effective = effectiveMap();
    const index = new Map<string, { code: string; actionIds: string[] }>();
    for (const action of actionList) {
      for (const raw of allCodes(effective[action.id]!)) {
        const code = normalizeKeyCode(raw);
        const key = bucketKey(action.context, code);
        const bucket = index.get(key);
        if (bucket === undefined) index.set(key, { code, actionIds: [action.id] });
        else bucket.actionIds.push(action.id);
      }
    }
    return index;
  }

  function rows(): RebindRow[] {
    const effective = effectiveMap();
    const index = codeIndex();
    return actionList.map((action) => {
      const codes = effective[action.id]!;
      const primaryRaw = primaryCode(codes);
      const primary = primaryRaw === null ? null : normalizeKeyCode(primaryRaw);
      const conflictWith = new Set<string>();
      for (const raw of allCodes(codes)) {
        const bound = index.get(bucketKey(action.context, normalizeKeyCode(raw)));
        if (bound === undefined) continue;
        for (const other of bound.actionIds) if (other !== action.id) conflictWith.add(other);
      }
      return {
        actionId: action.id,
        label: action.label,
        codes,
        code: primary,
        bindingLabel: primary === null ? "" : bindingLabel(primary),
        isDefault: overrides[action.id] === undefined,
        locked: lockedIds.has(action.id),
        conflictWith: [...conflictWith],
        changedAt: changedAt.get(action.id) ?? null,
      };
    });
  }

  return {
    actions() {
      return actionList;
    },
    rows,
    row(actionId) {
      return rows().find((r) => r.actionId === actionId) ?? null;
    },
    beginCapture(actionId) {
      if (!knownIds.has(actionId) || lockedIds.has(actionId) || capturingActionId === actionId) return;
      capturingActionId = actionId;
      notify();
    },
    capturingActionId() {
      return capturingActionId;
    },
    isCapturing(actionId) {
      if (actionId === undefined) return capturingActionId !== null;
      return capturingActionId === actionId;
    },
    capture(code) {
      const target = capturingActionId;
      if (target === null) return false;
      const normalized = normalizeKeyCode(code);
      const base = effectiveMap()[target]!;
      overrides[target] = withPrimaryCode(base, normalized);
      changedAt.set(target, now());
      capturingActionId = null;
      notify();
      return true;
    },
    cancelCapture() {
      if (capturingActionId === null) return;
      capturingActionId = null;
      notify();
    },
    conflicts() {
      const groups: RebindConflict[] = [];
      for (const { code, actionIds } of codeIndex().values()) {
        if (actionIds.length >= 2) groups.push({ code, actionIds: [...actionIds] });
      }
      return groups;
    },
    hasConflicts() {
      for (const { actionIds } of codeIndex().values()) if (actionIds.length >= 2) return true;
      return false;
    },
    reset(actionId) {
      if (overrides[actionId] === undefined) return;
      delete overrides[actionId];
      changedAt.delete(actionId);
      notify();
    },
    resetAll() {
      if (Object.keys(overrides).length === 0 && changedAt.size === 0) return;
      for (const key of Object.keys(overrides)) delete overrides[key];
      changedAt.clear();
      notify();
    },
    isDefault(actionId) {
      return overrides[actionId] === undefined;
    },
    overrides() {
      return { ...overrides };
    },
    apply(persistFn) {
      const snapshot = { ...overrides };
      persistFn?.(snapshot);
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return {
        overrides: { ...overrides },
        changedAt: Object.fromEntries(changedAt),
        capturingActionId,
      };
    },
    restore(snapshot) {
      for (const key of Object.keys(overrides)) delete overrides[key];
      changedAt.clear();
      ingestOverrides(snapshot.overrides);
      for (const [id, at] of Object.entries(snapshot.changedAt)) {
        if (knownIds.has(id)) changedAt.set(id, at);
      }
      capturingActionId =
        snapshot.capturingActionId !== null &&
        knownIds.has(snapshot.capturingActionId) &&
        !lockedIds.has(snapshot.capturingActionId)
          ? snapshot.capturingActionId
          : null;
      notify();
    },
  };
}
