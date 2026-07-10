import { createFileRoute } from "@tanstack/react-router";

import { githubProxyHandler } from "@jgengine/github/server";

const token = process.env.GITHUB_TOKEN || undefined;
const handle = githubProxyHandler({ token });

export const Route = createFileRoute("/api/github-proxy")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
