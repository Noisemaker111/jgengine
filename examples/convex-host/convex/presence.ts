import { createPresenceFunctions } from "@jgengine/convex/server";

export const { list, sync, leave } = createPresenceFunctions({ auth: "anonymous" });
