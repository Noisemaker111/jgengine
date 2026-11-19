import type {
  DocumentLiveSync,
  EditorCatalogDefinition,
  EditorCommand,
  EditorSession,
  EditorSessionState,
} from "@jgengine/core/editor/index";
import type { TerrainField } from "@jgengine/core/terrain/terrain";
import type { EditorBridgeRequest, EditorBridgeResponse, EditorHostApi } from "../session";

export interface DispatchOutcome {
  applied: boolean;
  state: EditorSessionState;
}

/**
 * Everything a per-domain RPC handler needs from the host. Mutable host state (focus, mode, play
 * control, assets, visibility, perf) is reached through `api`'s getters/setters so handlers stay
 * closure-free and independently testable; `dispatchGuarded` and the catalog lookups are threaded in
 * because they are built once when the host is constructed.
 */
export interface HandlerContext {
  api: EditorHostApi;
  session: EditorSession;
  liveSync: DocumentLiveSync;
  persistAssetUrls?: boolean | undefined;
  gameId: string;
  catalogDefinitions: readonly EditorCatalogDefinition[];
  catalogById: ReadonlyMap<string, EditorCatalogDefinition>;
  dispatchGuarded: (command: EditorCommand) => DispatchOutcome;
  /** The live composed ground field from the mounted viewport (null when headless). Used by `bake_minimap`. */
  getTerrainSampler: () => TerrainField | null;
}

export type HandlerFor<M extends EditorBridgeRequest["method"]> = (
  ctx: HandlerContext,
  request: Extract<EditorBridgeRequest, { method: M }>,
) => EditorBridgeResponse;

export type HandlerTable = { [M in EditorBridgeRequest["method"]]: HandlerFor<M> };
