import {
  editorChildren,
  editorParentOf,
  editorRoots,
  findEditorPrefab,
  summarizeEditorSession,
} from "@jgengine/core/editor/index";

import type { HandlerTable } from "./context";

/** Parent/child hierarchy and prefab library verbs. */
export const hierarchyHandlers: Pick<
  HandlerTable,
  | "set_parent"
  | "hierarchy"
  | "list_prefabs"
  | "create_prefab"
  | "insert_prefab"
  | "detach_prefab_instance"
  | "delete_prefab"
> = {
  set_parent: (ctx, request) => {
    const { applied, state } = ctx.dispatchGuarded({ type: "setParent", ids: request.ids, parentId: request.parentId });
    if (!applied) return { ok: false, error: "set_parent rejected: cyclic parent or empty selection" };
    const doc = state.document;
    return {
      ok: true,
      result: { roots: editorRoots(doc), parents: request.ids.map((id) => ({ id, parentId: editorParentOf(doc, id) ?? null })) },
    };
  },
  hierarchy: (ctx) => {
    const doc = ctx.session.getState().document;
    const roots = editorRoots(doc);
    return { ok: true, result: { roots, tree: roots.map((id) => ({ id, children: editorChildren(doc, id) })) } };
  },
  list_prefabs: (ctx) => ({ ok: true, result: { prefabs: ctx.session.getState().document.prefabs } }),
  create_prefab: (ctx, request) => {
    if (request.ids.length === 0) return { ok: false, error: "create_prefab needs at least one id" };
    ctx.session.dispatch({ type: "createPrefab", id: request.id, name: request.name, ids: request.ids });
    const prefab = findEditorPrefab(ctx.session.getState().document, request.id);
    return prefab === undefined ? { ok: false, error: `prefab not created: ${request.id}` } : { ok: true, result: prefab };
  },
  insert_prefab: (ctx, request) => {
    const prefab = findEditorPrefab(ctx.session.getState().document, request.prefabId);
    if (prefab === undefined) return { ok: false, error: `prefab not found: ${request.prefabId}` };
    const at = ctx.api.getFocusTarget() ?? { x: 0, y: 0, z: 0 };
    ctx.session.dispatch({
      type: "insertPrefab",
      prefabId: request.prefabId,
      at: { x: request.x ?? at.x, y: request.y ?? at.y, z: request.z ?? at.z },
    });
    return { ok: true, result: summarizeEditorSession(ctx.session.getState()) };
  },
  detach_prefab_instance: (ctx, request) => {
    const doc = ctx.session.getState().document;
    const carries = (item: { meta?: Record<string, unknown> }) => item.meta?.prefabInstanceId === request.instanceId;
    const hasInstance =
      doc.markers.some(carries) || doc.volumes.some(carries) || doc.paths.some(carries) || doc.annotations.some(carries);
    if (!hasInstance) return { ok: false, error: `prefab instance not found: ${request.instanceId}` };
    ctx.session.dispatch({ type: "detachPrefabInstance", instanceId: request.instanceId });
    return { ok: true, result: summarizeEditorSession(ctx.session.getState()) };
  },
  delete_prefab: (ctx, request) => {
    if (findEditorPrefab(ctx.session.getState().document, request.prefabId) === undefined) {
      return { ok: false, error: `prefab not found: ${request.prefabId}` };
    }
    ctx.session.dispatch({ type: "deletePrefab", prefabId: request.prefabId });
    return { ok: true, result: { prefabs: ctx.session.getState().document.prefabs } };
  },
};
