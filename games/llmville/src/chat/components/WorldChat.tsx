/** @jsxImportSource @jgengine/core/ui/jsx */
import { useCallback, useEffect, useRef, useState } from "@jgengine/core/ui/jsx";
import { RuneField, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import type { ChatMessage } from "@jgengine/core/chat/chat";
import { suspendPlayControls } from "@jgengine/core/game/controlGate";
import { useOptionalGameContext } from "@jgengine/ui/provider";
import { WORLD_CHAT_CHANNEL } from "@llmville/game/multiplayer/presencePolicy";

import { worldChatTransport } from "../worldChatTransport";
import type { ReadyWorldViewModel } from "../../runtime/worldViewModel";
import { useTabletNavContext } from "../../tablet/components/tabletNav";
import { Button, C, ErrorText, FULL, Icon, Muted, Row, Text, useCompact } from "../../ui/kit";

/** Quick replies. No emoji: the native surface has no colour emoji font. */
const REACTIONS = ["Hello, neighbors!", "Nice lab!"] as const;
/** The longest message a neighbor can send. */
export const CHAT_MAX_LENGTH = 500;

/** What the chat panel shows and does; the container wires it to the world chat transport. */
export interface WorldChatVm {
  messages: readonly ChatMessage[] | undefined;
  playerId: string;
  open: boolean;
  draft: string;
  setDraft: (text: string) => void;
  sending: boolean;
  error: string | null;
  send: (body?: string) => void;
  openChat: () => void;
  close: () => void;
}

export function WorldChatView({ vm }: { vm: WorldChatVm }) {
  const { height } = useRuneViewport();
  const compact = useCompact();
  const lift = compact ? 240 : 0;
  if (!vm.open) return <RuneView anchor="bottom-left" safe inset={16} padding={[0, 0, lift, 0]}>
    <Button tone="chip" icon="chat" fill="#16201ee6" border={{ width: 1, color: "#5fc2a840" }} label="Open chat" onPress={vm.openChat}>
      <Text size={14} weight={700}>Chat</Text>{compact ? null : <Text size={12} color={C.creamDim}>Enter</Text>}
    </Button>
  </RuneView>;
  return <RuneView anchor="bottom-left" safe inset={12} padding={[0, 0, lift, 0]}>
    <RuneView width={352} responsive={{ phone: { width: 340 } }} maxHeight={Math.min(416, height * 0.6)} fill="#16201ef2" radius={16} border={{ width: 1, color: "#5fc2a840" }} label="Neighborhood chat" role="dialog">
      <Row justify="between" padding={[10, 10, 10, 16]} width={FULL}>
        <Text size={14} weight={700}>Neighborhood</Text>
        <Button tone="ghost" label="Close chat" padding={6} minHeight={0} onPress={vm.close}><Icon name="close" size={16} /></Button>
      </Row>
      <RuneView height={1} fill={C.line} width={FULL} />
      <RuneView scroll height={Math.min(416, height * 0.6) - 150} padding={16} gap={10} width={FULL} role="log" label="Chat messages">
        {vm.messages === undefined ? <Muted size={14}>Connecting to your neighbors…</Muted>
          : vm.messages.length === 0 ? <Muted size={14}>Say hello, celebrate a launch, or ask a neighbor for help.</Muted>
            : vm.messages.map((message) => <RuneView key={message.id} gap={2}>
              <Text size={13} weight={800} color={C.teal}>{message.fromUserId === vm.playerId ? "You" : message.fromLabel ?? "Anonymous"}</Text>
              <Text size={14}>{message.body}</Text>
            </RuneView>)}
      </RuneView>
      <Row gap={8} padding={[0, 12, 8, 12]}>
        {REACTIONS.map((reaction) => <Button key={reaction} tone="chip" disabled={vm.sending} onPress={() => vm.send(reaction)}>{reaction}</Button>)}
      </Row>
      <RuneView height={1} fill={C.line} width={FULL} />
      {/* The field mounts focused, so the Enter (or tap) that opened chat leaves it ready to type. */}
      <RuneView padding={12} gap={8} width={FULL}>
        {vm.error === null ? null : <ErrorText size={12}>{vm.error}</ErrorText>}
        <Row gap={8} width={FULL}>
          <RuneField autoFocus variant="field" family="Nunito" size={14} grow={1} label="Message to neighbors" placeholder="Say something…" maxLength={CHAT_MAX_LENGTH}
            disabled={vm.sending} value={vm.draft} onChange={vm.setDraft} onSubmit={() => vm.send()} />
          <Button tone="primary" label="Send message" padding={12} disabled={vm.sending || vm.draft.trim() === ""} onPress={() => vm.send()}><Icon name="send" size={16} color={C.ink} /></Button>
        </Row>
      </RuneView>
    </RuneView>
  </RuneView>;
}

export function WorldChat({ world, placing, open, setOpen, fixtureMessages }: { world: ReadyWorldViewModel; placing: boolean; open: boolean; setOpen: (open: boolean) => void; fixtureMessages?: readonly ChatMessage[] | undefined }) {
  const ctx = useOptionalGameContext();
  const { tabletOpen, rackMenuOverlayRackId } = useTabletNavContext();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const live = worldChatTransport.useMessages(fixtureMessages ? "skip" : WORLD_CHAT_CHANNEL);
  const messages = fixtureMessages ?? live;
  const chat = worldChatTransport.useActions();
  const blocked = placing || tabletOpen || rackMenuOverlayRackId !== null;
  const visible = open && !blocked;

  const openChat = useCallback(() => {
    if (blocked) return;
    document.exitPointerLock?.();
    setOpen(true);
  }, [blocked, setOpen]);

  useEffect(() => (visible && ctx !== null ? suspendPlayControls(ctx) : undefined), [ctx, visible]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat) return;
      if (visible && event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(false);
        return;
      }
      // Open, Enter belongs to the field (it sends); closed, it opens the chat unless a page dialog has the keys.
      if (visible || event.key !== "Enter" || blocked || document.querySelector('[role="dialog"]')) return;
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openChat();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [visible, blocked, openChat, setOpen]);

  const send = async (body = draft) => {
    if (!body.trim() || busy.current) return;
    busy.current = true;
    setSending(true);
    setError(null);
    try {
      const result = await chat.sendMessage({ channelId: WORLD_CHAT_CHANNEL, body: body.trim() });
      if (!result.ok) {
        setError(result.reason ?? "Message could not be sent. Try again.");
        return;
      }
      setDraft("");
    } catch {
      setError("Couldn't send. Your message is saved here; try again.");
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  if (blocked) return null;
  const vm: WorldChatVm = {
    messages, playerId: world.playerId, open: visible, draft, setDraft, sending, error,
    send: (body) => void send(body), openChat, close: () => setOpen(false),
  };
  return <WorldChatView vm={vm} />;
}
