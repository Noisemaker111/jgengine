import { createFileRoute } from "@tanstack/react-router";

import { githubContributionsHandler } from "@jgengine/github/server";

const token = process.env.GITHUB_TOKEN || undefined;
const handle = githubContributionsHandler({ token });

export const Route = createFileRoute("/api/github-contributions")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
    },
  },
});
