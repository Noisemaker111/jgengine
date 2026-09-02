import type { ActionCodesMap } from "./actionBindings";

/** Named action-binding layer that may optionally expose lower layers. */
export interface ActionContext {
  id: string;
  codes: ActionCodesMap;
  passthrough: boolean;
}

/** Serializable state for an action-context stack. */
export interface ActionContextStackSnapshot {
  contexts: ActionContext[];
}

/** Mutable layered action-map stack with snapshot and restore support. */
export interface ActionContextStack {
  push(context: ActionContext): void;
  pop(id: string): boolean;
  active(): ActionCodesMap;
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

/** Creates a serializable stack of layered action maps for menus and gameplay modes. */
export function createActionContextStack(): ActionContextStack {
  let contexts: ActionContext[] = [];

  return {
    push(context) {
      contexts = [...contexts.filter((current) => current.id !== context.id), {
        id: context.id,
        codes: cloneCodes(context.codes),
        passthrough: context.passthrough,
      }];
    },
    pop(id) {
      const next = contexts.filter((context) => context.id !== id);
      const changed = next.length !== contexts.length;
      contexts = next;
      return changed;
    },
    active() {
      const merged: ActionCodesMap = {};
      for (let index = contexts.length - 1; index >= 0; index -= 1) {
        const context = contexts[index]!;
        for (const [action, codes] of Object.entries(context.codes)) {
          if (merged[action] === undefined) merged[action] = codes;
        }
        if (!context.passthrough) break;
      }
      return merged;
    },
    snapshot() {
      return { contexts: contexts.map((context) => ({ ...context, codes: cloneCodes(context.codes) })) };
    },
    restore(snapshot) {
      contexts = snapshot.contexts.map((context) => ({
        id: context.id,
        codes: cloneCodes(context.codes),
        passthrough: context.passthrough,
      }));
    },
  };
}
