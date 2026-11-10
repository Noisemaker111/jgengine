import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const viteEnv = (import.meta as any).env;

/** The local Convex deployment the README's "Develop" steps start; where a page with no backend set looks. */
const LOCAL_CONVEX_URL = "http://127.0.0.1:3210";
const LOCAL_CONVEX_SITE_URL = "http://127.0.0.1:3211";

if (viteEnv?.MODE !== undefined && !viteEnv.VITE_CONVEX_URL) {
  console.warn(`degraded: VITE_CONVEX_URL is not set, so LLMville looks for its backend at ${LOCAL_CONVEX_URL}`);
}

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_CONVEX_URL: z.url().default(LOCAL_CONVEX_URL),
    VITE_CONVEX_SITE_URL: z.url().default(LOCAL_CONVEX_SITE_URL),
  },
  runtimeEnv: viteEnv ?? {},
  emptyStringAsUndefined: true,
  // Vite always injects `import.meta.env.MODE`; its absence means we're outside
  // the bundler (e.g. node:test unit runs), so skip rather than hard-crash on load.
  skipValidation: viteEnv?.MODE === undefined,
});
