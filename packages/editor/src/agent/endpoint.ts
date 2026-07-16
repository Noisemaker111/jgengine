import type { EditorMcpTool } from "../mcp/tools";
import type { AgentEditorContext } from "./context";
import type { AgentToolCall } from "./toolBridge";

/** One message in an agent chat transcript (user, assistant, or tool result). */
export type AgentChatRole = "user" | "assistant" | "tool" | "system";

/** One turn message exchanged with a pluggable agent endpoint (user, assistant, tool, or system). */
export interface AgentChatMessage {
  role: AgentChatRole;
  content: string;
  /** Present on tool-result messages. */
  toolCallId?: string;
  name?: string;
}

/** Payload sent to a pluggable agent backend for one model turn. */
export interface AgentChatRequest {
  messages: readonly AgentChatMessage[];
  context: AgentEditorContext;
  tools: readonly EditorMcpTool[];
}

/** Model reply: optional prose plus zero or more tool calls to run via editor RPC. */
export interface AgentChatResponse {
  message?: string;
  toolCalls?: AgentToolCall[];
}

/** Pluggable agent backend — HTTP, Claude SDK adapter, or a local rule engine. */
export interface AgentEndpoint {
  /** Stable id for UI status (e.g. "http", "local"). */
  id: string;
  chat(request: AgentChatRequest): Promise<AgentChatResponse>;
}

/** Env var name for the remote agent HTTP URL (`JGENGINE_EDITOR_AGENT_URL`). */
export const EDITOR_AGENT_URL_ENV = "JGENGINE_EDITOR_AGENT_URL";
/** Env var name for the optional Bearer token (`JGENGINE_EDITOR_AGENT_KEY`). */
export const EDITOR_AGENT_KEY_ENV = "JGENGINE_EDITOR_AGENT_KEY";
/** Fallback API-key env when `JGENGINE_EDITOR_AGENT_KEY` is unset (`ANTHROPIC_API_KEY`). */
export const EDITOR_AGENT_KEY_FALLBACK_ENV = "ANTHROPIC_API_KEY";

/** Resolved remote agent settings: optional URL and optional Bearer API key. */
export interface AgentEndpointConfig {
  url?: string;
  apiKey?: string;
}

function readProcessEnv(): Record<string, string | undefined> {
  const root = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } };
  return root.process?.env ?? {};
}

/**
 * Reads agent endpoint config from an env map.
 * Prefer `JGENGINE_EDITOR_AGENT_URL` + `JGENGINE_EDITOR_AGENT_KEY` (falls back to `ANTHROPIC_API_KEY`).
 * Empty URL → local offline agent; set the URL for a remote model/tool-call backend.
 */
export function resolveAgentEndpointConfig(
  env: Record<string, string | undefined> = readProcessEnv(),
): AgentEndpointConfig {
  const url = env[EDITOR_AGENT_URL_ENV]?.trim() || undefined;
  const apiKey =
    env[EDITOR_AGENT_KEY_ENV]?.trim() || env[EDITOR_AGENT_KEY_FALLBACK_ENV]?.trim() || undefined;
  return { url, apiKey };
}

/**
 * HTTP POST agent endpoint: `{ messages, context, tools }` → `{ message?, toolCalls? }`.
 * Bearer auth from `apiKey` when provided (`JGENGINE_EDITOR_AGENT_KEY` / `ANTHROPIC_API_KEY`).
 */
