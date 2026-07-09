import { useEntityChatBubble } from "@jgengine/react/chatBubbles";

import { ChatBubble } from "@/components/ui/chat-bubble";

export function EntityChatBubble({
  instanceId,
  x,
  y,
  ttlMs,
  channelId,
  className,
}: {
  instanceId: string;
  x?: number;
  y?: number;
  ttlMs?: number;
  channelId?: string;
  className?: string;
}) {
  const bubble = useEntityChatBubble(instanceId, { ttlMs, channelId });
  if (bubble === null) return null;
  return <ChatBubble body={bubble.body} x={x} y={y} className={className} />;
}
