/**
 * Minimal MCP-compatible stdio server for the editor control plane.
 * Speaks JSON-RPC 2.0 over newline-delimited stdin/stdout (MCP transport).
 */

import { createEditorHost, type EditorBridgeRequest, type EditorHostApi, type EditorRunMode } from "../session";
import { loadGameCatalogs } from "./loadGameCatalogs.ts";
import { loadGameLayers } from "./loadGameLayers.ts";
import { decodeEditorBridgeRequest } from "./rpcRequest.ts";
import { EDITOR_MCP_TOOLS } from "./tools";

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
}

function respond(id: JsonRpcId | undefined, result: unknown): void {
  if (id === undefined) return;
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function respondError(id: JsonRpcId | undefined, code: number, message: string): void {
  if (id === undefined) return;
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`);
}

function toolToBridge(name: string, args: Record<string, unknown>): EditorBridgeRequest {
  switch (name) {
    case "editor_status":
      return { method: "editor_status" };
    case "list_layers":
      return { method: "list_layers" };
    case "list_catalogs":
      return { method: "list_catalogs" };
    case "get_catalog_entry":
      return {
        method: "get_catalog_entry",
        catalogId: String(args.catalogId ?? ""),
        entryId: String(args.entryId ?? ""),
      };
    case "set_catalog_entry":
      return {
        method: "set_catalog_entry",
        catalogId: String(args.catalogId ?? ""),
        entryId: String(args.entryId ?? ""),
        patch: (typeof args.patch === "object" && args.patch !== null ? args.patch : {}) as Record<string, unknown>,
        ...(typeof args.label === "string" ? { label: args.label } : {}),
      };
    case "add_catalog_entry":
      return {
        method: "add_catalog_entry",
        catalogId: String(args.catalogId ?? ""),
        entryId: String(args.entryId ?? ""),
        ...(typeof args.meta === "object" && args.meta !== null ? { meta: args.meta as Record<string, unknown> } : {}),
        ...(typeof args.label === "string" ? { label: args.label } : {}),
      };
    case "remove_catalog_entry":
      return {
        method: "remove_catalog_entry",
        catalogId: String(args.catalogId ?? ""),
        entryId: String(args.entryId ?? ""),
      };
    case "list_selection":
      return { method: "list_selection" };
    case "get_marker":
      return { method: "get_marker", id: String(args.id ?? "") };
    case "get_volume":
      return { method: "get_volume", id: String(args.id ?? "") };
    case "set_transform":
      return {
        method: "set_transform",
        id: String(args.id ?? ""),
        ...(typeof args.x === "number" ? { x: args.x } : {}),
        ...(typeof args.y === "number" ? { y: args.y } : {}),
        ...(typeof args.z === "number" ? { z: args.z } : {}),
        ...(typeof args.rotationY === "number" ? { rotationY: args.rotationY } : {}),
      };
    case "set_volume":
      return {
        method: "set_volume",
        id: String(args.id ?? ""),
        ...(typeof args.radius === "number" ? { radius: args.radius } : {}),
        ...(typeof args.height === "number" ? { height: args.height } : {}),
        ...(typeof args.x === "number" ? { x: args.x } : {}),
        ...(typeof args.y === "number" ? { y: args.y } : {}),
        ...(typeof args.z === "number" ? { z: args.z } : {}),
      };
    case "select":
      return {
        method: "select",
        ids: Array.isArray(args.ids) ? args.ids.map(String) : [],
      };
    case "camera_goto":
      return {
        method: "camera_goto",
        ...(typeof args.id === "string" ? { id: args.id } : {}),
        ...(typeof args.x === "number" ? { x: args.x } : {}),
        ...(typeof args.y === "number" ? { y: args.y } : {}),
        ...(typeof args.z === "number" ? { z: args.z } : {}),
      };
    case "camera_frame":
      return { method: "camera_frame" };
    case "scene_summary":
      return { method: "scene_summary" };
    case "export_document":
      return { method: "export_document" };
    case "import_document":
      return { method: "import_document", json: String(args.json ?? "") };
    case "undo":
      return { method: "undo" };
    case "redo":
      return { method: "redo" };
    case "list_assets":
      return { method: "list_assets" };
    case "place_asset":
      return {
        method: "place_asset",
        id: String(args.id ?? args.assetId ?? ""),
        ...(typeof args.x === "number" ? { x: args.x } : {}),
        ...(typeof args.y === "number" ? { y: args.y } : {}),
        ...(typeof args.z === "number" ? { z: args.z } : {}),
        ...(typeof args.kind === "string" ? { kind: args.kind } : {}),
      };
    case "set_mode":
      return { method: "set_mode", mode: String(args.mode ?? "") as EditorRunMode };
    case "perf_report":
      return { method: "perf_report" };
    case "set_path":
      return {
        method: "set_path",
        id: String(args.id ?? ""),
        ...(typeof args.kind === "string" ? { kind: args.kind } : {}),
        ...(typeof args.width === "number" ? { width: args.width } : {}),
        ...(typeof args.color === "string" ? { color: args.color } : {}),
        ...(typeof args.label === "string" ? { label: args.label } : {}),
        ...(typeof args.meta === "object" && args.meta !== null ? { meta: args.meta as Record<string, unknown> } : {}),
      };
    case "set_marker":
      return {
        method: "set_marker",
        id: String(args.id ?? ""),
        ...(typeof args.kind === "string" ? { kind: args.kind } : {}),
        ...(typeof args.color === "string" ? { color: args.color } : {}),
        ...(typeof args.label === "string" ? { label: args.label } : {}),
        ...(typeof args.rotationY === "number" ? { rotationY: args.rotationY } : {}),
        ...(typeof args.meta === "object" && args.meta !== null ? { meta: args.meta as Record<string, unknown> } : {}),
      };
    case "set_note":
      return {
        method: "set_note",
        id: String(args.id ?? ""),
        ...(typeof args.text === "string" ? { text: args.text } : {}),
        ...(typeof args.meta === "object" && args.meta !== null ? { meta: args.meta as Record<string, unknown> } : {}),
      };
    case "set_meta":
      return {
        method: "set_meta",
        id: String(args.id ?? ""),
        patch: (typeof args.patch === "object" && args.patch !== null ? args.patch : {}) as Record<string, unknown>,
      };
    case "apply_preset":
      return {
        method: "apply_preset",
        id: String(args.id ?? ""),
        preset: String(args.preset ?? ""),
      };
    case "push_document_patch":
      return {
        method: "push_document_patch",
        patch: args.patch as never,
        ...(args.force === true ? { force: true } : {}),
      };
    case "pull_document_patches":
      return {
        method: "pull_document_patches",
        ...(typeof args.sinceRevision === "number" ? { sinceRevision: args.sinceRevision } : {}),
      };
    case "document_revision":
      return {
        method: "document_revision",
        ...(args.includeDocument === true ? { includeDocument: true } : {}),
      };
    case "push_runtime_delta":
      return {
        method: "push_runtime_delta",
        ...(typeof args.at === "number" ? { at: args.at } : {}),
        ...(Array.isArray(args.entities) ? { entities: args.entities as never } : {}),
        ...(Array.isArray(args.removeIds) ? { removeIds: args.removeIds.map(String) } : {}),
        ...(typeof args.tunables === "object" && args.tunables !== null
          ? { tunables: args.tunables as Record<string, unknown> }
          : {}),
      };
    case "pull_runtime_deltas":
      return {
        method: "pull_runtime_deltas",
        ...(typeof args.sinceSeq === "number" ? { sinceSeq: args.sinceSeq } : {}),
        ...(args.includeSnapshot === true ? { includeSnapshot: true } : {}),
      };
    case "runtime_snapshot":
      return { method: "runtime_snapshot" };
    case "runtime_summary":
      return { method: "runtime_summary" };
    case "runtime_get":
      return {
        method: "runtime_get",
        id: String(args.id ?? ""),
        ...(typeof args.path === "string" ? { path: args.path } : {}),
      };
    case "runtime_set":
      return {
        method: "runtime_set",
        id: String(args.id ?? ""),
        ...(typeof args.path === "string" ? { path: args.path } : {}),
        ...(args.value !== undefined ? { value: args.value } : {}),
        ...(typeof args.position === "object" && args.position !== null
          ? { position: args.position as { x: number; y: number; z: number } }
          : {}),
        ...(typeof args.rotationY === "number" ? { rotationY: args.rotationY } : {}),
        ...(typeof args.values === "object" && args.values !== null
          ? { values: args.values as Record<string, unknown> }
          : {}),
        ...(typeof args.writeBack === "boolean" ? { writeBack: args.writeBack } : {}),
      };
    case "runtime_pause":
      return { method: "runtime_pause" };
    case "runtime_resume":
      return { method: "runtime_resume" };
    case "runtime_step":
      return {
        method: "runtime_step",
        ...(typeof args.frames === "number" ? { frames: args.frames } : {}),
      };
    case "set_runtime_override":
      return { method: "set_runtime_override", entity: args.entity as never };
    case "clear_runtime_override":
      return { method: "clear_runtime_override", id: String(args.id ?? "") };
    case "write_back_override":
      return { method: "write_back_override", id: String(args.id ?? "") };
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

async function resolveEditorHost(gameId: string): Promise<EditorHostApi> {
  const [layers, catalogs] = await Promise.all([loadGameLayers(gameId), loadGameCatalogs(gameId)]);
  if (!layers.ok) {
    throw new Error(`invalid editorLayers for ${gameId}: ${layers.errors.map((e) => `${e.path} ${e.message}`).join("; ")}`);
  }
  if (!catalogs.ok) {
    throw new Error(`invalid editorCatalogs for ${gameId}: ${catalogs.errors.map((e) => `${e.path} ${e.message}`).join("; ")}`);
  }
  return createEditorHost({ gameId, layers: layers.document, catalogs: catalogs.catalogs }).api;
}

/** Runs the editor as a stdio MCP server so an agent can drive it via tools/call. */
export async function runEditorMcpStdio(options: {
  gameId: string;
  host?: EditorHostApi;
}): Promise<void> {
  const host = options.host ?? (await resolveEditorHost(options.gameId));

  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    for (;;) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) break;
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line.length === 0) continue;
      let message: JsonRpcRequest;
      try {
        message = JSON.parse(line) as JsonRpcRequest;
      } catch {
        continue;
      }
      const id = message.id;
      const method = message.method ?? "";
      const params = message.params ?? {};

      try {
        if (method === "initialize") {
          respond(id, {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "jgengine-editor", version: "0.1.0" },
          });
          continue;
        }
        if (method === "notifications/initialized" || method === "initialized") {
          continue;
        }
        if (method === "tools/list") {
          respond(id, {
            tools: EDITOR_MCP_TOOLS.map((tool) => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
            })),
          });
          continue;
        }
        if (method === "tools/call") {
          const name = String(params.name ?? "");
          const args = (params.arguments ?? {}) as Record<string, unknown>;
          const bridge = toolToBridge(name, args);
          // Re-validate the assembled request at the same boundary the HTTP/CLI paths use, so the
          // complex nested fields (`patch`, `entities`, `entity`) that toolToBridge passes through
          // untyped are type-checked before they reach a live session instead of cast blind.
          const decoded = decodeEditorBridgeRequest(bridge);
          const result = decoded.ok
            ? host.handle(decoded.request)
            : { ok: false as const, error: decoded.errors.map((e) => `${e.path} ${e.message}`).join("; ") };
          respond(id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            isError: !result.ok,
          });
          continue;
        }
        if (method === "ping") {
          respond(id, {});
          continue;
        }
        respondError(id, -32601, `Method not found: ${method}`);
      } catch (error) {
        respondError(id, -32000, error instanceof Error ? error.message : String(error));
      }
    }
  });
}
