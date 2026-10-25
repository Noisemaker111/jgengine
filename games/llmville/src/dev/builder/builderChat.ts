/**
 * "Chat with the scene" runtime: a singleton store mirroring the
 * `useSyncExternalStore` pattern in `builderStore.ts`. There is no separate
 * maintained tool API — the callable surface is whatever the registered
 * executor namespaces expose (see `executor.ts`), enumerated fresh on every
 * send() so new store methods become agent-callable automatically. Actual
 * call execution is delegated to the executor too, which owns async/timeout
 * handling and result normalization.
 */
import { useSyncExternalStore } from "react";

import { buildSceneDigest } from "@llmville/game/builder/sceneDigest";

import { BuilderStore } from "@/dev/builder/builderStore";
import { enumerateCallableMethods, executeToolCalls, type ExecutedCall } from "@/dev/builder/executor";

const CHAT_ENDPOINT = "/__llmville-builder/chat";
const MAX_STEPS = 8;

export type BuilderChatEntry =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string }
  | {
    id: string;
    role: "activity";
    calls: ExecutedCall[];
    note?: string;
  }
  | { id: string; role: "error"; text: string };

export interface BuilderChatState {
  entries: readonly BuilderChatEntry[];
  draft: string;
  status: "idle" | "running";
}

type Listener = () => void;

type BuilderChatTranscriptMessage = { role: "user" | "assistant" | "tool"; content: string };
type BuilderChatToolCall = { method: string; args: unknown[] };
type BuilderChatTurn =
  | { kind: "say"; text: string }
  | { kind: "calls"; calls: BuilderChatToolCall[]; note?: string };

type ChatTurnResponse =
  | { turn: BuilderChatTurn; agent: string; callableMethods: string[] }
  | { error: string };

function newEntryId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function currentDigest(): string {
  const state = BuilderStore.getState();
  return buildSceneDigest(state.mapData, [...state.selectedRefs]);
}

/** Replay one transcript entry into the role-labeled messages the server prompt expects. */
function entryToTranscript(entry: BuilderChatEntry): BuilderChatTranscriptMessage[] {
  if (entry.role === "user") return [{ role: "user", content: entry.text }];
  if (entry.role === "assistant") return [{ role: "assistant", content: entry.text }];
  if (entry.role === "error") return [];

  const callsJson = JSON.stringify({
    calls: entry.calls.map((call) => ({ method: call.method, args: call.argsPreview })),
    ...(entry.note ? { note: entry.note } : {}),
  });
  const resultsText = entry.calls
    .map((call) => `${call.method}(${call.argsPreview}) -> ${call.ok ? call.result : `ERROR: ${call.result}`}`)
    .join("\n");
  return [
    { role: "assistant", content: callsJson },
    { role: "tool", content: `${resultsText}\n\nSCENE DIGEST\n${currentDigest()}` },
  ];
}

class BuilderChatStoreImpl {
  private state: BuilderChatState = { entries: [], draft: "", status: "idle" };

  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): Readonly<BuilderChatState> {
    return this.state;
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  private setState(next: Partial<BuilderChatState>) {
    this.state = { ...this.state, ...next };
    this.emit();
  }

  private appendEntry(entry: BuilderChatEntry) {
    this.setState({ entries: [...this.state.entries, entry] });
  }

  setDraft(draft: string) {
    this.setState({ draft });
  }

  clear() {
    this.setState({ entries: [], draft: "", status: "idle" });
  }

  send() {
    const text = this.state.draft.trim();
    if (!text || this.state.status === "running") return;
    this.appendEntry({ id: newEntryId(), role: "user", text });
    this.setState({ draft: "", status: "running" });
    void this.runLoop();
  }

  private buildTranscript(): BuilderChatTranscriptMessage[] {
    return this.state.entries.flatMap(entryToTranscript);
  }

  private async requestTurn(methodNames: string[]): Promise<ChatTurnResponse> {
    const response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: this.buildTranscript(),
        sceneDigest: currentDigest(),
        methodNames,
      }),
    });
    const payload = await response.json().catch(() => null) as ChatTurnResponse | null;
    if (!payload) return { error: `Chat request failed (HTTP ${response.status}).` };
    if (!response.ok && !("error" in payload)) {
      return { error: `Chat request failed (HTTP ${response.status}).` };
    }
    return payload;
  }

  private async runLoop() {
    const methodNames = enumerateCallableMethods();

    for (let step = 0; step < MAX_STEPS; step += 1) {
      let response: ChatTurnResponse;
      try {
        response = await this.requestTurn(methodNames);
      } catch (error) {
        this.appendEntry({
          id: newEntryId(),
          role: "error",
          text: error instanceof Error ? error.message : "Chat request failed.",
        });
        this.setState({ status: "idle" });
        return;
      }

      if ("error" in response) {
        this.appendEntry({ id: newEntryId(), role: "error", text: response.error });
        this.setState({ status: "idle" });
        return;
      }

      const { turn } = response;
      if (turn.kind === "say") {
        this.appendEntry({ id: newEntryId(), role: "assistant", text: turn.text });
        this.setState({ status: "idle" });
        return;
      }

      const calls = await executeToolCalls(turn.calls, { allowedMethods: response.callableMethods });
      this.appendEntry({
        id: newEntryId(),
        role: "activity",
        calls,
        ...(turn.note ? { note: turn.note } : {}),
      });
      // Loop continues: next iteration's request carries these results plus a fresh digest.
    }

    this.appendEntry({
      id: newEntryId(),
      role: "error",
      text: `Agent hit the ${MAX_STEPS}-step limit without finishing. Try a narrower request.`,
    });
    this.setState({ status: "idle" });
  }
}

export const BuilderChatStore = new BuilderChatStoreImpl();

export function useBuilderChatState() {
  return useSyncExternalStore(
    (listener) => BuilderChatStore.subscribe(listener),
    () => BuilderChatStore.getState(),
  );
}
