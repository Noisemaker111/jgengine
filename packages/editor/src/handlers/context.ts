import type {
  DocumentLiveSync,
  EditorCatalogDefinition,
  EditorCommand,
  EditorSession,
  EditorSessionState,
} from "@jgengine/core/editor/index";
import type { EditorBridgeRequest, EditorBridgeResponse, EditorHostApi } from "../session";

/** Outcome of a guarded dispatch: whether it mutated the session, plus the resulting state. */
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
  gameId: string;
  catalogDefinitions: readonly EditorCatalogDefinition[];
  catalogById: ReadonlyMap<string, EditorCatalogDefinition>;
  dispatchGuarded: (command: EditorCommand) => DispatchOutcome;
}

/** One method's handler, with `request` narrowed to that method's union member. */
export type HandlerFor<M extends EditorBridgeRequest["method"]> = (
  ctx: HandlerContext,
  request: Extract<EditorBridgeRequest, { method: M }>,
) => EditorBridgeResponse;

/**
 * The full method → handler map. Spreading the per-domain tables into a value of this type is the
 * lockstep guarantee that every union method has exactly one handler: a missing verb fails to compile.
 */
export type HandlerTable = { [M in EditorBridgeRequest["method"]]: HandlerFor<M> };
