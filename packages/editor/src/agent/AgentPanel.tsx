import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EditorHostApi } from "../session";
import { BORDER, CONTROL, FOCUS_RING, INPUT_CLS, MICRO_LABEL, PANEL_BG } from "../shell/theme";

const BTN = `${CONTROL} px-2 py-1 text-[11px] disabled:opacity-40`;
const INPUT = `px-2 py-1 ${INPUT_CLS}`;
const MICRO = MICRO_LABEL;
import {
  createDefaultAgentEndpoint,
  createHttpAgentEndpoint,
  createLocalAgentEndpoint,
  EDITOR_AGENT_KEY_ENV,
  EDITOR_AGENT_URL_ENV,
  resolveAgentEndpointConfig,
  type AgentChatMessage,
  type AgentEndpoint,
} from "./endpoint";
import { packAgentContext } from "./context";
import {
  runAgentTurn,
  undoAgentPatch,
  type AgentPatchEntry,
  type AgentTranscriptEntry,
} from "./turn";

const STORAGE_URL = "jgengine.editorAgentUrl";
const STORAGE_KEY = "jgengine.editorAgentKey";

function readStoredConfig(): { url: string; apiKey: string } {
  if (typeof localStorage === "undefined") return { url: "", apiKey: "" };
  return {
    url: localStorage.getItem(STORAGE_URL) ?? "",
    apiKey: localStorage.getItem(STORAGE_KEY) ?? "",
  };
}

function buildEndpoint(url: string, apiKey: string): AgentEndpoint {
  const env = resolveAgentEndpointConfig();
  const resolvedUrl = url.trim() || env.url || "";
  const resolvedKey = apiKey.trim() || env.apiKey || "";
  if (resolvedUrl.length > 0) {
    return createHttpAgentEndpoint({ url: resolvedUrl, apiKey: resolvedKey || undefined });
  }
  return createLocalAgentEndpoint();
}

/**
 * Dockable in-editor agent chat: humans and agents share the same RPC/undo surface.
 * Tool calls route through `EditorHostApi.handle`; patches appear in the transcript and can be undone.
 * @internal — mounted by `EditorChrome`.
 */
