import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { worldModelAssetCatalog } from "@llmville/game/world/worldModelCatalog";
import { llmvilleWorld } from "@llmville/game/game/world";
import { convexPresenceTransport } from "@/multiplayer/convexPresenceTransport";

/**
 * No `replication` policy on purpose. Placed geometry never travels through the engine's `objects`
 * snapshot module — it reaches clients as bounded chunk reads via `api.world.worldScene` — and player
 * presence rides the `ConvexPresenceTransport` lane rather than the `entities` module, so
 * `aoiRadius` would cull nothing. Spatial culling for this game is the chunk read seam.
 */
export const gameConfig = defineGameDefinition({
  name: "LLMville",
  assets: worldModelAssetCatalog,
  world: llmvilleWorld,
  multiplayer: convexPresenceTransport,
  lifecycle: "always-live",
});
