import {
  decodeEditorDocument,
  getRuntimeInspectorValue,
  planRuntimeInspectorSet,
  runtimeEntityMetaWriteBackCommand,
  runtimeEntityWriteBackCommand,
  summarizeEditorSession,
  summarizeRuntimeInspector,
  type DocumentPatch,
} from "@jgengine/core/editor/index";

import type { HandlerTable } from "./context";

/** Live-sync document patches, the ephemeral runtime reverse channel, and play-mode poke verbs. */
export const runtimeHandlers: Pick<
  HandlerTable,
  | "push_document_patch"
  | "pull_document_patches"
  | "document_revision"
  | "push_runtime_delta"
  | "pull_runtime_deltas"
  | "runtime_snapshot"
  | "runtime_summary"
  | "runtime_get"
  | "runtime_set"
  | "runtime_pause"
  | "runtime_resume"
  | "runtime_step"
  | "set_runtime_override"
  | "clear_runtime_override"
  | "write_back_override"
> = {
  push_document_patch: (ctx, request) => {
    const force = request.force === true;
    const rawPatch: unknown = request.patch;
    if (rawPatch === null || typeof rawPatch !== "object") {
      return { ok: false, error: "push_document_patch requires a patch object" };
    }
    const patch = rawPatch as DocumentPatch;
    if (patch.type !== "snapshot" && patch.type !== "commands") {
      return { ok: false, error: `unknown document patch type: ${String((patch as { type?: unknown }).type)} (snapshot | commands)` };
    }
    if (typeof patch.baseRevision !== "number") {
      return { ok: false, error: "push_document_patch requires a numeric baseRevision" };
    }
    if (!force && patch.baseRevision !== ctx.liveSync.getRevision()) {
      return { ok: false, error: `baseRevision mismatch: patch=${patch.baseRevision} current=${ctx.liveSync.getRevision()}` };
    }
    if (patch.type === "snapshot") {
      // A snapshot replaces the whole document, so it must clear the same decode/migrate boundary a
      // disk or `import_document` document does — otherwise a fuzzed snapshot would reach
      // `replaceDocument` uncoerced.
      const decoded = decodeEditorDocument(patch.document);
      if (!decoded.ok) {
        return { ok: false, error: `invalid snapshot document: ${decoded.errors.map((e) => `${e.path} ${e.message}`).join("; ")}` };
      }
      ctx.session.dispatch({ type: "replaceDocument", document: decoded.document });
      return { ok: true, result: { revision: ctx.liveSync.getRevision(), ...summarizeEditorSession(ctx.session.getState()) } };
    }
    if (!Array.isArray(patch.commands)) return { ok: false, error: "commands patch requires a commands array" };
    if (patch.commands.length === 0) return { ok: false, error: "commands patch is empty" };
    for (const command of patch.commands) {
      const { applied } = ctx.dispatchGuarded(command);
      if (!applied && command.type !== "select" && command.type !== "clearSelection") {
        return { ok: false, error: `${command.type} rejected while applying patch` };
      }
    }
    return { ok: true, result: { revision: ctx.liveSync.getRevision(), ...summarizeEditorSession(ctx.session.getState()) } };
  },
  pull_document_patches: (ctx, request) => ({
    ok: true,
    result: { revision: ctx.liveSync.getRevision(), patches: ctx.liveSync.pullPatches(request.sinceRevision ?? 0) },
  }),
  document_revision: (ctx, request) => ({
    ok: true,
    result: {
      revision: ctx.liveSync.getRevision(),
      ...(request.includeDocument === true ? { document: ctx.liveSync.getDocument() } : {}),
    },
  }),
  push_runtime_delta: (ctx, request) => {
    const delta = ctx.liveSync.pushRuntimeDelta({
      at: request.at ?? Date.now(),
      ...(request.entities === undefined ? {} : { entities: request.entities }),
      ...(request.removeIds === undefined ? {} : { removeIds: request.removeIds }),
      ...(request.tunables === undefined ? {} : { tunables: request.tunables }),
    });
    return { ok: true, result: delta };
  },
  pull_runtime_deltas: (ctx, request) => ({
    ok: true,
    result: {
      seq: ctx.liveSync.getRuntimeState().seq,
      deltas: ctx.liveSync.pullRuntimeDeltas(request.sinceSeq ?? 0),
      ...(request.includeSnapshot === true ? { snapshot: ctx.liveSync.getRuntimeState() } : {}),
    },
  }),
  runtime_snapshot: (ctx) => ({ ok: true, result: ctx.liveSync.getRuntimeState() }),
  runtime_summary: (ctx) => ({
    ok: true,
    result: summarizeRuntimeInspector(ctx.liveSync.getRuntimeState(), ctx.liveSync.getRuntimeOverrides(), ctx.api.getPlayControl()),
  }),
  runtime_get: (ctx, request) => {
    if (request.id.length === 0) return { ok: false, error: "runtime_get requires id" };
    const got = getRuntimeInspectorValue(ctx.liveSync.getRuntimeState(), ctx.liveSync.getRuntimeOverrides(), request.id, request.path);
    if (got.kind === "missing") return { ok: false, error: `runtime entity/tunable not found: ${request.id}` };
    return { ok: true, result: got };
  },
  runtime_set: (ctx, request) => {
    if (request.id.length === 0) return { ok: false, error: "runtime_set requires id" };
    const plan = planRuntimeInspectorSet(ctx.session.getState().document, {
      id: request.id,
      ...(request.path === undefined ? {} : { path: request.path }),
      ...(request.value === undefined ? {} : { value: request.value }),
      ...(request.position === undefined ? {} : { position: request.position }),
      ...(request.rotationY === undefined ? {} : { rotationY: request.rotationY }),
      ...(request.values === undefined ? {} : { values: request.values }),
      ...(request.writeBack === undefined ? {} : { writeBack: request.writeBack }),
    });
    if (plan.error !== undefined) return { ok: false, error: plan.error };
    if (plan.tunable !== undefined) {
      ctx.liveSync.pushRuntimeDelta({ at: Date.now(), tunables: { [plan.tunable.key]: plan.tunable.value } });
      return {
        ok: true,
        result: {
          kind: "tunable",
          key: plan.tunable.key,
          value: plan.tunable.value,
          writeBack: false,
          ...summarizeRuntimeInspector(ctx.liveSync.getRuntimeState(), ctx.liveSync.getRuntimeOverrides(), ctx.api.getPlayControl()),
        },
      };
    }
    if (plan.entity === undefined) return { ok: false, error: "runtime_set produced no entity" };
    // Apply the document write-back first so a rejected command leaves the document — and the reverse
    // channel — untouched. Any commands that did land are undone before bailing, keeping the edit atomic.
    let wroteBack = false;
    let appliedCount = 0;
    let lastState = ctx.session.getState();
    for (const command of plan.writeBackCommands) {
      const { applied, state } = ctx.dispatchGuarded(command);
      if (!applied) {
        for (let i = 0; i < appliedCount; i += 1) ctx.session.dispatch({ type: "undo" });
        return { ok: false, error: `runtime_set write-back rejected: ${command.type}` };
      }
      appliedCount += 1;
      lastState = state;
      wroteBack = true;
    }
    // Only publish the ephemeral override + delta once the document write-back (if any) has committed.
    ctx.liveSync.setRuntimeOverride(plan.entity);
    ctx.liveSync.pushRuntimeDelta({ at: Date.now(), entities: [plan.entity] });
    if (wroteBack) ctx.liveSync.clearRuntimeOverride(plan.entity.id);
    return {
      ok: true,
      result: {
        kind: "entity",
        entity: plan.entity,
        writeBack: wroteBack,
        revision: ctx.liveSync.getRevision(),
        ...summarizeEditorSession(lastState),
      },
    };
  },
  runtime_pause: (ctx) => {
    const play = ctx.api.setPlayControl({ paused: true, pendingSteps: 0 });
    ctx.liveSync.pushRuntimeDelta({ at: Date.now(), tunables: { paused: true } });
    return { ok: true, result: { play } };
  },
  runtime_resume: (ctx) => {
    const play = ctx.api.setPlayControl({ paused: false, pendingSteps: 0 });
    ctx.liveSync.pushRuntimeDelta({ at: Date.now(), tunables: { paused: false } });
    return { ok: true, result: { play } };
  },
  runtime_step: (ctx, request) => {
    const frames = request.frames === undefined ? 1 : Math.max(1, Math.floor(request.frames));
    // Thread the applied control back so the published delta agrees with the incremented step count.
    const play = ctx.api.setPlayControl({ paused: true, pendingSteps: ctx.api.getPlayControl().pendingSteps + frames });
    ctx.liveSync.pushRuntimeDelta({ at: Date.now(), tunables: { paused: true, pendingSteps: play.pendingSteps } });
    return { ok: true, result: { play } };
  },
  set_runtime_override: (ctx, request) => {
    ctx.liveSync.setRuntimeOverride(request.entity);
    return { ok: true, result: { overrides: ctx.liveSync.getRuntimeOverrides() } };
  },
  clear_runtime_override: (ctx, request) => {
    ctx.liveSync.clearRuntimeOverride(request.id);
    return { ok: true, result: { overrides: ctx.liveSync.getRuntimeOverrides() } };
  },
  write_back_override: (ctx, request) => {
    const entity = ctx.liveSync.getRuntimeOverrides()[request.id];
    if (entity === undefined) return { ok: false, error: `no runtime override for "${request.id}"` };
    const transform = runtimeEntityWriteBackCommand(ctx.session.getState().document, entity);
    const meta = runtimeEntityMetaWriteBackCommand(ctx.session.getState().document, entity);
    if (transform === null && meta === null) {
      return { ok: false, error: `override "${request.id}" has nothing to write back into the document` };
    }
    let lastState = ctx.session.getState();
    for (const command of [transform, meta]) {
      if (command === null) continue;
      const { applied, state } = ctx.dispatchGuarded(command);
      if (!applied) return { ok: false, error: `write_back_override rejected for "${request.id}"` };
      lastState = state;
    }
    ctx.liveSync.clearRuntimeOverride(request.id);
    return { ok: true, result: { revision: ctx.liveSync.getRevision(), ...summarizeEditorSession(lastState) } };
  },
};
