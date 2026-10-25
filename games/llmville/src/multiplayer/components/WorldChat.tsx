import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@llmville/backend/convex/_generated/api";
import { MessageCircle, Send, X } from "lucide-react";
import { useWorldServer } from "@/runtime/worldServerSession";
import { engineActions } from "@/runtime/gameEngine";
import type { ReadyWorldViewModel } from "@/runtime/worldViewModel";
import { useTabletNavContext } from "@/tablet/components/tabletNav";
import { exitPointerLock } from "@/movement/movementInput";

export interface WorldChatMessage {
  id: string;
  authorExternalId: string;
  authorName: string;
  text: string;
  createdAt: number;
}

export function WorldChat({ world, placing, open, setOpen, fixtureMessages }: { world: ReadyWorldViewModel; placing: boolean; open: boolean; setOpen: (open: boolean) => void; fixtureMessages?: readonly WorldChatMessage[] }) {
  const { serverId } = useWorldServer();
  const { tabletOpen, rackMenuOverlayRackId } = useTabletNavContext();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const recent = useQuery(api.multiplayer.worldChat.recent, fixtureMessages ? "skip" : {});
  const messages = useMemo(() => fixtureMessages ?? recent?.slice().reverse(), [fixtureMessages, recent]);
  const sendMessage = useMutation(api.multiplayer.worldChat.send);
  const visible = open && !tabletOpen && rackMenuOverlayRackId === null && !placing;
  const openChat = useCallback(() => {
    if (placing || tabletOpen || rackMenuOverlayRackId !== null) return;
    world.engine.dispatch(engineActions.resetMovementKeys());
    exitPointerLock();
    setOpen(true);
    input.current?.focus();
  }, [placing, tabletOpen, rackMenuOverlayRackId, world.engine, setOpen]);

  useEffect(() => {
    if (visible) input.current?.focus();
  }, [visible]);

  useEffect(() => {
    if (visible && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, visible]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat) return;
      if (visible && event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(false);
        return;
      }
      if (event.key !== "Enter" || placing || tabletOpen || rackMenuOverlayRackId !== null || document.querySelector('[role="dialog"]')) return;
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openChat();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [visible, placing, tabletOpen, rackMenuOverlayRackId, openChat, setOpen]);

  const send = async (body = draft) => {
    if (!serverId || !body.trim() || busy.current) return;
    busy.current = true;
    setSending(true);
    setError(null);
    try {
      const result = await sendMessage({ text: body.trim(), externalId: world.playerId });
      if (!result.sent) {
        setError(result.reason ?? "Message could not be sent. Try again.");
        return;
      }
      setDraft("");
      input.current?.focus();
    } catch {
      setError("Couldn't send. Your message is saved here; try again.");
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  if (tabletOpen || rackMenuOverlayRackId !== null || placing) return null;
  return (
    <section data-chat-panel data-no-pointer-lock="true" aria-label="Neighborhood chat" className="pointer-events-auto absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 z-40 max-sm:bottom-[calc(env(safe-area-inset-bottom)+10rem)]">
      {visible ? (
        <div className="flex max-h-[min(26rem,60dvh)] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-brand-teal/25 bg-brand-ink/95 text-brand-cream shadow-xl backdrop-blur-xl">
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="text-sm font-semibold">Neighborhood</span>
            <button type="button" aria-label="Close chat" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-white/10"><X size={18} /></button>
          </div>
          <div ref={log} role="log" aria-live="polite" aria-relevant="additions" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm select-text">
            {messages === undefined ? <p className="text-brand-cream-dim">Connecting to your neighbors…</p> : messages.length === 0 ? <p className="text-brand-cream-dim">Say hello, celebrate a launch, or ask a neighbor for help.</p> : messages.map((message) => (
              <p key={message.id} className="break-words"><span className="mr-2 font-semibold text-brand-teal">{message.authorExternalId === world.playerId ? "You" : message.authorName}</span>{message.text}</p>
            ))}
          </div>
          <div className="flex shrink-0 gap-2 px-3 pb-2">
            {["Hello, neighbors! 👋", "Nice lab! ✨"].map((reaction) => <button key={reaction} type="button" disabled={sending || !serverId} onClick={() => void send(reaction)} className="rounded-full bg-white/5 px-3 py-1 text-xs hover:bg-white/10 disabled:opacity-50">{reaction}</button>)}
          </div>
          <form className="shrink-0 border-t border-white/10 p-3" onSubmit={(event) => { event.preventDefault(); void send(); }}>
            {error && <p role="alert" className="mb-2 text-xs text-brand-coral">{error}</p>}
            <div className="flex gap-2">
              <input ref={input} aria-label="Message to neighbors" readOnly={sending} maxLength={500} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Say something…" className="min-w-0 flex-1 rounded-xl bg-white/5 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-teal" onKeyDown={(event) => { if (event.nativeEvent.isComposing && event.key === "Enter") event.preventDefault(); }} />
              <button type="submit" aria-label="Send message" disabled={!serverId || sending || !draft.trim()} className="rounded-xl bg-brand-teal p-3 text-brand-ink disabled:opacity-40"><Send size={16} /></button>
            </div>
          </form>
        </div>
      ) : <button type="button" onClick={openChat} className="flex items-center gap-2 rounded-full border border-brand-teal/25 bg-brand-ink/90 px-4 py-2 text-sm text-brand-cream shadow-lg"><MessageCircle size={16} />Chat <kbd className="hidden text-xs text-brand-cream-dim sm:inline">Enter</kbd></button>}
    </section>
  );
}
