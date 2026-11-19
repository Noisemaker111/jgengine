import { catalogHandlers } from "./catalogs";
import { collectionHandlers } from "./collections";
import type { HandlerTable } from "./context";
import { documentHandlers } from "./document";
import { gridHandlers } from "./grids";
import { hierarchyHandlers } from "./hierarchy";
import { minimapHandlers } from "./minimap";
import { navMeshHandlers } from "./navmesh";
import { streetsHandlers } from "./streets";
import { runtimeHandlers } from "./runtime";
import { terrainHandlers } from "./terrain";

export const EDITOR_RPC_HANDLERS: HandlerTable = {
  ...documentHandlers,
  ...catalogHandlers,
  ...terrainHandlers,
  ...minimapHandlers,
  ...navMeshHandlers,
  ...streetsHandlers,
  ...hierarchyHandlers,
  ...collectionHandlers,
  ...gridHandlers,
  ...runtimeHandlers,
};

export type { HandlerContext } from "./context";
