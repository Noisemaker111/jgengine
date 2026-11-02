import type { ChatMessage } from "@jgengine/core/chat/chat";

const PREVIEW_BASE_TIME = new Date("2026-01-01T09:41:00").getTime();

export const WORLD_CHAT_PREVIEW_MESSAGES: readonly ChatMessage[] = [
  {
    id: "preview-1",
    channelId: "global",
    fromUserId: "neighbor-1",
    fromLabel: "raye",
    body: "anyone selling a spare H100? my rack is half empty",
    at: PREVIEW_BASE_TIME,
  },
  {
    id: "preview-2",
    channelId: "global",
    fromUserId: "preview-player",
    fromLabel: "you",
    body: "just launched a 7B, come look at the benchmark",
    at: PREVIEW_BASE_TIME + 45_000,
  },
  {
    id: "preview-3",
    channelId: "global",
    fromUserId: "neighbor-2",
    fromLabel: "kobi",
    body: "cooling bill was brutal this month",
    at: PREVIEW_BASE_TIME + 92_000,
  },
  {
    id: "preview-4",
    channelId: "global",
    fromUserId: "neighbor-1",
    fromLabel: "raye",
    body: "meet at the north claim block?",
    at: PREVIEW_BASE_TIME + 140_000,
  },
];
