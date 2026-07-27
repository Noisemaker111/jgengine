import { createPresenceFunctions } from "@jgengine/convex/server";

export const { list, sync, leave, reapIdlePresence } = createPresenceFunctions({ auth: "anonymous" });
