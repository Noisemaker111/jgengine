export const AGENT_PLAYBOOK_VERSION = 4;

export interface AgentPlaybookLoopStep {
  id: string;
  goal: string;
  calls: string[];
  hints?: string[];
}

export interface AgentPlaybookAuth {
  getToken: string;
  ping: string;
}

export interface AgentPlaybookReadState {
  tutorialField: string;
  money: string;
  dataTokens: string;
  inventories: string;
  racks: string;
  models: string;
  training: string;
  bills: string;
  serving: string;
}

export interface AgentPlaybookStarterIds {
  rack: string;
  gpu: string;
  scraperModel: string;
  trainModel: string;
}

export interface AgentPlaybook<TApi, THowToCall> {
  version: number;
  audience: "coding-agents";
  hiddenFromHumanUi: true;
  discoverUrl: "/agent/api/v1";
  playbookUrl: "/agent/api/v1/playbook";
  summary: string;
  howToCall: THowToCall;
  auth: AgentPlaybookAuth;
  readState: AgentPlaybookReadState;
  coreLoop: AgentPlaybookLoopStep[];
  starterIds: AgentPlaybookStarterIds;
  api: TApi;
}

export function buildAgentPlaybookContent<TApi, THowToCall>(
  api: TApi,
  howToCall: THowToCall,
): AgentPlaybook<TApi, THowToCall> {
  return {
    version: AGENT_PLAYBOOK_VERSION,
    audience: "coding-agents",
    hiddenFromHumanUi: true,
    discoverUrl: "/agent/api/v1",
    playbookUrl: "/agent/api/v1/playbook",
    summary:
      "LLMville is an AI lab tycoon. Buy/build racks, install GPUs, scrape data tokens with licensed models, train your own model, serve it for money, pay bills, upgrade your property, repeat.",
    howToCall,
    auth: {
      getToken: "The plot owner connects a bot in the in-game tablet (Bot app) and shares its long-lived token.",
      ping: "GET /agent/api/v1/ping with Authorization: Bearer {token} to verify and read { externalId, gameId }.",
    },
    readState: {
      tutorialField: "query world:state → game.tutorialStage",
      money: "query world:state → game.money",
      dataTokens: "query world:state → game.dataTokens",
      inventories: "query world:state → buildInventory | hardwareInventory | coolingInventory",
      racks: "query world:scene → racks",
      models: "query world:scene → models",
      training: "query world:scene → activeTrainingSessions",
      bills: "query bills:list",
      serving: "query serving:stats",
    },
    coreLoop: [
      {
        id: "bootstrap",
        goal: "Stand up a starter lab",
        calls: [
          "mutation multiplayer/worldPresence:ensureHumanPresence { gameId, externalId }",
          "mutation store:buy { gameId, externalId, itemId: \"starter_rack\" }",
          "mutation build:place { gameId, externalId, itemId: \"starter_rack\", x, z }",
          "mutation store:buy { gameId, externalId, itemId: \"gpu_1\", quantity: 2 }",
          "mutation rack:moveHardware { gameId, externalId, rackId, from: { kind: \"stock\", hardwareId: \"gpu_1\" }, to: { kind: \"slot\", slot } }",
        ],
      },
      {
        id: "scrape",
        goal: "Farm data tokens by allocating GPUs to scraping with any unlocked model",
        calls: [
          "mutation store:unlock { gameId, externalId, itemId: \"alpaca_1\" }",
          "mutation inference:assignCard { gameId, externalId, rackId, slotIndex: 0, lane: \"scraping\" }",
          "mutation inference:setScrapeTier { gameId, externalId, tier: \"books\" }",
        ],
        hints: [
          "Free bases like llamma_3 can scrape without a paid license.",
          "A tier opens only once a card is on scraping, so assign the card before setting the tier.",
          "Poll query world:state until game.dataTokens rises before training.",
        ],
      },
      {
        id: "train",
        goal: "Fine-tune your own model (costs data tokens)",
        calls: [
          "mutation inference:assignCard { gameId, externalId, rackId, slotIndex: 1, lane: \"training\" }",
          "mutation models:train { gameId, externalId, baseModelId: \"llamma_3\" }",
          "Poll query world:scene until activeTrainingSessions is empty",
        ],
      },
      {
        id: "serve",
        goal: "Reveal trained model and serve for income",
        calls: [
          "mutation models:reveal { externalId, modelId }",
          "mutation serving:serve { externalId, modelId }",
          "mutation inference:assignCard { gameId, externalId, rackId, slotIndex, lane: \"serving\", targetModelId }",
        ],
      },
      {
        id: "operate",
        goal: "Stay solvent and grow",
        calls: [
          "mutation bills:pay { gameId, externalId, billId }",
          "mutation world:resolveEvent { gameId, externalId, eventId }",
          "mutation store:unlock { gameId, externalId, itemId: researchItemId }",
          "mutation store:buy { gameId, externalId, itemId: coolerId }",
          "mutation rack:cool { gameId, externalId, rackId, coolingUnitId }",
        ],
      },
      {
        id: "explore",
        goal: "Roam the shared datacenter and look at neighboring labs",
        calls: [
          "mutation multiplayer/worldPresence:syncPlayerPosition { position: { x, z }, externalId }",
          "query world:worldScene { x, z, radius }  (every lab's racks and placed items around you)",
          "query datacenter:listClaims { x, z, radius }  (who owns the floor cells around you)",
        ],
        hints: [
          "Every lab stands in one shared datacenter; you walk it like any signed-in player.",
          "Neighbors' labs are read-only to you: you build, buy and train only on your own claimed cells.",
        ],
      },
    ],
    starterIds: {
      rack: "starter_rack",
      gpu: "gpu_1",
      scraperModel: "alpaca_1",
      trainModel: "llamma_3",
    },
    api,
  };
}