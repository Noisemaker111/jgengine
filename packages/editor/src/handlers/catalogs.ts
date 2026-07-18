import { findEditorCatalog, findEditorCatalogEntry } from "@jgengine/core/editor/index";
import { parseParams, validateParams } from "@jgengine/core/scene/sceneKinds";

import type { HandlerTable } from "./context";

/** Gameplay data catalog verbs (list / get / merge-patch / add / remove rows). */
export const catalogHandlers: Pick<
  HandlerTable,
  "list_catalogs" | "get_catalog_entry" | "set_catalog_entry" | "add_catalog_entry" | "remove_catalog_entry"
> = {
  list_catalogs: (ctx) => {
    const state = ctx.session.getState();
    const catalogs = ctx.catalogDefinitions.map((definition) => {
      const data = findEditorCatalog(state.document, definition.id);
      return {
        id: definition.id,
        label: definition.label,
        schema: definition.schema,
        entryCount: data?.entries.length ?? definition.entries.length,
        entries: (data?.entries ?? definition.entries).map((entry) => ({ id: entry.id, label: entry.label })),
      };
    });
    return { ok: true, result: { catalogs } };
  },
  get_catalog_entry: (ctx, request) => {
    const definition = ctx.catalogById.get(request.catalogId);
    if (definition === undefined) return { ok: false, error: `catalog not found: ${request.catalogId}` };
    const entry = findEditorCatalogEntry(ctx.session.getState().document, request.catalogId, request.entryId);
    if (entry === undefined) return { ok: false, error: `catalog entry not found: ${request.catalogId}/${request.entryId}` };
    return { ok: true, result: { catalogId: request.catalogId, label: definition.label, schema: definition.schema, entry } };
  },
  set_catalog_entry: (ctx, request) => {
    const definition = ctx.catalogById.get(request.catalogId);
    if (definition === undefined) return { ok: false, error: `catalog not found: ${request.catalogId}` };
    const current = findEditorCatalogEntry(ctx.session.getState().document, request.catalogId, request.entryId);
    if (current === undefined) return { ok: false, error: `catalog entry not found: ${request.catalogId}/${request.entryId}` };
    const merged = { ...current.meta, ...request.patch };
    const invalid = validateParams(definition.schema, merged);
    if (invalid.length > 0) {
      return { ok: false, error: `invalid ${request.catalogId} params: ${invalid.map((issue) => `${issue.key} (${issue.message})`).join(", ")}` };
    }
    const coalesceKey =
      Object.keys(request.patch).length === 1
        ? `catalog:${request.catalogId}:${request.entryId}:${Object.keys(request.patch)[0]}`
        : `catalog:${request.catalogId}:${request.entryId}`;
    const before = ctx.session.getState();
    const state = ctx.session.dispatch(
      {
        type: "setCatalogEntry",
        catalogId: request.catalogId,
        entryId: request.entryId,
        patch: { meta: merged, ...(request.label === undefined ? {} : { label: request.label }) },
      },
      { coalesce: coalesceKey },
    );
    if (state === before) {
      return { ok: false, error: `set_catalog_entry rejected: ${request.catalogId}/${request.entryId}` };
    }
    const entry = findEditorCatalogEntry(state.document, request.catalogId, request.entryId);
    return { ok: true, result: { catalogId: request.catalogId, entry } };
  },
  add_catalog_entry: (ctx, request) => {
    const definition = ctx.catalogById.get(request.catalogId);
    if (definition === undefined) return { ok: false, error: `catalog not found: ${request.catalogId}` };
    const entryId = request.entryId.trim();
    if (entryId.length === 0) return { ok: false, error: "add_catalog_entry: entryId is required" };
    if (findEditorCatalogEntry(ctx.session.getState().document, request.catalogId, entryId) !== undefined) {
      return { ok: false, error: `catalog entry already exists: ${request.catalogId}/${entryId}` };
    }
    // Seed a new row's meta from the schema defaults, then overlay any provided values, so the
    // row is schema-valid the moment it lands — the same contract set_catalog_entry enforces.
    const seeded = parseParams(definition.schema, request.meta) as Record<string, unknown>;
    const meta = { ...seeded, ...request.meta };
    const invalid = validateParams(definition.schema, meta);
    if (invalid.length > 0) {
      return { ok: false, error: `invalid ${request.catalogId} params: ${invalid.map((issue) => `${issue.key} (${issue.message})`).join(", ")}` };
    }
    ctx.session.dispatch({
      type: "addCatalogEntry",
      catalogId: request.catalogId,
      entry: { id: entryId, ...(request.label === undefined ? {} : { label: request.label }), meta },
    });
    const entry = findEditorCatalogEntry(ctx.session.getState().document, request.catalogId, entryId);
    return { ok: true, result: { catalogId: request.catalogId, entry } };
  },
  remove_catalog_entry: (ctx, request) => {
    const definition = ctx.catalogById.get(request.catalogId);
    if (definition === undefined) return { ok: false, error: `catalog not found: ${request.catalogId}` };
    const before = ctx.session.getState();
    const state = ctx.session.dispatch({ type: "removeCatalogEntry", catalogId: request.catalogId, entryId: request.entryId });
    if (state === before) {
      return { ok: false, error: `catalog entry not found: ${request.catalogId}/${request.entryId}` };
    }
    return { ok: true, result: { catalogId: request.catalogId, entryId: request.entryId } };
  },
};
