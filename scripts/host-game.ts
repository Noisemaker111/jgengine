/**
 * Host one in-repo game as an authoritative ws world server for local
 * two-client testing:
 *
 *   bun run host <gameId>              # ws://localhost:8080/ws
 *   PORT=9000 bun run host <gameId>
 *
 * Point two GamePlayerShell clients at the printed ws URL (VITE_JG_WS_URL for
 * the dev runner) and they share one server-authoritative world.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { GameDefinition } from "@jgengine/core/game/defineGame";
import type { GameContextContent } from "@jgengine/core/runtime/gameContext";
import type { ModelAssetRef } from "@jgengine/core/scene/assetCatalog";
import { createWorldGameServer } from "@jgengine/node/worldServer";

const gameId = process.argv[2];
if (gameId === undefined) {
  console.error("usage: bun run host <gameId>");
  process.exit(1);
}

const entry = pathToFileURL(resolve(process.cwd(), "Games", gameId, "src", "index.tsx")).href;
const loaded = (await import(entry)) as {
  game: { game: GameDefinition<ModelAssetRef, unknown>; content: GameContextContent };
};
const playable = loaded.game;

const port = Number(process.env["PORT"] ?? 8080);
const server = createWorldGameServer({
  resolveGame: (id) => (id === gameId ? { game: playable.game, content: playable.content } : null),
  allowAnonymous: true,
  port,
});
server.start();
console.log(`hosting "${gameId}" — point clients at ws://localhost:${server.port()}/ws`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
