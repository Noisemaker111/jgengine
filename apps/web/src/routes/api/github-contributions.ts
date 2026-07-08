import { createFileRoute } from "@tanstack/react-router";

import { githubContributionsHandler } from "@jgengine/github/server";

const handle = githubContributionsHandler({ token: process.env.GITHUB_TOKEN });

export const Route = createFileRoute("/api/github-contributions")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
    },
  },
});
