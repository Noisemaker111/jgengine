import type { EntityMovement, SceneEntity } from "./entityStore";

export interface FormDef {
  id: string;
  movement?: EntityMovement;
  abilities?: readonly string[];
  model?: string;
}

export interface FormChangedEvent {
  instanceId: string;
  formId: string | null;
}

export interface FormEntities {
  get(id: string): SceneEntity | null;
  update(id: string, patch: { movement?: EntityMovement; name?: string }): boolean;
}

export interface FormTime {
  after(seconds: number, callback: () => void): () => void;
}

export interface FormEvents {
  emit(name: "form.changed", payload: FormChangedEvent): void;
}

export interface FormsDeps {
  entities: FormEntities;
  time: FormTime;
  events?: FormEvents;
}

export interface Forms {
  register(defs: readonly FormDef[]): void;
  get(formId: string): FormDef | null;
  abilities(instanceId: string): readonly string[] | null;
  active(instanceId: string): string | null;
  shapeshift(instanceId: string, formId: string, durationSeconds?: number): { reason: string } | null;
  revert(instanceId: string): void;
}

interface FormBaseline {
  movement: EntityMovement;
  name: string;
}

interface FormRuntimeState {
  baseline: FormBaseline;
  formId: string;
  cancelTimer: (() => void) | null;
}

export function createForms(deps: FormsDeps): Forms {
  const defs = new Map<string, FormDef>();
  const runtime = new Map<string, FormRuntimeState>();

  function emitChange(instanceId: string, formId: string | null): void {
    deps.events?.emit("form.changed", { instanceId, formId });
  }

  function revertInternal(instanceId: string): void {
    const state = runtime.get(instanceId);
    if (state === undefined) return;
    state.cancelTimer?.();
    runtime.delete(instanceId);
    deps.entities.update(instanceId, { movement: state.baseline.movement, name: state.baseline.name });
    emitChange(instanceId, null);
  }

  return {
    register(list) {
      for (const def of list) defs.set(def.id, def);
    },
    get(formId) {
      return defs.get(formId) ?? null;
    },
    abilities(instanceId) {
      const state = runtime.get(instanceId);
      if (state === undefined) return null;
      return defs.get(state.formId)?.abilities ?? null;
    },
    active(instanceId) {
      return runtime.get(instanceId)?.formId ?? null;
    },
    shapeshift(instanceId, formId, durationSeconds) {
      const def = defs.get(formId);
      if (def === undefined) return { reason: `unknown form "${formId}"` };
      const entity = deps.entities.get(instanceId);
      if (entity === null) return { reason: `entity "${instanceId}" is not spawned` };

      const existing = runtime.get(instanceId);
      existing?.cancelTimer?.();
      const baseline: FormBaseline = existing?.baseline ?? { movement: entity.movement, name: entity.name };

      deps.entities.update(instanceId, {
        movement: def.movement ?? baseline.movement,
        name: def.model ?? baseline.name,
      });

      const cancelTimer =
        durationSeconds === undefined ? null : deps.time.after(durationSeconds, () => revertInternal(instanceId));

      runtime.set(instanceId, { baseline, formId, cancelTimer });
      emitChange(instanceId, formId);
      return null;
    },
    revert(instanceId) {
      revertInternal(instanceId);
    },
  };
}
