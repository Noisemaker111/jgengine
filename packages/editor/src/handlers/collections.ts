import { findEditorCollection, type EditorCollection } from "@jgengine/core/editor/index";

import type { EditorBridgeResponse } from "../session";
import type { HandlerContext, HandlerTable } from "./context";

/** Runs `fn` with the named collection, or short-circuits with an honest not-found response. */
function withCollection(
  ctx: HandlerContext,
  id: string,
  fn: (collection: EditorCollection) => EditorBridgeResponse,
): EditorBridgeResponse {
  const collection = findEditorCollection(ctx.session.getState().document, id);
  if (collection === undefined) return { ok: false, error: `collection not found: ${id}` };
  return fn(collection);
}

/** Named collection / selection-set verbs. */
export const collectionHandlers: Pick<
  HandlerTable,
  | "list_collections"
  | "create_collection"
  | "rename_collection"
  | "delete_collection"
  | "set_collection_members"
  | "add_to_collection"
  | "remove_from_collection"
  | "set_collection_flags"
  | "select_collection"
> = {
  list_collections: (ctx) => ({ ok: true, result: { collections: ctx.session.getState().document.collections } }),
  create_collection: (ctx, request) => {
    ctx.session.dispatch({
      type: "createCollection",
      id: request.id,
      name: request.name,
      ...(request.memberIds === undefined ? {} : { memberIds: request.memberIds }),
    });
    return { ok: true, result: findEditorCollection(ctx.session.getState().document, request.id) };
  },
  rename_collection: (ctx, request) =>
    withCollection(ctx, request.id, () => {
      ctx.session.dispatch({ type: "renameCollection", id: request.id, name: request.name });
      return { ok: true, result: findEditorCollection(ctx.session.getState().document, request.id) };
    }),
  delete_collection: (ctx, request) =>
    withCollection(ctx, request.id, () => {
      ctx.session.dispatch({ type: "deleteCollection", id: request.id });
      return { ok: true, result: { collections: ctx.session.getState().document.collections } };
    }),
  set_collection_members: (ctx, request) =>
    withCollection(ctx, request.id, () => {
      ctx.session.dispatch({ type: "setCollectionMembers", id: request.id, memberIds: request.memberIds });
      return { ok: true, result: findEditorCollection(ctx.session.getState().document, request.id) };
    }),
  add_to_collection: (ctx, request) =>
    withCollection(ctx, request.id, () => {
      ctx.session.dispatch({ type: "addToCollection", id: request.id, ids: request.ids });
      return { ok: true, result: findEditorCollection(ctx.session.getState().document, request.id) };
    }),
  remove_from_collection: (ctx, request) =>
    withCollection(ctx, request.id, () => {
      ctx.session.dispatch({ type: "removeFromCollection", id: request.id, ids: request.ids });
      return { ok: true, result: findEditorCollection(ctx.session.getState().document, request.id) };
    }),
  set_collection_flags: (ctx, request) =>
    withCollection(ctx, request.id, () => {
      ctx.session.dispatch({
        type: "setCollectionFlags",
        id: request.id,
        patch: {
          ...(request.color === undefined ? {} : { color: request.color }),
          ...(request.locked === undefined ? {} : { locked: request.locked }),
          ...(request.visible === undefined ? {} : { visible: request.visible }),
        },
      });
      return { ok: true, result: findEditorCollection(ctx.session.getState().document, request.id) };
    }),
  select_collection: (ctx, request) =>
    withCollection(ctx, request.id, () => {
      ctx.session.dispatch({ type: "selectCollection", id: request.id });
      return { ok: true, result: { selection: ctx.session.getState().selection } };
    }),
};