export function createHttpAgentEndpoint(config: {
  url: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): AgentEndpoint {
  const fetchImpl = config.fetchImpl ?? fetch;
  return {
    id: "http",
    async chat(request) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (config.apiKey !== undefined && config.apiKey.length > 0) {
        headers.authorization = `Bearer ${config.apiKey}`;
      }
      const response = await fetchImpl(config.url, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`agent endpoint HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
      }
      const raw = (await response.json()) as AgentChatResponse;
      return normalizeChatResponse(raw);
    },
  };
}

function normalizeChatResponse(raw: AgentChatResponse): AgentChatResponse {
  const toolCalls = Array.isArray(raw.toolCalls)
    ? raw.toolCalls
        .filter((call) => call !== null && typeof call === "object")
        .map((call, index) => {
          const record = call as AgentToolCall;
          const name = typeof record.name === "string" ? record.name : "";
          const id = typeof record.id === "string" && record.id.length > 0 ? record.id : `call_${index}`;
          const args =
            record.arguments !== null && typeof record.arguments === "object" && !Array.isArray(record.arguments)
              ? (record.arguments as Record<string, unknown>)
              : {};
          return { id, name, arguments: args };
        })
        .filter((call) => call.name.length > 0)
    : undefined;
  return {
    ...(typeof raw.message === "string" ? { message: raw.message } : {}),
    ...(toolCalls !== undefined && toolCalls.length > 0 ? { toolCalls } : {}),
  };
}

/**
 * Offline rule-based agent for demos and tests when no remote URL is configured.
 * Understands slash-style commands that map onto editor RPC verbs.
 * @internal
 */
export function createLocalAgentEndpoint(): AgentEndpoint {
  return {
    id: "local",
    async chat(request) {
      const lastUser = [...request.messages].reverse().find((m) => m.role === "user");
      const text = lastUser?.content.trim() ?? "";
      if (text.length === 0) {
        return { message: "Send a command (e.g. /status, /select id, /undo, or free text)." };
      }
      return interpretLocalCommand(text, request.context);
    },
  };
}

/** @internal Parses a local agent command into message + optional tool calls. */
export function interpretLocalCommand(text: string, context: AgentEditorContext): AgentChatResponse {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (lower === "/help" || lower === "help") {
    return {
      message: [
        "Local agent commands (tool calls → editor RPC, same undo as the GUI):",
        "/status  /summary  /selection  /frame  /undo  /redo",
        "/select <id…>  /clear",
        "/goto <id>  /move <id> <x> <y> <z>",
        "Or configure JGENGINE_EDITOR_AGENT_URL for a remote model endpoint.",
      ].join("\n"),
    };
  }

  if (lower === "/status" || lower === "status") {
    return {
      message: `mode=${context.mode} selection=${context.selection.join(",") || "(none)"}`,
      toolCalls: [{ id: "local_status", name: "editor_status", arguments: {} }],
    };
  }

  if (lower === "/summary" || lower === "summary") {
    return {
      message: "Pulling scene summary…",
      toolCalls: [{ id: "local_summary", name: "scene_summary", arguments: {} }],
    };
  }

  if (lower === "/selection" || lower === "selection") {
    return {
      message: context.selection.length === 0 ? "Nothing selected." : `Selected: ${context.selection.join(", ")}`,
      toolCalls: [{ id: "local_sel", name: "list_selection", arguments: {} }],
    };
  }

  if (lower === "/frame" || lower === "frame") {
    return {
      message: "Framing scene…",
      toolCalls: [{ id: "local_frame", name: "camera_frame", arguments: {} }],
    };
  }

  if (lower === "/undo" || lower === "undo") {
    return {
      message: context.canUndo ? "Undoing last edit…" : "Nothing to undo.",
      toolCalls: context.canUndo ? [{ id: "local_undo", name: "undo", arguments: {} }] : undefined,
    };
  }

  if (lower === "/redo" || lower === "redo") {
    return {
      message: context.canRedo ? "Redoing…" : "Nothing to redo.",
      toolCalls: context.canRedo ? [{ id: "local_redo", name: "redo", arguments: {} }] : undefined,
    };
  }

  if (lower === "/clear" || lower === "clear selection") {
    return {
      message: "Clearing selection…",
      toolCalls: [{ id: "local_clear", name: "clear_selection", arguments: {} }],
    };
  }

  const selectMatch = trimmed.match(/^\/?select\s+(.+)$/i);
  if (selectMatch !== null) {
    const ids = selectMatch[1]!.trim().split(/[\s,]+/).filter((id) => id.length > 0);
    return {
      message: `Selecting ${ids.join(", ")}…`,
      toolCalls: [{ id: "local_select", name: "select", arguments: { ids } }],
    };
  }

  const gotoMatch = trimmed.match(/^\/?goto\s+(\S+)$/i);
  if (gotoMatch !== null) {
    const id = gotoMatch[1]!;
    return {
      message: `Focusing ${id}…`,
      toolCalls: [{ id: "local_goto", name: "camera_goto", arguments: { id } }],
    };
  }

  const moveMatch = trimmed.match(/^\/?move\s+(\S+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*$/i);
  if (moveMatch !== null) {
    const id = moveMatch[1]!;
    const x = Number(moveMatch[2]);
    const y = Number(moveMatch[3]);
    const z = Number(moveMatch[4]);
    return {
      message: `Moving ${id} → (${x}, ${y}, ${z})…`,
      toolCalls: [{ id: "local_move", name: "set_transform", arguments: { id, x, y, z } }],
    };
  }

  return {
    message: [
      `No local handler for “${trimmed.slice(0, 80)}”.`,
      "Try /help, or set JGENGINE_EDITOR_AGENT_URL (+ optional JGENGINE_EDITOR_AGENT_KEY) for a remote agent.",
      `Context: mode=${context.mode}, selection=${context.selection.join(",") || "(none)"}.`,
    ].join("\n"),
  };
}

/**
 * Picks HTTP endpoint when `JGENGINE_EDITOR_AGENT_URL` (or config.url) is set, otherwise the offline local agent.
 */
export function createDefaultAgentEndpoint(config: AgentEndpointConfig = resolveAgentEndpointConfig()): AgentEndpoint {
  if (config.url !== undefined && config.url.length > 0) {
    return createHttpAgentEndpoint({ url: config.url, apiKey: config.apiKey });
  }
  return createLocalAgentEndpoint();
}
