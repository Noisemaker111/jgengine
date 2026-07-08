import { createFileRoute } from "@tanstack/react-router";

import { githubProxyHandler } from "@jgengine/github/server";

const handle = githubProxyHandler({ token: process.env.GITHUB_TOKEN });

export const Route = createFileRoute("/api/github")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
