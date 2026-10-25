import type { PlacedBuildItem } from "@llmville/game/build/build";
import type { BuildInventory } from "@llmville/game/build/catalog";
import type { HardwareInventory } from "@llmville/game/infrastructure/infrastructure";
import type { RackCoolingInventory } from "@llmville/game/infrastructure/catalog";
import type { PlacedRack } from "@/infrastructure/infrastructure";
import type { ComputePrecision, HardwareModelId } from "@llmville/game/infrastructure/catalog";
import type {
  GameEngine,
  InteractionHint,
  TweetNotification,
} from "@/runtime/gameEngine";
import type { GamePositionedPrompt, InteractionTarget } from "@llmville/game/simulation/interaction";
import type { GameTime } from "@/runtime/clock";
import type { GameUserModel, GeneratedModelSpec } from "@/models/models";
import type { BaseModelCatalogState, BaseModelLibraryEntry } from "@/models/training";
import type { ResearchUnlocks } from "@llmville/game/research/researchUnlocks";
import type { PersonalUpgradeItem, ShopCatalogItem } from "@/store/store";
import type { ServingModeId } from "@llmville/game/models/servingMode";
import type { ComputeAssignmentMap, ComputeLane } from "@llmville/game/infrastructure/infrastructure";
import type { ScrapeTierId } from "@llmville/game/models/scrapingTiers";
import type { TutorialStage } from "@llmville/game/tutorial/tutorialStages";
import type { DatacenterClaim, PlacementCellPolicy } from "@llmville/game/datacenter/claims";
import type { CellCoord } from "@llmville/game/datacenter/grid";
import type { GamePlayerProfile } from "@/user/user";
import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import type { PresenceActions } from "@/multiplayer/presenceTransport";

export interface RuntimeGame {
  _id: Id<"games">;
  createdAt: number;
  serverNow?: number;
  money: number;
  dataTokens?: number;
  buildInventory?: unknown;
  hardwareInventory?: unknown;
  modelCatalog?: Record<string, BaseModelCatalogState> | null;
  computeAssignments?: ComputeAssignmentMap;
  activeScrapeTier?: ScrapeTierId;
  gameTimeScale?: number;
  servingMode?: ServingModeId;
  coolingInventory?: unknown;
  researchUnlocks?: ResearchUnlocks;
  ownerAvatarId?: string | null;
  tutorialStage?: TutorialStage;
  tutorialWords?: number;
}

export interface WorldActiveTraining {
  endTime: number;
  baseModelId?: string;
}

export interface WorldSpendPulse {
  amount: number;
  token: number;
}

export interface SiteHealth {
  temperatureC: number;
  heatLoadKw: number;
  coolingCapacityKw: number;
  thermalThrottle: number;
  powerDrawKw: number;
  powerCapacityKw: number;
  powerThrottle: number;
  vramUsedGb: number;
  vramCapacityGb: number;
}

