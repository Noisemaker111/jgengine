import type { ActionCodesMap } from "./actionBindings";
import type { AxisBinding } from "./axisInput";
import type { AxisShapeConfig } from "./axisShaper";

/** Serializable axis shaping a context may carry: {@link AxisShapeConfig} without the `scale` callback. */
export type ActionContextAxisShape = Omit<AxisShapeConfig, "scale">;

/** Named action-binding layer that may optionally expose lower layers. */
export interface ActionContext {
  id: string;
  codes: ActionCodesMap;
  passthrough: boolean;
  /** Axis bindings (by action name) this context brings, e.g. `steer` while driving; read with `activeAxes()`. */
  axes?: Record<string, AxisBinding>;
  /** Per-axis shaping this context brings; feed it to `createAxisShaper(...).retune` when the stack changes. */
  shaping?: Record<string, ActionContextAxisShape>;
}

/** Serializable state for an action-context stack. */
export interface ActionContextStackSnapshot {
  contexts: ActionContext[];
}

/** Axis bindings and shaping merged across the active contexts. */
export interface ActiveContextAxes {
  bindings: Record<string, AxisBinding>;
  shaping: Record<string, ActionContextAxisShape>;
}

/** Mutable layered action-map stack with snapshot and restore support. */
export interface ActionContextStack {
  push(context: ActionContext): void;
  pop(id: string): boolean;
  active(): ActionCodesMap;
  /** Axis bindings and shaping of the active contexts, merged top-down like {@link active}. */
  activeAxes(): ActiveContextAxes;
  /** Ids of the stacked contexts, bottom first. */
  ids(): readonly string[];
  /** Bumps on every push, pop and restore; cheap change detection for per-frame readers. */
  version(): number;
  /** Called after every push, pop and restore; returns an unsubscribe. The shell rebinds live input here. */
  subscribe(listener: () => void): () => void;
  snapshot(): ActionContextStackSnapshot;
  restore(snapshot: ActionContextStackSnapshot): void;
}

function cloneCodes(codes: ActionCodesMap): ActionCodesMap {
  const result: ActionCodesMap = {};
  for (const [action, value] of Object.entries(codes)) {
    const modes = value as { hold?: readonly string[]; toggle?: readonly string[]; repeatMs?: number };
    result[action] = Array.isArray(value)
      ? [...value]
      : {
          ...(modes.hold === undefined ? {} : { hold: [...modes.hold] }),
          ...(modes.toggle === undefined ? {} : { toggle: [...modes.toggle] }),
          ...(modes.repeatMs === undefined ? {} : { repeatMs: modes.repeatMs }),
        };
  }
  return result;
}

function cloneAxes(axes: Record<string, AxisBinding>): Record<string, AxisBinding> {
  const result: Record<string, AxisBinding> = {};
  for (const [axis, binding] of Object.entries(axes)) {
    result[axis] = {
      ...binding,
      positive: [...binding.positive],
      ...(binding.negative === undefined ? {} : { negative: [...binding.negative] }),
    };
  }
  return result;
}

function cloneShaping(shaping: Record<string, ActionContextAxisShape>): Record<string, ActionContextAxisShape> {
  const result: Record<string, ActionContextAxisShape> = {};
  for (const [axis, shape] of Object.entries(shaping)) {
    result[axis] = {
      ...(shape.digital === undefined ? {} : { digital: { ...shape.digital } }),
      ...(shape.analog === undefined ? {} : { analog: { ...shape.analog } }),
      ...(shape.range === undefined ? {} : { range: { ...shape.range } }),
    };
  }
  return result;
}

function cloneContext(context: ActionContext): ActionContext {
  return {
    id: context.id,
    codes: cloneCodes(context.codes),
    passthrough: context.passthrough,
    ...(context.axes === undefined ? {} : { axes: cloneAxes(context.axes) }),
    ...(context.shaping === undefined ? {} : { shaping: cloneShaping(context.shaping) }),
  };
}

function mergeTopDown<T>(contexts: readonly ActionContext[], pick: (context: ActionContext) => Record<string, T> | undefined) {
  const merged: Record<string, T> = {};
  for (let index = contexts.length - 1; index >= 0; index -= 1) {
    const context = contexts[index]!;
    const layer = pick(context);
    if (layer !== undefined) {
      for (const [key, value] of Object.entries(layer)) {
        if (merged[key] === undefined) merged[key] = value;
      }
    }
    if (!context.passthrough) break;
  }
  return merged;
}

/**
 * Creates a serializable stack of layered action maps for menus and gameplay modes.
 * @capability action-contexts Swap bindings live for on-foot, driving, menu or build modes by pushing and popping layered action maps.
 */
export function createActionContextStack(): ActionContextStack {
  let contexts: ActionContext[] = [];
  let version = 0;
  const listeners = new Set<() => void>();
  const changed = () => {
    version += 1;
    for (const listener of [...listeners]) listener();
  };

  return {
    push(context) {
      contexts = [...contexts.filter((current) => current.id !== context.id), cloneContext(context)];
      changed();
    },
    pop(id) {
      const next = contexts.filter((context) => context.id !== id);
      const removed = next.length !== contexts.length;
      contexts = next;
      if (removed) changed();
      return removed;
    },
    active() {
      return mergeTopDown(contexts, (context) => context.codes);
    },
    activeAxes() {
      return {
        bindings: mergeTopDown(contexts, (context) => context.axes),
        shaping: mergeTopDown(contexts, (context) => context.shaping),
      };
    },
    ids: () => contexts.map((context) => context.id),
    version: () => version,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot() {
      return { contexts: contexts.map(cloneContext) };
    },
    restore(snapshot) {
      contexts = snapshot.contexts.map(cloneContext);
      changed();
    },
  };
}
