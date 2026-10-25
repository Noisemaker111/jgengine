# Chat with the scene

"Chat with the scene" lets an agent edit the live 3D room builder
(`/dev/build`) by calling methods on the `BuilderStore` singleton, instead of
hand-editing map JSON. Two ways in:

- **In-app chat panel** — the message-circle icon on `/dev/build` spawns a
  local coding-agent CLI (OpenCode by default) that reads a scene digest,
  decides on a batch of `BuilderStore` calls, and executes them in-browser.
- **HTTP / OpenAPI surface (this doc)** — the same store exposed over plain
  HTTP with an auto-generated OpenAPI 3.1 spec, so any MCP-capable agent can
  drive the scene externally via [Executor](https://github.com/RhysSullivan/executor) (or any
  other OpenAPI-consuming tool platform), without a local CLI spawn.

Both paths call the exact same public `BuilderStore` methods — there is no
separate maintained tool API.

## Dev-only, and requires an open tab

This only works while a dev server is running **and** a browser tab has
`/dev/build` open. The scene lives in that tab; the Vite dev server is just a
relay between HTTP requests and the tab, bridged over Vite's built-in HMR
websocket. If no tab is open, calls return `503`.

## Setup

1. `bun run dev` in `games/llmville`
2. Open `http://localhost:3001/dev/build` in a browser and leave the tab open.
3. Register the source in Executor:

   ```
   executor call executor openapi addSource '{"spec": "http://localhost:3001/__llmville-builder/openapi.json", "namespace": "llmville", "baseUrl": "http://localhost:3001/__llmville-builder/api"}'
   ```

4. Connect your MCP-capable agent (Claude Code, Cursor, etc.) to Executor's
   MCP endpoint. The registered `llmville` tools will show up alongside your
   other Executor sources.

## Auto-generated, always current

The tool catalog is regenerated from `apps/web/src/dev/builder/builderStore.ts`'s
public method signatures on every `openapi.json` fetch — there is no manual
spec to maintain. Add a public method to `BuilderStoreImpl` and it's callable
immediately, with no redeploy or regeneration step.

## Reading scene state

`GET /__llmville-builder/api/scene` returns the current scene digest and raw
map data without making a tool call — useful for an agent to check state
before or after a batch of edits.
