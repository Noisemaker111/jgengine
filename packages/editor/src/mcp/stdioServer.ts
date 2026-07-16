/**
 * Minimal MCP-compatible stdio server for the editor control plane.
 * Speaks JSON-RPC 2.0 over newline-delimited stdin/stdout (MCP transport).
 */

import { createEditorHost, type EditorBridgeRequest, type EditorHostApi, type EditorRunMode } from "../session";
import { loadGameCatalogs } from "./loadGameCatalogs.ts";
import { loadGameLayers } from "./loadGameLayers.ts";
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
          const result = host.handle(bridge);
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
