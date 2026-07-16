import { EDITOR_MCP_TOOLS } from "../mcp/tools";
import type { EditorHostApi } from "../session";
import { formatAgentContext, packAgentContext, type AgentEditorContext } from "./context";
import type { AgentChatMessage, AgentEndpoint } from "./endpoint";
import { routeToolCall, type AgentToolCall, type AgentToolResult } from "./toolBridge";

/** One agent edit shown in the panel transcript — human can undo when it is the top of the stack. */
export interface AgentPatchEntry {
  id: string;
  toolCallId: string;
  method: string;
  summary: string;
  at: number;
  undone: boolean;
}

/** One rendered line in the agent panel transcript (user, assistant, tool, error, or patch). */
export type AgentTranscriptEntry =
  | { kind: "user"; id: string; content: string; at: number }
  | { kind: "assistant"; id: string; content: string; at: number }
  | { kind: "tool"; id: string; result: AgentToolResult; at: number }
  | { kind: "error"; id: string; content: string; at: number }
  | { kind: "patch"; id: string; patch: AgentPatchEntry; at: number };

/** Result of {@link runAgentTurn}: chat history, UI transcript, undoable patches, and packed context. */
export interface AgentTurnResult {
  messages: AgentChatMessage[];
  transcript: AgentTranscriptEntry[];
  patches: AgentPatchEntry[];
  context: AgentEditorContext;
}

function nextId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1296).toString(36)}`;
}

const DEFAULT_MAX_ROUNDS = 6;

/**
 * Runs one user message against an agent endpoint: injects live editor context via
 * `packAgentContext`, executes tool calls through `routeToolCall` (shared undo), and returns
 * transcript + patch entries the human can reverse with `undoAgentPatch`.
 */
export async function runAgentTurn(options: {
  api: EditorHostApi;
  endpoint: AgentEndpoint;
  history: readonly AgentChatMessage[];
  userMessage: string;
  maxRounds?: number;
  now?: () => number;
}): Promise<AgentTurnResult> {
  const now = options.now ?? Date.now;
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const context = packAgentContext(options.api);
  const system: AgentChatMessage = {
    role: "system",
    content: [
      "You are the in-editor scene agent. Edit the live scene only via the provided tools.",
      "Each tool name is an editor RPC verb — the same surface as the GUI and MCP bridge.",
      "Current editor context:",
      formatAgentContext(context),
    ].join("\n"),
  };

  const messages: AgentChatMessage[] = [
    system,
    ...options.history.filter((m) => m.role !== "system"),
    { role: "user", content: options.userMessage },
  ];

  const transcript: AgentTranscriptEntry[] = [
    { kind: "user", id: nextId("user"), content: options.userMessage, at: now() },
  ];
  const patches: AgentPatchEntry[] = [];

  for (let round = 0; round < maxRounds; round += 1) {
    const liveContext = packAgentContext(options.api);
    let response;
    try {
      response = await options.endpoint.chat({
        messages,
        context: liveContext,
        tools: EDITOR_MCP_TOOLS,
      });
    } catch (error) {
      const content = error instanceof Error ? error.message : String(error);
      transcript.push({ kind: "error", id: nextId("err"), content, at: now() });
      break;
    }

    if (typeof response.message === "string" && response.message.length > 0) {
      messages.push({ role: "assistant", content: response.message });
      transcript.push({ kind: "assistant", id: nextId("asst"), content: response.message, at: now() });
    }

    const toolCalls = response.toolCalls ?? [];
    if (toolCalls.length === 0) break;

    for (const call of toolCalls) {
      const result = routeToolCall(options.api, call as AgentToolCall);
      messages.push({
        role: "tool",
        toolCallId: result.id,
        name: result.name,
        content: JSON.stringify(
          result.ok
            ? { ok: true, result: result.result, mutated: result.mutated }
            : { ok: false, error: result.error },
        ),
      });
      transcript.push({ kind: "tool", id: nextId("tool"), result, at: now() });
      if (result.mutated) {
        const patch: AgentPatchEntry = {
          id: nextId("patch"),
          toolCallId: result.id,
          method: result.name,
          summary: result.patchSummary,
          at: now(),
          undone: false,
        };
        patches.push(patch);
        transcript.push({ kind: "patch", id: patch.id, patch, at: patch.at });
      }
    }
  }

  return {
    messages: messages.filter((m) => m.role !== "system"),
    transcript,
    patches,
    context,
  };
}

/**
 * Undoes one agent patch when it is still the top of the session undo stack.
 * Newer live agent patches must be undone first; returns the updated list immutably.
 */
export function undoAgentPatch(
  api: EditorHostApi,
  patches: readonly AgentPatchEntry[],
  patchId: string,
): { ok: true; patches: AgentPatchEntry[] } | { ok: false; error: string } {
  const index = patches.findIndex((p) => p.id === patchId);
  if (index < 0) return { ok: false, error: "patch not found" };
  const patch = patches[index]!;
  if (patch.undone) return { ok: false, error: "already undone" };

  const laterLive = patches.slice(index + 1).some((p) => !p.undone);
  if (laterLive) {
    return { ok: false, error: "undo newer agent edits first" };
  }

  if (!api.getSession().canUndo()) {
    return { ok: false, error: "nothing to undo (human may have undone already)" };
  }

  const response = api.handle({ method: "undo" });
  if (!response.ok) {
    return { ok: false, error: response.error ?? "undo failed" };
  }

  const next = patches.map((p, i) => (i === index ? { ...p, undone: true } : p));
  return { ok: true, patches: next };
}
