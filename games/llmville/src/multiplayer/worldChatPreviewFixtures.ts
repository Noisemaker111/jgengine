import type { WorldChatMessage } from "@/multiplayer/components/WorldChat";

const PREVIEW_BASE_TIME = new Date("2026-01-01T09:41:00").getTime();

export const WORLD_CHAT_PREVIEW_MESSAGES: readonly WorldChatMessage[] = [
  {
    id: "preview-1",
    authorExternalId: "neighbor-1",
    authorName: "raye",
    text: "anyone selling a spare H100? my rack is half empty",
    createdAt: PREVIEW_BASE_TIME,
  },
  {
    id: "preview-2",
    authorExternalId: "preview-player",
    authorName: "you",
    text: "just launched a 7B, come look at the benchmark",
    createdAt: PREVIEW_BASE_TIME + 45_000,
  },
  {
    id: "preview-3",
    authorExternalId: "neighbor-2",
    authorName: "kobi",
    text: "cooling bill was brutal this month",
    createdAt: PREVIEW_BASE_TIME + 92_000,
  },
  {
    id: "preview-4",
    authorExternalId: "neighbor-1",
    authorName: "raye",
    text: "meet at the north claim block?",
    createdAt: PREVIEW_BASE_TIME + 140_000,
  },
];
