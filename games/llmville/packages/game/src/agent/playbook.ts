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
          "mutation worldPresence:ensureHumanPresence { gameId, externalId }",
          "mutation store:buy { gameId, externalId, itemId: \"starter_rack\" }",
          "mutation build:place { gameId, externalId, itemId: \"starter_rack\", x, z }",
          "mutation store:buy { gameId, externalId, itemId: \"gpu_1\", quantity: 2 }",
          "mutation rack:install { gameId, externalId, rackId, hardwareModelId: \"gpu_1\", slotIndex }",
        ],
      },
      {
        id: "scrape",
        goal: "Farm data tokens by allocating GPUs to scraping with any unlocked model",
        calls: [
          "mutation store:unlock { gameId, externalId, itemId: \"alpaca_1\" }",
          "mutation inference:setScrapeTier { gameId, externalId, tier: \"books\" }",
          "mutation inference:assignCard { gameId, externalId, rackId, slotIndex: 0, lane: \"scraping\" }",
        ],
        hints: [
          "Free bases like llamma_3 can scrape without a paid license.",
          "Poll query world:state until game.dataTokens rises before training.",
        ],
      },
      {
        id: "train",
        goal: "Fine-tune your own model (costs data tokens)",
        calls: [
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
          "mutation world:upgrade { gameId, externalId, targetTier: \"house\" }",
          "mutation store:unlock { gameId, externalId, itemId: researchItemId }",
          "mutation store:buy { gameId, externalId, itemId: coolerId }",
          "mutation rack:cool { gameId, externalId, rackId, coolingUnitId }",
        ],
      },
      {
        id: "explore",
        goal: "Roam the shared street and visit neighboring labs",
        calls: [
          "mutation worldPresence:syncPlayerPosition { position: { x, z }, externalId }",
          "query world:listCityPlots  (visit plots where isOpen is true)",
          "mutation world:moveToInteriorFromLobby { homeGameId, plotIndex, externalId }",
        ],
        hints: [
          "You walk the shared city street like any signed-in player and may enter any open plot.",
          "Visiting is read-only — you can view a neighbor's lab but can't build, buy, or train there.",
          "Entry is rejected when the plot is closed (owner offline), when its owner has banned you, or for guests.",
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