export type ConvexApiKind = "query" | "mutation";

export interface ConvexApiMethod {
  path: string;
  kind: ConvexApiKind;
  description: string;
  args: string;
}

/** Canonical Convex paths — same functions the web client calls. */
export const convexApiCatalog: Record<string, readonly ConvexApiMethod[]> = {
  world: [
    { path: "world:state", kind: "query", description: "Money, tokens, inventories, tutorialStage", args: "{ gameId }" },
    { path: "world:scene", kind: "query", description: "Racks, placed items, models, training jobs, events", args: "{ gameId }" },
    { path: "world:worldScene", kind: "query", description: "Every player's racks and placed items in the chunks around a point", args: "{ x, z, radius? }" },
    { path: "world:resolveEvent", kind: "mutation", description: "Resolve a pending world event", args: "{ gameId, externalId, eventId }" },
  ],
  datacenter: [
    { path: "datacenter:listClaims", kind: "query", description: "Claimed floor cells with owners near a viewer chunk center", args: "{ x, z, radius? }" },
    { path: "datacenter:myClaims", kind: "query", description: "This game's claimed cells", args: "{ gameId, externalId? }" },
    { path: "datacenter:claimCell", kind: "mutation", description: "Buy a floor cell to build on", args: "{ gameId, externalId, cx, cz }" },
  ],
  presence: [
    {
      path: "worldPresence:ensureHumanPresence",
      kind: "mutation",
      description: "Join the shared-datacenter avatar session",
      args: "{ gameId, externalId }",
    },
    {
      path: "worldPresence:syncPlayerPosition",
      kind: "mutation",
      description: "Sync absolute world position while roaming the datacenter",
      args: "{ position: { x, z, y? }, rotationY?, rotationPitch?, externalId? }",
    },
    {
      path: "worldPresence:listOnlinePresences",
      kind: "query",
      description: "Live feed of players and bots in the chunks around a viewer chunk key",
      args: "{ viewerChunkKey? }",
    },
  ],
  chat: [
    {
      path: "worldChat:recent",
      kind: "query",
      description: "Last messages posted in the shared world chat, newest first",
      args: "{ limit? }",
    },
    {
      path: "worldChat:send",
      kind: "mutation",
      description: "Post a message to the shared world chat (240 chars, 1 per 2s)",
      args: "{ text, externalId? }",
    },
  ],
  store: [
    { path: "store:catalog", kind: "query", description: "Shop SKUs", args: "{ gameId }" },
    { path: "store:buy", kind: "mutation", description: "Buy hardware, cooling, or build items", args: "{ gameId, externalId, itemId, quantity? }" },
    { path: "store:unlock", kind: "mutation", description: "Unlock model license or research item", args: "{ gameId, externalId, itemId }" },
    { path: "store:sell", kind: "mutation", description: "Sell stored item or trained model", args: "{ gameId, externalId, itemId }" },
  ],
  build: [
    { path: "build:place", kind: "mutation", description: "Place item from storage onto floor grid", args: "{ gameId, externalId, itemId, x, y, z, direction }" },
    { path: "build:pickup", kind: "mutation", description: "Pick up placed decor", args: "{ gameId, externalId, itemId, playerX, playerZ }" },
  ],
  rack: [
    { path: "rack:moveHardware", kind: "mutation", description: "Move GPU between warehouse stock and rack slots (install, uninstall, swap, reorder); rackId is the world-object instance id from world:scene racks[].id", args: "{ gameId, externalId, rackId, from: { kind: 'stock', hardwareId } | { kind: 'slot', slot }, to: { kind: 'stock' } | { kind: 'slot', slot? } }" },
    { path: "inference:assignCard", kind: "mutation", description: "Dedicate a GPU slot to training, scraping, or serving", args: "{ gameId, externalId, rackId, slotIndex, lane, targetModelId? }" },
    { path: "inference:unassignCard", kind: "mutation", description: "Clear GPU slot dedication", args: "{ gameId, externalId, rackId, slotIndex }" },
    { path: "inference:setScrapeTier", kind: "mutation", description: "Set active scraping tier for scraping-lane GPUs", args: "{ gameId, externalId, tier }" },
    { path: "rack:cool", kind: "mutation", description: "Install cooling on rack", args: "{ gameId, externalId, rackId, coolingUnitId }" },
    { path: "rack:uncool", kind: "mutation", description: "Remove rack cooler to storage", args: "{ gameId, externalId, rackId }" },
  ],
  models: [
    { path: "models:train", kind: "mutation", description: "Start fine-tune (spends data tokens)", args: "{ gameId, externalId, baseModelId, overtrainBracket? }" },
    { path: "models:launch", kind: "mutation", description: "Run licensed scraper model", args: "{ gameId, externalId, baseModelId }" },
    { path: "models:reveal", kind: "mutation", description: "Reveal trained model before serving", args: "{ externalId, modelId }" },
    { path: "models:quantize", kind: "mutation", description: "Quantize for VRAM/throughput tradeoff", args: "{ externalId, modelId, precision }" },
    { path: "models:rename", kind: "mutation", description: "Rename a trained model", args: "{ externalId, modelId, newName }" },
  ],
  serving: [
    { path: "serving:serve", kind: "mutation", description: "Serve owned model for money", args: "{ externalId, modelId }" },
    { path: "serving:stats", kind: "query", description: "Live serving throughput and income", args: "{ gameId }" },
    { path: "serving:mode", kind: "mutation", description: "Serving mode tradeoff", args: "{ gameId, externalId, mode }" },
  ],
  bills: [
    { path: "bills:list", kind: "query", description: "Pending rent and utility bills", args: "{ gameId }" },
    { path: "bills:pay", kind: "mutation", description: "Pay a bill", args: "{ gameId, externalId, billId }" },
  ],
  market: [
    { path: "market:offers", kind: "query", description: "Vendor models available to host", args: "{ gameId, reputation? }" },
    { path: "market:host", kind: "mutation", description: "Start hosting contract", args: "{ gameId, externalId, vendorModelId, revenueShareHost? }" },
    { path: "market:unhost", kind: "mutation", description: "End hosting contract", args: "{ gameId, externalId, hostedModelId }" },
  ],
};

export const convexApiHowToCall = {
  summary:
    "No npm package required. The world owner connects a bot in-game and shares its token; gameplay goes through the Convex HTTP API with that Bearer token.",
  siteUrl: "Convex site URL — this playbook and /agent/api/v1 discovery (not llmville.com)",
  convexUrl: "Convex deployment URL — POST /api/query and /api/mutation here",
  getToken:
    "The world owner opens the Bot app in the in-game tablet, connects a bot, and pastes you the token. One bot per owner; long-lived.",
  ping: "GET {siteUrl}/agent/api/v1/ping with Authorization: Bearer {token} → { externalId, gameId }",
  query: "POST {convexUrl}/api/query",
  mutation: "POST {convexUrl}/api/mutation",
  headers: { Authorization: "Bearer {token}", "Content-Type": "application/json" },
  body: { path: "store:buy", args: { gameId: "…", externalId: "bot:<owner>", itemId: "gpu_1", quantity: 2 }, format: "json" },
  contextArgs: "Pass gameId and the bot actor externalId (bot:<owner>, from /ping) on most gameplay mutations.",
} as const;
