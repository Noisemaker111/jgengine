#!/usr/bin/env bun
/**
 * Headless editor control plane for agents.
 *
 * Usage:
 *   bun packages/editor/src/mcp/cli.ts --game the-robots --rpc '{"method":"scene_summary"}'
 *   bun packages/editor/src/mcp/cli.ts --game the-robots --rpc-file payload.json
 *   bun packages/editor/src/mcp/cli.ts --game the-robots --rpc - < payload.json
 *   bun packages/editor/src/mcp/cli.ts --game the-robots --serve
 *   bun packages/editor/src/mcp/cli.ts --game the-robots --stdio
 */

import { createEditorHost } from "../session";
import { startEditorBridgeServerNode } from "./bridgeServer.node.ts";
import { loadGameCatalogs } from "./loadGameCatalogs.ts";
import { loadGameLayers } from "./loadGameLayers.ts";
import { decodeEditorBridgeRequest } from "./rpcRequest.ts";
import { loadRpcPayload, type RpcPayloadSource } from "./rpcPayload.ts";
import { runEditorMcpStdio } from "./stdioServer.ts";
import { EDITOR_MCP_TOOLS } from "./tools";

function printHelp(): void {
  console.log(`jgengine editor-mcp

  --game <id>          game id under Games/ (default the-robots)
  --port <n>           HTTP bridge port (default 17373)
  --rpc '<json>'       run an RPC and exit; repeat to run several in order on one session
  --stdio              MCP JSON-RPC over stdin/stdout
  --tools              list MCP tool names
  --serve              keep the localhost HTTP bridge up (default when no --rpc/--rpc-file/--stdio)
`);
}

/** Parsed CLI flags for the headless editor control plane. */
export type EditorCliOptions = {
  gameId: string;
  port: number;
  rpcSources: RpcPayloadSource[];
  serve: boolean;
  stdio: boolean;
};

/**
 * Parses argv into editor-mcp flags. `--rpc -` and `--rpc-file` both set a non-inline
 * {@link RpcPayloadSource} so large documents never ride a shell argument.
 * @internal
 */
export function parseEditorCliArgs(argv: string[]): EditorCliOptions {
  let gameId = "the-robots";
  let port = 17373;
  const rpcSources: RpcPayloadSource[] = [];
  let serve = true;
  let stdio = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--game") gameId = argv[++i] ?? gameId;
    else if (arg === "--port") port = Number(argv[++i] ?? port);
    else if (arg === "--rpc") {
      const value = argv[++i];
      if (value === undefined || value === "") {
        rpcSources.push({ kind: "inline", raw: "" });
      } else if (value === "-") {
        rpcSources.push({ kind: "stdin" });
      } else {
        rpcSources.push({ kind: "inline", raw: value });
      }
      serve = false;
    } else if (arg === "--rpc-file") {
      const path = argv[++i];
      rpcSources.push({ kind: "file", path: path ?? "" });
      serve = false;
    } else if (arg === "--stdio") {
      stdio = true;
      serve = false;
    } else if (arg === "--serve") serve = true;
  }

  return { gameId, port, rpcSources, serve, stdio };
}

async function main(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return 0;
  }
  if (argv.includes("--tools")) {
    for (const tool of EDITOR_MCP_TOOLS) {
      console.log(`${tool.name}\t${tool.description}`);
    }
    return 0;
  }

  const { gameId, port, rpcSources, serve, stdio } = parseEditorCliArgs(argv);

  if (stdio) {
    await runEditorMcpStdio({ gameId });
    return 0;
  }

  const [layers, catalogs] = await Promise.all([loadGameLayers(gameId), loadGameCatalogs(gameId)]);
  if (!layers.ok) {
    console.error(
      `invalid editorLayers for ${gameId}: ${layers.errors.map((e) => `${e.path} ${e.message}`).join("; ")}`,
    );
    return 1;
  }
  if (!catalogs.ok) {
    console.error(`invalid editorCatalogs for ${gameId}: ${catalogs.errors.map((e) => `${e.path} ${e.message}`).join("; ")}`);
    return 1;
  }
  const { api, dispose } = createEditorHost({
    gameId: gameId,
    layers: layers.document,
    catalogs: catalogs.catalogs,
  });

  if (rpcSources.length > 0) {
    for (const rpcSource of rpcSources) {
      const payload = await loadRpcPayload(rpcSource);
      if (!payload.ok) {
        console.error(payload.error);
        dispose();
        return 1;
      }
      const decoded = decodeEditorBridgeRequest(payload.value);
      if (!decoded.ok) {
        console.log(
          JSON.stringify(
            { ok: false, error: decoded.errors.map((e) => `${e.path} ${e.message}`).join("; ") },
            null,
            2,
          ),
        );
        dispose();
        return 1;
      }
      const response = api.handle(decoded.request);
      console.log(JSON.stringify(response, null, 2));
      if (!response.ok) {
        dispose();
        return 1;
      }
    }
    dispose();
    return 0;
  }

  if (serve) {
    const server = startEditorBridgeServerNode({ host: api, port });
    console.log(`editor bridge for ${gameId} at ${server.url}`);
    console.log(`POST ${server.url}/rpc  body: {"method":"scene_summary"}`);
    console.log("tools:", EDITOR_MCP_TOOLS.map((tool) => tool.name).join(", "));
    await new Promise(() => undefined);
  }

  dispose();
  return 0;
}

if (import.meta.main) {
  void main(process.argv.slice(2)).then((code) => process.exit(code));
}
