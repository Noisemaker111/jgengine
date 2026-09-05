import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { DEFAULT_CHAT_BODY_LENGTH, type ChatMessage } from "@jgengine/core/game/chat";
import type { ChatSendOutcome } from "@jgengine/core/multiplayer/chatContract";

type StatefulClass = string | ((expanded: boolean) => string);
const classFor = (value: StatefulClass | undefined, expanded: boolean) => typeof value === "function" ? value(expanded) : value;

/** Message-store inputs and caller-owned styling for standalone chat. */
export interface StandaloneChatPanelProps<T extends ChatMessage = ChatMessage> {
  messages: readonly T[];
  userId: string;
  onSend: (body: string) => Promise<ChatSendOutcome | void> | ChatSendOutcome | void;
  className?: StatefulClass;
  logClassName?: StatefulClass;
  inputClassName?: StatefulClass;
  inputFieldClassName?: StatefulClass;
  messageClassName?: string;
  ownMessageClassName?: string;
  style?: CSSProperties;
  defaultExpanded?: boolean;
  collapsedLimit?: number;
  limit?: number;
  maxLength?: number;
  hotkeysEnabled?: boolean;
  onFocus?: () => void;
  placeholder?: string;
  collapsedPlaceholder?: string;
  emptyLabel?: ReactNode;
  renderMessage?: (message: T, state: { own: boolean; expanded: boolean; index: number; count: number }) => ReactNode;
}

/**
 * Headless chat interaction for external message stores. Prefer the ChatPanel entrypoint.
 * @capability standalone-chat render persisted chat with focus controls and visible send failures
 */
export function StandaloneChatPanel<T extends ChatMessage>({ messages, userId, onSend, className, logClassName, inputClassName, inputFieldClassName, messageClassName, ownMessageClassName, style, defaultExpanded = false, collapsedLimit = 3, limit = 50, maxLength = DEFAULT_CHAT_BODY_LENGTH, hotkeysEnabled = true, onFocus, placeholder = "Message the world...", collapsedPlaceholder = "Enter to chat", emptyLabel = "Press Enter to chat", renderMessage }: StandaloneChatPanelProps<T>) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [draft, setDraft] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hotkeysEnabled) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.key !== "Enter") return;
      if ((event.target as HTMLElement | null)?.closest?.("input, textarea, select, button, [contenteditable]:not([contenteditable=false])")) return;
      event.preventDefault();
      inputRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [hotkeysEnabled]);
  useEffect(() => {
    if (expanded && logRef.current !== null) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [expanded, messages.length]);
  const visible = messages.slice(-Math.max(1, expanded ? limit : collapsedLimit));
  return <section data-chat-panel data-expanded={expanded} className={classFor(className, expanded)} style={style}>
    <div role="log" aria-live="polite" ref={logRef} className={classFor(logClassName, expanded)}>
      {visible.length === 0 ? emptyLabel : visible.map((message, index) => {
        const own = message.fromUserId === userId;
        return <div key={message.id} data-own-message={own || undefined} className={[messageClassName, own ? ownMessageClassName : undefined].filter(Boolean).join(" ")}>
          {renderMessage?.(message, { own, expanded, index, count: visible.length }) ?? <>{message.fromUserId}: {message.body}</>}
        </div>;
      })}
    </div>
    <form className={classFor(inputClassName, expanded)} onSubmit={(event) => {
      event.preventDefault();
      if (sending || draft.trim().length === 0) return;
      const body = draft;
      setSending(true);
      setFailure(null);
      void Promise.resolve().then(() => onSend(body)).then((outcome) => {
        if (outcome && !outcome.ok) setFailure(outcome.reason ?? "Could not send message");
        else setDraft((current) => current === body ? "" : current);
      }).catch((error: unknown) => setFailure(error instanceof Error ? error.message : "Could not send message")).finally(() => setSending(false));
    }}>
      <input ref={inputRef} aria-label="Chat message" aria-busy={sending} className={classFor(inputFieldClassName, expanded)} value={draft} maxLength={maxLength} placeholder={expanded ? placeholder : collapsedPlaceholder} onChange={(event) => setDraft(event.target.value)} onFocus={() => { onFocus?.(); setExpanded(true); }} onBlur={() => setExpanded(false)} onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.blur(); event.stopPropagation(); } }} />
    </form>
    {failure !== null && <p role="alert">{failure}</p>}
  </section>;
}
