import { createFileRoute } from "@tanstack/react-router";

import { buildLlmsFullTxt } from "../lib/agentDocs";

export const Route = createFileRoute("/llms-full.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(buildLlmsFullTxt(), {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
    },
  },
});
