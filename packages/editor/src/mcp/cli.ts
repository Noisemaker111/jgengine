#!/usr/bin/env bun
/**
 * Headless editor control plane for agents.
 *
 * Usage:
 *   bun packages/editor/src/mcp/cli.ts --game the-robots --rpc '{"method":"scene_summary"}'
 *   bun packages/editor/src/mcp/cli.ts --game the-robots --serve
 *   bun packages/editor/src/mcp/cli.ts --game the-robots --stdio
 */

import { createEditorHost } from "../session";
import { startEditorBridgeServerNode } from "./bridgeServer.node.ts";
import { loadGameLayers } from "./loadGameLayers.ts";
import { decodeEditorBridgeRequest } from "./rpcRequest.ts";
import { runEditorMcpStdio } from "./stdioServer.ts";
import { EDITOR_MCP_TOOLS } from "./tools";

function printHelp(): void {
  console.log(`jgengine editor-mcp

  --game <id>          game id under Games/ (default the-robots)
  --port <n>           HTTP bridge port (default 17373)
  --rpc '<json>'       run one RPC and exit
  --stdio              MCP JSON-RPC over stdin/stdout
  --tools              list MCP tool names
  --serve              keep the localhost HTTP bridge up (default when no --rpc/--stdio)
`);
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

  let gameId = "the-robots";
  let port = 17373;
  let rpcRaw: string | null = null;
  let serve = true;
  let stdio = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--game") gameId = argv[++i] ?? gameId;
    else if (arg === "--port") port = Number(argv[++i] ?? port);
    else if (arg === "--rpc") {
      rpcRaw = argv[++i] ?? null;
      serve = false;
    } else if (arg === "--stdio") {
      stdio = true;
      serve = false;
    } else if (arg === "--serve") serve = true;
  }

  if (stdio) {
    await runEditorMcpStdio({ gameId });
    return 0;
  }

  const layers = await loadGameLayers(gameId);
  if (!layers.ok) {
    console.error(`invalid editorLayers for ${gameId}: ${layers.errors.map((e) => `${e.path} ${e.message}`).join("; ")}`);
    return 1;
  }
  const { api, dispose } = createEditorHost({
    gameId,
    layers: layers.document,
  });

  if (rpcRaw !== null) {
    const decoded = decodeEditorBridgeRequest(JSON.parse(rpcRaw));
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

void main(process.argv.slice(2)).then((code) => process.exit(code));
