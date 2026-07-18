import { catalogHandlers } from "./catalogs";
import { collectionHandlers } from "./collections";
import type { HandlerTable } from "./context";
import { documentHandlers } from "./document";
import { gridHandlers } from "./grids";
import { hierarchyHandlers } from "./hierarchy";
import { runtimeHandlers } from "./runtime";
import { terrainHandlers } from "./terrain";

/**
 * The complete method → handler dispatch table. Spreading the per-domain tables into a value typed
 * `HandlerTable` is the compile-time completeness check: if any union method lacks a handler (or a
 * domain misspells one), this assignment fails to type-check.
 */
export const EDITOR_RPC_HANDLERS: HandlerTable = {
  ...documentHandlers,
  ...catalogHandlers,
  ...terrainHandlers,
  ...hierarchyHandlers,
  ...collectionHandlers,
  ...gridHandlers,
  ...runtimeHandlers,
};

export type { HandlerContext } from "./context";
