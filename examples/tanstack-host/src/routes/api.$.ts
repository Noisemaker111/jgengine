import { createFileRoute } from "@tanstack/react-router";

import { createReadsHandler } from "@jgengine/ws/readsHandler";

import { createPersistence } from "../lib/persistence";

const handleReads = createReadsHandler({ persistence: createPersistence });

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleReads(request),
    },
  },
});
