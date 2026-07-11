import { createChatFunctions } from "@jgengine/convex/server";

export const { messages, sendMessage } = createChatFunctions({ auth: "anonymous" });
