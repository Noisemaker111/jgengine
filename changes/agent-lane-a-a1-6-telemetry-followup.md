### Fixed

- `bun run debug <game>` now finds the server `bun dev` started. The website dev server publishes the same checkout marker the runner does (`scripts/devServerMarker.ts`, written at listen, removed on shutdown, dev builds only), and the marker records the host that answers, since Vite's default `localhost` can be IPv6-only where `127.0.0.1` hangs.
- The website dev server serves `GET/POST /__jgengine/report` too, so a game opened at `/games/<id>` reports from the `/play` runner it embeds.
- The in-page sampler installs when the dev report route answers, not on a build-time `PROD` check: the `/play` runner is a production build, so the old check silently disabled the report on `bun dev`.
- A report taken inside the sampler's warmup is no longer judged on link/framebuffer counts, which only mean something after the warmup baseline exists.