export function AgentPanel({
  api,
  onClose,
  embedded = false,
}: {
  api: EditorHostApi;
  /** Close affordance for the side-dock variant; omit when the host owns dismissal. */
  onClose?: () => void;
  /** Fill the parent (bottom-dock tab) instead of rendering the resizable right aside. */
  embedded?: boolean;
}) {
  const stored = useMemo(() => readStoredConfig(), []);
  const [url, setUrl] = useState(stored.url);
  const [apiKey, setApiKey] = useState(stored.apiKey);
  const [showConfig, setShowConfig] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<AgentChatMessage[]>([]);
  const [transcript, setTranscript] = useState<AgentTranscriptEntry[]>([]);
  const [patches, setPatches] = useState<AgentPatchEntry[]>([]);
  const [contextTick, setContextTick] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const endpoint = useMemo(() => buildEndpoint(url, apiKey), [url, apiKey]);
  const context = useMemo(() => packAgentContext(api), [api, contextTick]);

  useEffect(() => {
    const unsubSession = api.getSession().subscribe(() => setContextTick((v) => v + 1));
    const unsubMode = api.subscribeMode(() => setContextTick((v) => v + 1));
    const unsubFocus = api.subscribeFocus(() => setContextTick((v) => v + 1));
    return () => {
      unsubSession();
      unsubMode();
      unsubFocus();
    };
  }, [api]);

  useEffect(() => {
    const el = listRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [transcript, busy]);

  const persistConfig = useCallback(() => {
    if (typeof localStorage === "undefined") return;
    if (url.trim().length > 0) localStorage.setItem(STORAGE_URL, url.trim());
    else localStorage.removeItem(STORAGE_URL);
    if (apiKey.trim().length > 0) localStorage.setItem(STORAGE_KEY, apiKey.trim());
    else localStorage.removeItem(STORAGE_KEY);
  }, [url, apiKey]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (text.length === 0 || busy) return;
    setInput("");
    setBusy(true);
    try {
      const turn = await runAgentTurn({
        api,
        endpoint,
        history,
        userMessage: text,
      });
      setHistory(turn.messages);
      setTranscript((prev) => [...prev, ...turn.transcript]);
      setPatches((prev) => [...prev, ...turn.patches]);
      setContextTick((v) => v + 1);
    } catch (error) {
      const content = error instanceof Error ? error.message : String(error);
      setTranscript((prev) => [
        ...prev,
        { kind: "user", id: `user_${Date.now()}`, content: text, at: Date.now() },
        { kind: "error", id: `err_${Date.now()}`, content, at: Date.now() },
      ]);
    } finally {
      setBusy(false);
    }
  }, [api, busy, endpoint, history, input]);

  const onUndoPatch = useCallback(
    (patchId: string) => {
      const result = undoAgentPatch(api, patches, patchId);
      if (!result.ok) return;
      setPatches(result.patches);
      setTranscript((prev) =>
        prev.map((entry) =>
          entry.kind === "patch" && entry.patch.id === patchId
            ? { ...entry, patch: { ...entry.patch, undone: true } }
            : entry,
        ),
      );
      setContextTick((v) => v + 1);
    },
    [api, patches],
  );

  const envHint = resolveAgentEndpointConfig();

  return (
    <aside
      className={
        embedded
          ? "pointer-events-auto flex min-h-0 flex-1 flex-col overflow-hidden"
          : `pointer-events-auto flex w-80 min-w-64 max-w-[48vw] resize-x flex-col overflow-hidden border-l ${BORDER} ${PANEL_BG}/95 backdrop-blur-md`
      }
    >
      <div className={`flex items-center gap-2 border-b ${BORDER} px-2 py-2`}>
        <div className={MICRO}>Agent</div>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
            endpoint.id === "http"
              ? "bg-violet-500/20 text-violet-200 ring-1 ring-inset ring-violet-400/30"
              : "bg-white/[0.06] text-neutral-400 ring-1 ring-inset ring-white/10"
          }`}
          title={endpoint.id === "http" ? "Remote endpoint" : "Local offline agent"}
        >
          {endpoint.id}
        </span>
        <button type="button" className={`${BTN} ml-auto text-[10px]`} onClick={() => setShowConfig((v) => !v)}>
          Config
        </button>
        {onClose !== undefined ? (
          <button type="button" className={`rounded-[5px] px-2 py-1 text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200 ${FOCUS_RING}`} onClick={onClose} aria-label="Close agent panel">
            ×
          </button>
        ) : null}
      </div>

      {showConfig ? (
        <div className={`space-y-2 border-b ${BORDER} p-2`}>
          <div className={MICRO}>Endpoint</div>
          <input
            className={`w-full text-[11px] ${INPUT}`}
            placeholder={`${EDITOR_AGENT_URL_ENV} or https://…`}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onBlur={persistConfig}
          />
          <input
            className={`w-full text-[11px] ${INPUT}`}
            type="password"
            placeholder={`${EDITOR_AGENT_KEY_ENV} / ANTHROPIC_API_KEY`}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            onBlur={persistConfig}
          />
          <p className="text-[10px] leading-snug text-neutral-500">
            Env: {EDITOR_AGENT_URL_ENV}
            {envHint.url !== undefined ? " ✓" : " (unset)"} · {EDITOR_AGENT_KEY_ENV}
            {envHint.apiKey !== undefined ? " ✓" : " (unset)"}. Empty URL uses the local command agent
            (/help). Remote: POST JSON {"{messages,context,tools}"} → {"{message?,toolCalls?}"}.
          </p>
          <button
            type="button"
            className={BTN}
            onClick={() => {
              setUrl("");
              setApiKey("");
              if (typeof localStorage !== "undefined") {
                localStorage.removeItem(STORAGE_URL);
                localStorage.removeItem(STORAGE_KEY);
              }
            }}
          >
            Use local agent
          </button>
        </div>
      ) : null}

      <div className={`border-b ${BORDER} px-2 py-1.5 text-[10px] text-neutral-500`}>
        <span className="text-neutral-400">{context.mode}</span>
        <span className="mx-1.5 text-neutral-700">·</span>
        <span>
          sel {context.selection.length === 0 ? "—" : context.selection.slice(0, 3).join(", ")}
          {context.selection.length > 3 ? ` +${context.selection.length - 3}` : ""}
        </span>
        <span className="mx-1.5 text-neutral-700">·</span>
        <span>
          {context.summary.markers}m {context.summary.volumes}v {context.summary.paths}p
        </span>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
        {transcript.length === 0 ? (
          <div className={`rounded-[6px] border border-dashed ${BORDER} bg-black/20 p-3 text-[11px] leading-relaxed text-neutral-500`}>
            Chat drives the live scene through the same RPC verbs as the MCP bridge. Edits share undo
            with the toolbar. Local: try <code className="text-cyan-300">/status</code>,{" "}
            <code className="text-cyan-300">/help</code>, or{" "}
            <code className="text-cyan-300">move id x y z</code>.
          </div>
        ) : null}
        {transcript.map((entry) => (
          <TranscriptRow key={entry.id} entry={entry} patches={patches} onUndo={onUndoPatch} />
        ))}
        {busy ? <div className="text-[10px] text-violet-300">Thinking…</div> : null}
      </div>

      {patches.some((p) => !p.undone) ? (
        <div className={`max-h-28 overflow-auto border-t ${BORDER} p-2`}>
          <div className={`${MICRO} mb-1`}>Agent patches</div>
          <ul className="space-y-1">
            {patches
              .filter((p) => !p.undone)
              .map((patch, index, live) => {
                const isTop = index === live.length - 1;
                return (
                  <li key={patch.id} className="flex items-center gap-1 text-[10px] text-neutral-300">
                    <span className="min-w-0 flex-1 truncate font-mono text-cyan-200/90">{patch.summary}</span>
                    <button
                      type="button"
                      className={`${BTN} shrink-0 px-1.5 py-0.5 text-[10px] disabled:opacity-40`}
                      disabled={!isTop}
                      title={isTop ? "Undo this edit" : "Undo newer patches first"}
                      onClick={() => onUndoPatch(patch.id)}
                    >
                      Undo
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      ) : null}

      <div className={`flex gap-1 border-t ${BORDER} p-2`}>
        <input
          className={`min-w-0 flex-1 text-[12px] ${INPUT}`}
          placeholder={endpoint.id === "local" ? "/help · /status · move id x y z" : "Ask the agent to edit the scene…"}
          value={input}
          disabled={busy}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button type="button" className={`${BTN} shrink-0 disabled:opacity-40`} disabled={busy || input.trim().length === 0} onClick={() => void send()}>
          Send
        </button>
      </div>
    </aside>
  );
}

function TranscriptRow({
  entry,
  patches,
  onUndo,
}: {
  entry: AgentTranscriptEntry;
  patches: readonly AgentPatchEntry[];
  onUndo: (id: string) => void;
}) {
  if (entry.kind === "user") {
    return (
      <div className="rounded-lg bg-cyan-500/10 px-2.5 py-1.5 text-[11px] text-cyan-50 ring-1 ring-inset ring-cyan-400/20">
        {entry.content}
      </div>
    );
  }
  if (entry.kind === "assistant") {
    return (
      <div className="rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[11px] whitespace-pre-wrap text-neutral-200 ring-1 ring-inset ring-white/[0.06]">
        {entry.content}
      </div>
    );
  }
  if (entry.kind === "error") {
    return (
      <div className="rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-100 ring-1 ring-inset ring-rose-400/25">
        {entry.content}
      </div>
    );
  }
  if (entry.kind === "tool") {
    const tone = entry.result.ok
      ? entry.result.mutated
        ? "text-emerald-200"
        : "text-neutral-400"
      : "text-rose-200";
    return (
      <div className={`font-mono text-[10px] ${tone}`}>
        ↳ {entry.result.patchSummary}
        {!entry.result.ok && entry.result.error !== undefined ? ` — ${entry.result.error}` : ""}
      </div>
    );
  }
  const patch = patches.find((p) => p.id === entry.patch.id) ?? entry.patch;
  return (
    <div className="flex items-center gap-1 rounded-md border border-violet-400/20 bg-violet-500/[0.08] px-2 py-1 text-[10px]">
      <span className={`min-w-0 flex-1 truncate font-mono ${patch.undone ? "text-neutral-600 line-through" : "text-violet-100"}`}>
        patch · {patch.summary}
      </span>
      {!patch.undone ? (
        <button type="button" className={`${BTN} px-1.5 py-0.5 text-[10px]`} onClick={() => onUndo(patch.id)}>
          Undo
        </button>
      ) : (
        <span className="text-neutral-600">undone</span>
      )}
    </div>
  );
}

/** Re-export for hosts that want a default endpoint without the panel. */
export { createDefaultAgentEndpoint };
