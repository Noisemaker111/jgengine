import { StandaloneChatPanel, type StandaloneChatPanelProps } from "./standaloneChatPanel";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { ChatMessage, ChatSendResult } from "@jgengine/core/game/chat";
import type { ChatSync, ChatTransport } from "@jgengine/core/multiplayer/chatContract";
import { useGameContext } from "./provider";
import { useChat } from "./hooks";

/**
 * Lifts a callback-style ChatSync (e.g. createWsBackend().chatSyncFor(serverId))
 * into the hook-shaped ChatTransport contract. Create once per sync — outside
 * render or inside useMemo — so subscriptions survive re-renders.
 */
export function chatTransportFromSync(sync: ChatSync): ChatTransport {
  return {
    useMessages(channelId) {
      const [messages, setMessages] = useState<readonly ChatMessage[] | undefined>(undefined);
      useEffect(() => {
        if (channelId === "skip") return undefined;
        setMessages(undefined);
        return sync.subscribe(channelId, setMessages);
      }, [channelId]);
      return channelId === "skip" ? undefined : messages;
    },
    useActions() {
      return useMemo(
        () => ({ sendMessage: (args: { channelId: string; body: string }) => sync.send(args.channelId, args.body) }),
        [],
      );
    },
  };
}

export function ChatLog({
  channelId,
  limit,
  className,
  messageClassName,
  ownMessageClassName,
  renderMessage,
}: {
  channelId: string;
  limit?: number;
  className?: string;
  messageClassName?: string;
  ownMessageClassName?: string;
  renderMessage?: (message: ChatMessage) => ReactNode;
}) {
  const ctx = useGameContext();
  const messages = useChat(channelId, limit === undefined ? undefined : { limit });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = scrollRef.current;
    if (node !== null) node.scrollTop = node.scrollHeight;
  }, [messages.length]);
  return (
    <div ref={scrollRef} className={className} data-chat-log={channelId}>
      {messages.map((message) => (
        <div
          key={message.id}
          className={[messageClassName, message.fromUserId === ctx.player.userId ? ownMessageClassName : undefined].filter(Boolean).join(" ")}
          data-own-message={message.fromUserId === ctx.player.userId || undefined}
          data-chat-message
          data-from={message.fromUserId}
        >
          {renderMessage !== undefined ? (
            renderMessage(message)
          ) : (
            <>
              <span data-chat-from>{message.fromUserId}</span>
              <span data-chat-body>{message.body}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export function ChatInput({
  channelId,
  className,
  inputClassName,
  buttonClassName,
  placeholder,
  sendLabel,
  onSent,
  onRejected,
}: {
  channelId: string;
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
  placeholder?: string;
  sendLabel?: ReactNode;
  onSent?: (message: ChatMessage) => void;
  onRejected?: (reason: string) => void;
}) {
  const ctx = useGameContext();
  const [value, setValue] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const chat = ctx.game.chat;
  if (chat === undefined) return null;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result: ChatSendResult = chat.send(ctx.player.userId, channelId, value);
    if ("reason" in result) {
      setFailure(result.reason);
      onRejected?.(result.reason);
      return;
    }
    setFailure(null);
    setValue("");
    onSent?.(result.message);
  }
  return (
    <form className={className} data-chat-input={channelId} onSubmit={submit}>
      <input
        className={inputClassName}
        type="text"
        aria-label="Chat message"
        maxLength={240}
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
      />
      {failure !== null && <p role="alert">{failure}</p>}
      <button type="submit" className={buttonClassName} data-chat-send>
        {sendLabel ?? "Send"}
      </button>
    </form>
  );
}

export function ChannelTabs({
  channels,
  active,
  onSelect,
  className,
  tabClassName,
  activeTabClassName,
  renderTab,
}: {
  channels?: readonly string[];
  active: string;
  onSelect: (channelId: string) => void;
  className?: string;
  tabClassName?: string;
  activeTabClassName?: string;
  renderTab?: (channelId: string, isActive: boolean) => ReactNode;
}) {
  const ctx = useGameContext();
  const chat = ctx.game.chat;
  if (chat === undefined) return null;
  const ids = channels ?? chat.channels().map((def) => def.id);
  return (
    <div className={className} role="tablist" data-chat-tabs>
      {ids.map((channelId) => {
        const isActive = channelId === active;
        const classes = [tabClassName, isActive ? activeTabClassName : undefined]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={channelId}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={classes.length > 0 ? classes : undefined}
            data-channel={channelId}
            onClick={() => onSelect(channelId)}
          >
            {renderTab !== undefined ? renderTab(channelId, isActive) : channelId}
          </button>
        );
      })}
    </div>
  );
}

function ContextChatPanel({
  channels,
  initialChannel,
  limit,
  className,
  tabsClassName,
  tabClassName,
  activeTabClassName,
  logClassName,
  messageClassName,
  ownMessageClassName,
  defaultExpanded = true,
  toggleLabel = "Chat",
  inputClassName,
  inputFieldClassName,
  sendButtonClassName,
  placeholder,
  renderMessage,
  renderTab,
  onRejected,
}: {
  channels?: readonly string[];
  initialChannel?: string;
  limit?: number;
  className?: string;
  defaultExpanded?: boolean;
  toggleLabel?: ReactNode;
  tabsClassName?: string;
  tabClassName?: string;
  activeTabClassName?: string;
  logClassName?: string;
  messageClassName?: string;
  ownMessageClassName?: string;
  inputClassName?: string;
  inputFieldClassName?: string;
  sendButtonClassName?: string;
  placeholder?: string;
  renderMessage?: (message: ChatMessage) => ReactNode;
  /** Overrides a tab's label — e.g. render channel id `"proximity"` as "Nearby". */
  renderTab?: (channelId: string, isActive: boolean) => ReactNode;
  onRejected?: (reason: string) => void;
}) {
  const ctx = useGameContext();
  const chat = ctx.game.chat;
  const ids = channels ?? chat?.channels().map((def) => def.id) ?? [];
  const [active, setActive] = useState(initialChannel ?? ids[0] ?? "global");
  const [expanded, setExpanded] = useState(defaultExpanded);
  const panelRef = useRef<HTMLElement | null>(null);
  const focusPending = useRef(false);
  useEffect(() => {
    if (chat === undefined) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.key !== "Enter") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, [contenteditable]:not([contenteditable=false])")) return;
      event.preventDefault();
      focusPending.current = true;
      setExpanded(true);
      panelRef.current?.querySelector("input")?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [chat]);
  useEffect(() => {
    if (expanded && focusPending.current) {
      panelRef.current?.querySelector("input")?.focus();
      focusPending.current = false;
    }
  }, [expanded]);
  if (chat === undefined) return null;
  return (
    <section ref={panelRef} className={className} data-chat-panel data-expanded={expanded} onKeyDown={(event) => {
      if (event.key === "Escape") {
        (event.target as HTMLElement).blur();
        event.stopPropagation();
      }
    }}>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{toggleLabel}</button>
      {expanded && <>
      <ChannelTabs
        channels={ids}
        active={active}
        onSelect={setActive}
        className={tabsClassName}
        tabClassName={tabClassName}
        activeTabClassName={activeTabClassName}
        renderTab={renderTab}
      />
      <ChatLog
        channelId={active}
        limit={limit}
        className={logClassName}
        messageClassName={messageClassName}
        ownMessageClassName={ownMessageClassName}
        renderMessage={renderMessage}
      />
      <ChatInput
        channelId={active}
        className={inputClassName}
        inputClassName={inputFieldClassName}
        buttonClassName={sendButtonClassName}
        placeholder={placeholder}
        onRejected={onRejected}
      />
      </>}
    </section>
  );
}


/** Chat behavior over a game context or externally supplied server messages. */
export function ChatPanel<T extends ChatMessage = ChatMessage>(props: Parameters<typeof ContextChatPanel>[0] | StandaloneChatPanelProps<T>) {
  return "messages" in props ? <StandaloneChatPanel {...props} /> : <ContextChatPanel {...props} />;
}