export interface WorldViewModel {
  engine: GameEngine;
  game: RuntimeGame | null | undefined;
  routeGameId: Id<"games">;
  playerId: string;
  activeSlot: number;
  connectionError: string | null;
  canViewGame: boolean;
  canEditGame: boolean;
  isWorldReady: boolean;
  worldBootLabel: string;
  /** 0..1 fraction of world-boot gates passed, for a determinate loading bar. */
  worldBootProgress: number;
  money: number;
  dataTokens: number;
  servingIncomeRate: number;
  servingThroughputTps: number;
  siteHealth: SiteHealth;
  shopItems: readonly ShopCatalogItem[] | undefined;
  personalUpgrades: readonly PersonalUpgradeItem[] | undefined;
  hardwareInventory: HardwareInventory;
  coolingInventory: RackCoolingInventory;
  onBuyItem: (itemId: string) => Promise<unknown> | undefined;
  onUnlockResearch: (itemId: string) => Promise<unknown> | undefined;
  onPlaceOrder: (
    buildItems: { itemId: string; quantity: number }[],
    hardwareItems: { hardwareModelId: HardwareModelId; quantity: number }[],
  ) => Promise<boolean>;
  onBuyPersonalUpgrade: (upgradeId: PersonalUpgradeItem["id"]) => void | Promise<unknown> | undefined;
  racks: readonly PlacedRack[];
  totalGpus: number;
  trainingGpus: number;
  scrapingGpus: number;
  servingGpus: number;
  totalVramGb: number;
  totalTrainingPowerFp16: number;
  /** FP16 TFLOPs of GPUs dedicated to the Training lane (drives training speed + preview). */
  trainingLaneTflops: number;
  computeAssignments: ComputeAssignmentMap;
  activeScrapeTier: ScrapeTierId;
  scrapeSourceTokensPerToken: number;
  onAssignCard: (
    rackId: string,
    slotIndex: number,
    lane: ComputeLane,
    targetModelId?: Id<"models">,
  ) => void;
  onUnassignCard: (rackId: string, slotIndex: number) => void;
  onSetScrapeTier: (tier: ScrapeTierId) => void;
  servingMode: ServingModeId;
  onSetServingMode: (mode: ServingModeId) => void;
  isTraining: boolean;
  activeTraining: WorldActiveTraining | undefined;
  modelPreview: GeneratedModelSpec | null;
  launchedModels: readonly GeneratedModelSpec[] | undefined;
  userModels: readonly GameUserModel[] | undefined;
  baseModelLibrary: readonly BaseModelLibraryEntry[];
  unrevealedModelId: Id<"models"> | null;
  lastUnlockedBaseModelId: string | null;
  postTrainError: string | null;
  onServeModel: (modelId: Id<"models">) => void | Promise<unknown> | undefined;
  onQuantizeModel: (modelId: Id<"models">, precision: ComputePrecision) => void | Promise<unknown> | undefined;
  onStartPostTraining: (baseModelId: string, options?: { overtrainBracket?: number }) => void;
  onUnlockBaseModel: (baseModelId: string, amount?: number) => void;
  onLaunchLicensedBaseServe: (baseModelId: string) => void;
  onRenameModel: (modelId: Id<"models">, newName: string) => void | Promise<unknown> | undefined;
  onRevealModel: (modelId: Id<"models">) => void | Promise<unknown> | undefined;
  onDismissPostTrainError: () => void;
  onLaunchDraftModel: () => void | Promise<unknown> | undefined;
  buildInventory: BuildInventory;
  placedBuildItems: readonly PlacedBuildItem[];
  onPlaceTutorialBench: () => void;
  rackCount: number;
  onSaveProgress: () => void;
  onDismissTweet: () => void;
  onStepPlayer: (deltaX: number, deltaZ: number) => void;
  playerProfile: GamePlayerProfile | undefined;
  selectedAvatarName: string;
  gameTime: GameTime | null;
  interactionHint: InteractionHint | null;
  interactionTarget: InteractionTarget | null;
  interactionPrompt: GamePositionedPrompt | null;
  isPointerLocked: boolean;
  canMove: boolean;
  launchCelebrationActive: boolean;
  tweetNotification: TweetNotification | null;
  spendPulse: WorldSpendPulse | null;
  worldPresences: readonly {
    presenceId: string;
    kind: "human" | "bot";
    actorExternalId: string;
    gameId: Id<"games">;
    label: string | null;
    position: { x: number; y: number; z: number };
    rotationY: number;
    rotationPitch?: number;
    online?: boolean;
  }[];
  hasSessionConflict: boolean;
  /** Every claim in the shared datacenter (all players). */
  claims: readonly DatacenterClaim[] | undefined;
  /** The local game's claimed cells. */
  myClaims: readonly CellCoord[] | undefined;
  placementCellPolicy: PlacementCellPolicy;
  onClaimCell: (cell: CellCoord) => Promise<{ claimed: boolean; reason?: string }>;
  /** Every player's racks/items in world coordinates, for the shared scene. */
  worldRacks: readonly PlacedRack[];
  worldPlacedBuildItems: readonly PlacedBuildItem[];
  presenceActions: PresenceActions;
}

export type ReadyWorldViewModel = WorldViewModel & {
  shopItems: readonly ShopCatalogItem[];
  personalUpgrades: readonly PersonalUpgradeItem[];
  playerProfile: GamePlayerProfile;
  launchedModels: readonly GeneratedModelSpec[];
  userModels: readonly GameUserModel[];
};

export function isReadyWorldViewModel(world: WorldViewModel): world is ReadyWorldViewModel {
  return world.isWorldReady;
}
