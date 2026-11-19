import type { EditorBridgeRequest, EditorBridgeResponse, EditorHostApi } from "../session";
import { decodeEditorBridgeRequest } from "../mcp/rpcRequest";
import { emitEditorConsole } from "../shell/consoleSink";

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AgentToolResult {
  id: string;
  name: string;
  ok: boolean;
  result?: unknown;
  error?: string | undefined;
  mutated: boolean;
  patchSummary: string;
}

/** Methods that never write the document (no undo step). */
const READ_ONLY_METHODS = new Set<string>([
  "editor_status",
  "list_layers",
  "list_selection",
  "get_marker",
  "get_volume",
  "camera_goto",
  "camera_frame",
  "scene_summary",
  "get_simulation",
  "set_simulation",
  "export_document",
  "list_assets",
  "perf_report",
  "terrain_summary",
  "terrain_materials",
  "terrain_layers",
  "scatter_summary",
  "hierarchy",
  "list_prefabs",
  "list_collections",
  "list_generators",
  "generator_variants",
]);

/** @internal Builds an editor RPC request from a tool name + args (tool name ≡ method). */
export function toolCallToRequest(call: AgentToolCall): { ok: true; request: EditorBridgeRequest } | { ok: false; error: string } {
  const payload: Record<string, unknown> = { method: call.name, ...call.arguments };
  const decoded = decodeEditorBridgeRequest(payload);
  if (!decoded.ok) {
    const detail = decoded.errors.map((e) => `${e.path}: ${e.message}`).join("; ");
    return { ok: false, error: detail };
  }
  return { ok: true, request: decoded.request };
}

function summarizeCall(name: string, args: Record<string, unknown>, response: EditorBridgeResponse, mutated: boolean): string {
  if (!response.ok) return `${name} failed: ${response.error ?? "unknown error"}`;
  if (mutated) {
    const id = typeof args["id"] === "string" ? args["id"] : undefined;
    const ids = Array.isArray(args["ids"]) ? (args["ids"] as string[]).join(",") : undefined;
    const target = id ?? ids;
    return target !== undefined && target.length > 0 ? `${name} · ${target}` : name;
  }
  return `${name} (read)`;
}

export function routeToolCall(api: EditorHostApi, call: AgentToolCall): AgentToolResult {
  const built = toolCallToRequest(call);
  if (!built.ok) {
    emitEditorConsole("error", "agent", `${call.name} rejected: ${built.error}`);
    return {
      id: call.id,
      name: call.name,
      ok: false,
      error: built.error,
      mutated: false,
      patchSummary: `${call.name} rejected: ${built.error}`,
    };
  }

  emitEditorConsole("info", "agent", `tool ${call.name}`);
  const session = api.getSession();
  const before = session.exportJson(false);
  let response: EditorBridgeResponse;
  try {
    // RPC failures are logged once by the host handle sink; agent layer only records the call.
    response = api.handle(built.request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitEditorConsole("error", "agent", `${call.name} threw: ${message}`);
    return {
      id: call.id,
      name: call.name,
      ok: false,
      error: message,
      mutated: false,
      patchSummary: `${call.name} threw: ${message}`,
    };
  }
  const after = session.exportJson(false);
  const mutated =
    !READ_ONLY_METHODS.has(call.name) && before !== after && response.ok === true;

  return {
    id: call.id,
    name: call.name,
    ok: response.ok,
    result: response.result,
    error: response.error,
    mutated,
    patchSummary: summarizeCall(call.name, call.arguments, response, mutated),
  };
}

/** @internal Routes every tool call in order; returns one result per call. */
export function routeToolCalls(api: EditorHostApi, calls: readonly AgentToolCall[]): AgentToolResult[] {
  return calls.map((call) => routeToolCall(api, call));
}
