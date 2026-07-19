import { createFileRoute } from "@tanstack/react-router";

import { buildLlmsTxt } from "../lib/agentDocs";

export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(buildLlmsTxt(), {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
    },
  },
});
