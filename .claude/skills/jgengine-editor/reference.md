# Editor agent panel (embedded)

Toolbar **Agent** opens a dockable chat panel in `EditorChrome`. Tool calls use the same editor RPC verbs as the MCP/CLI bridge and the GUI — one session undo stack, interleaved with human edits.

## Env

| Variable | Role |
| --- | --- |
| `JGENGINE_EDITOR_AGENT_URL` | Remote agent HTTP endpoint (POST JSON). Unset → offline local command agent. |
| `JGENGINE_EDITOR_AGENT_KEY` | Optional Bearer token for the endpoint. |
| `ANTHROPIC_API_KEY` | Fallback when `JGENGINE_EDITOR_AGENT_KEY` is unset. |

Panel **Config** can also store URL/key in `localStorage` for browser sessions.

## Protocol

```
POST $JGENGINE_EDITOR_AGENT_URL
Authorization: Bearer $JGENGINE_EDITOR_AGENT_KEY   # optional
Content-Type: application/json

{
  "messages": [{ "role": "user"|"assistant"|"tool"|"system", "content": string, "toolCallId"?: string, "name"?: string }],
  "context": { "gameId", "mode", "selection", "focus", "canUndo", "canRedo", "summary" },
  "tools": [ /* EDITOR_MCP_TOOLS */ ]
}

→ { "message"?: string, "toolCalls"?: [{ "id", "name", "arguments" }] }
```

Each `toolCalls[].name` is an editor RPC method (`set_transform`, `select`, …). The panel runs them via `routeToolCall` → `EditorHostApi.handle`.

## Pure API (`@jgengine/editor`)

```ts
import {
  packAgentContext,
  routeToolCall,
  runAgentTurn,
  undoAgentPatch,
  createDefaultAgentEndpoint,
  createHttpAgentEndpoint,
  resolveAgentEndpointConfig,
} from "@jgengine/editor";

const context = packAgentContext(api);
const endpoint = createDefaultAgentEndpoint(resolveAgentEndpointConfig());
// or: createHttpAgentEndpoint({ url, apiKey })

const turn = await runAgentTurn({
  api,
  endpoint,
  history: [],
  userMessage: "move boss to 10,0,-5",
});
// turn.patches — document edits; human undoes top entry:
undoAgentPatch(api, turn.patches, turn.patches.at(-1)!.id);

routeToolCall(api, { id: "1", name: "set_transform", arguments: { id: "boss", x: 10, y: 0, z: -5 } });
```

## Local agent (no URL)

Commands: `/help`, `/status`, `/summary`, `/selection`, `/frame`, `/undo`, `/redo`, `/clear`, `/select <id…>`, `/goto <id>`, `move <id> <x> <y> <z>`.
