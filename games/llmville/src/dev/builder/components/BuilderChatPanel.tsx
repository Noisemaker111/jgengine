import { Loader2, MessageCircle, Send, Trash2, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { BUILDER_CSS } from "@/dev/builder/components/builderStyles";
import { BuilderChatStore, useBuilderChatState, type BuilderChatEntry } from "@/dev/builder/builderChat";
import { cn } from "@/components/ui/cn";

const CHAT_PLACEHOLDER = "Ask or tell the agent what to do…";

export function BuilderChatPanel({ onClose }: { onClose: () => void }) {
  const state = useBuilderChatState();
  const listRef = useRef<HTMLDivElement>(null);
  const isRunning = state.status === "running";
  const canSend = !isRunning && state.draft.trim().length > 0;

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [state.entries.length, isRunning]);

  return (
    <aside className={cn(BUILDER_CSS.propsShell, "w-80")} aria-label="Scene chat">
      <header className={BUILDER_CSS.propsHeader}>
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--brand-teal)]/15 text-[var(--brand-teal)]">
            <MessageCircle className="h-4 w-4" />
          </div>
          <span className={BUILDER_CSS.propsTitle}>Scene chat</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => BuilderChatStore.clear()}
            disabled={state.entries.length === 0 || isRunning}
            className={cn(BUILDER_CSS.defaultButton, "h-7 gap-1 px-2 text-[10px] disabled:opacity-40")}
            aria-label="Clear chat"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className={cn(BUILDER_CSS.defaultButton, "h-7 w-7 px-0")}
            aria-label="Close scene chat"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {state.entries.length === 0 ? (
          <p className={BUILDER_CSS.emptyState}>
            Ask the agent about the scene or have it make changes — e.g. "move the selected rack against the
            back wall" or "what's in this room?"
          </p>
        ) : (
          <div className="grid gap-2.5">
            {state.entries.map((entry) => (
              <ChatEntryView key={entry.id} entry={entry} />
            ))}
          </div>
        )}
        {isRunning ? (
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-[var(--brand-cream-dim)]">
            <Loader2 className="h-3 w-3 animate-spin" />
            thinking…
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-[var(--surface-border)] p-3">
        <div className="relative w-full">
          <textarea
            rows={2}
            value={state.draft}
            disabled={isRunning}
            onChange={(event) => BuilderChatStore.setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && canSend) {
                event.preventDefault();
                BuilderChatStore.send();
              }
            }}
            placeholder={CHAT_PLACEHOLDER}
            className={cn(BUILDER_CSS.scenePromptField, "min-h-12 max-h-28 pr-10 disabled:opacity-60")}
            aria-label="Scene chat message"
          />
          <button
            type="button"
            disabled={!canSend}
            onClick={() => BuilderChatStore.send()}
            className="absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-md bg-[var(--brand-coral)] text-[#3a1b12] shadow-sm transition hover:bg-[#ec8f78] disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function ChatEntryView({ entry }: { entry: BuilderChatEntry }) {
  if (entry.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-lg bg-[var(--brand-teal)]/15 px-2.5 py-1.5 text-[12px] leading-snug text-[var(--brand-cream)]">
          {entry.text}
        </div>
      </div>
    );
  }

  if (entry.role === "assistant") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[88%] rounded-lg bg-black/25 px-2.5 py-1.5 text-[12px] leading-snug text-[var(--brand-cream)]">
          {entry.text}
        </div>
      </div>
    );
  }

  if (entry.role === "error") {
    return <p className={BUILDER_CSS.errorBox}>{entry.text}</p>;
  }

  return (
    <div className="rounded-md border border-[var(--surface-border)] bg-black/20 px-2.5 py-1.5">
      {entry.note ? <p className="mb-1 text-[11px] text-[var(--brand-cream-dim)]">{entry.note}</p> : null}
      <ul className="grid gap-0.5 font-mono text-[10px] leading-relaxed">
        {entry.calls.map((call, index) => (
          <li key={`${call.method}_${index}`} className={call.ok ? "text-[var(--brand-cream-dim)]" : "text-[#f0a097]"}>
            {"→ "}
            {call.method}({call.argsPreview}) {call.ok ? `✓ ${call.result}` : `✗ ${call.result}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
