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
import { loadGameLayers } from "./loadGameLayers.ts";
import { decodeEditorBridgeRequest } from "./rpcRequest.ts";
import { loadRpcPayload, type RpcPayloadSource } from "./rpcPayload.ts";
import { runEditorMcpStdio } from "./stdioServer.ts";
import { EDITOR_MCP_TOOLS } from "./tools";

function printHelp(): void {
  console.log(`jgengine editor-mcp

  --game <id>          game id under Games/ (default the-robots)
  --port <n>           HTTP bridge port (default 17373)
  --rpc '<json>'       run one RPC and exit (inline JSON)
  --rpc -              run one RPC from stdin JSON
  --rpc-file <path>    run one RPC from a JSON file (large import_document etc.)
  --stdio              MCP JSON-RPC over stdin/stdout
  --tools              list MCP tool names
  --serve              keep the localhost HTTP bridge up (default when no --rpc/--rpc-file/--stdio)
`);
}

/** Parsed CLI flags for the headless editor control plane. */
export type EditorCliOptions = {
  gameId: string;
  port: number;
  rpcSource: RpcPayloadSource | null;
  serve: boolean;
  stdio: boolean;
};

/**
 * Parses argv into editor-mcp flags. `--rpc -` and `--rpc-file` both set a non-inline
 * {@link RpcPayloadSource} so large documents never ride a shell argument.
 */
export function parseEditorCliArgs(argv: string[]): EditorCliOptions {
  let gameId = "the-robots";
  let port = 17373;
  let rpcSource: RpcPayloadSource | null = null;
  let serve = true;
  let stdio = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--game") gameId = argv[++i] ?? gameId;
    else if (arg === "--port") port = Number(argv[++i] ?? port);
    else if (arg === "--rpc") {
      const value = argv[++i];
      if (value === undefined || value === "") {
        rpcSource = { kind: "inline", raw: "" };
      } else if (value === "-") {
        rpcSource = { kind: "stdin" };
      } else {
        rpcSource = { kind: "inline", raw: value };
      }
      serve = false;
    } else if (arg === "--rpc-file") {
      const path = argv[++i];
      rpcSource = { kind: "file", path: path ?? "" };
      serve = false;
    } else if (arg === "--stdio") {
      stdio = true;
      serve = false;
    } else if (arg === "--serve") serve = true;
  }

  return { gameId, port, rpcSource, serve, stdio };
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

  const options = parseEditorCliArgs(argv);

  if (options.stdio) {
    await runEditorMcpStdio({ gameId: options.gameId });
    return 0;
  }

  const layers = await loadGameLayers(options.gameId);
  if (!layers.ok) {
    console.error(
      `invalid editorLayers for ${options.gameId}: ${layers.errors.map((e) => `${e.path} ${e.message}`).join("; ")}`,
    );
    return 1;
  }
  const { api, dispose } = createEditorHost({
    gameId: options.gameId,
    layers: layers.document,
  });

  if (options.rpcSource !== null) {
    if (options.rpcSource.kind === "file" && options.rpcSource.path === "") {
      console.error(
        JSON.stringify(
          {
            ok: false,
            error: "missing path for --rpc-file. Usage: --rpc-file <path> (or --rpc - for stdin)",
          },
          null,
          2,
        ),
      );
      dispose();
      return 1;
    }

    const loaded = await loadRpcPayload(options.rpcSource);
    if (!loaded.ok) {
      console.error(JSON.stringify({ ok: false, error: loaded.error }, null, 2));
      dispose();
      return 1;
    }

    const decoded = decodeEditorBridgeRequest(loaded.value);
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
    dispose();
    return response.ok ? 0 : 1;
  }

  if (options.serve) {
    const server = startEditorBridgeServerNode({ host: api, port: options.port });
    console.log(`editor bridge for ${options.gameId} at ${server.url}`);
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
