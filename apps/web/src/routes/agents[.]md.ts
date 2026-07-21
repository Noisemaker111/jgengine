import { createFileRoute } from "@tanstack/react-router";

import { buildLlmsFullTxt } from "../lib/agentDocs";

/**
 * `/agents.md` — the agent brief served as Markdown. Same content as
 * `/llms-full.txt`, exposed under the `.md` extension coding agents look for
 * (agents.md convention). Proves `.md` server routes reach SSR in dev, matching
 * the `.txt`/`.xml` routes; see apps/web/vite.config.ts `mdServerRouteDevPlugin`.
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
