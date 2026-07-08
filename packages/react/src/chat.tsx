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
  renderMessage,
}: {
  channelId: string;
  limit?: number;
  className?: string;
  messageClassName?: string;
  renderMessage?: (message: ChatMessage) => ReactNode;
}) {
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
          className={messageClassName}
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
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result: ChatSendResult = ctx.game.chat.send(ctx.player.userId, channelId, value);
    if ("reason" in result) {
      onRejected?.(result.reason);
      return;
    }
    setValue("");
    onSent?.(result.message);
  }
  return (
    <form className={className} data-chat-input={channelId} onSubmit={submit}>
      <input
        className={inputClassName}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
      />
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
  const ids = channels ?? ctx.game.chat.channels().map((def) => def.id);
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

export function ChatPanel({
  channels,
  initialChannel,
  limit,
  className,
  tabsClassName,
  tabClassName,
  activeTabClassName,
  logClassName,
  messageClassName,
  inputClassName,
  inputFieldClassName,
  sendButtonClassName,
  placeholder,
  renderMessage,
  onRejected,
}: {
  channels?: readonly string[];
  initialChannel?: string;
  limit?: number;
  className?: string;
  tabsClassName?: string;
  tabClassName?: string;
  activeTabClassName?: string;
  logClassName?: string;
  messageClassName?: string;
  inputClassName?: string;
  inputFieldClassName?: string;
  sendButtonClassName?: string;
  placeholder?: string;
  renderMessage?: (message: ChatMessage) => ReactNode;
  onRejected?: (reason: string) => void;
}) {
  const ctx = useGameContext();
  const ids = channels ?? ctx.game.chat.channels().map((def) => def.id);
  const [active, setActive] = useState(initialChannel ?? ids[0] ?? "global");
  return (
    <section className={className} data-chat-panel>
      <ChannelTabs
        channels={ids}
        active={active}
        onSelect={setActive}
        className={tabsClassName}
        tabClassName={tabClassName}
        activeTabClassName={activeTabClassName}
      />
      <ChatLog
        channelId={active}
        limit={limit}
        className={logClassName}
        messageClassName={messageClassName}
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
    </section>
  );
}
