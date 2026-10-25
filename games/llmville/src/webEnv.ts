import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const viteEnv = (import.meta as any).env;

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_CONVEX_URL: z.url(),
    VITE_CONVEX_SITE_URL: z.url(),
  },
  runtimeEnv: viteEnv ?? {},
  emptyStringAsUndefined: true,
  // Vite always injects `import.meta.env.MODE`; its absence means we're outside
  // the bundler (e.g. node:test unit runs), so skip rather than hard-crash on load.
  skipValidation: viteEnv?.MODE === undefined,
});
