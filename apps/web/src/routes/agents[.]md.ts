import { createFileRoute } from "@tanstack/react-router";

import { buildLlmsFullTxt } from "../lib/agentDocs";

/**
 * `/agents.md` — the agent brief served as markdown (the AGENTS.md convention),
 * alongside the `/llms.txt` + `/llms-full.txt` plain-text front door. Reuses the
 * same `agentDocs` source so the two cannot drift. Reaching SSR for a `.md`
 * request in dev depends on `mdSsrRoutesDevPlugin` in `vite.config.ts`; see the
 * comment there for why nitro's dev asset heuristic otherwise 404s `.md` routes.
 */
export const Route = createFileRoute("/agents.md")({
  server: {
    handlers: {
      GET: () =>
        new Response(buildLlmsFullTxt(), {
          headers: { "Content-Type": "text/markdown; charset=utf-8" },
        }),
    },
  },
});
