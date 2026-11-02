import { MOVEMENT_TUNING } from "@jgengine/core/movement/movementModel";
import { defineGame } from "@jgengine/shell/defineGame";
import { DATACENTER_CEILING_HEIGHT } from "@llmville/game/datacenter/layout";
import { llmvilleContent } from "@llmville/game/game/content";
import { llmvilleWorld } from "@llmville/game/game/world";
import { buildSceneObjectPrompts } from "@llmville/game/simulation/interaction";
import { WORLD_CAMERA_FAR, WORLD_FOG_COLOR, WORLD_FOG_FAR, WORLD_FOG_NEAR } from "@llmville/game/world/viewDistance";
import { worldModelAssetCatalog } from "@llmville/game/world/worldModelCatalog";
import { convexPresenceTransport } from "@/multiplayer/convexPresenceTransport";
import { LlmvilleGameUI } from "@/runtime/components/LlmvilleGameUI";
import { stepAroundNearbyPlayers } from "@/runtime/localPlayerEntity";
import { LlmvilleWorld } from "@/scene/components/GameScene";
import { DEFAULT_APP_KEYBINDS, keybindToCodes } from "@/settings/keybinds";

/** The shell drives these from LLMville's keybinds; every other key stays with the game's own input. */
const WALK_ACTIONS = ["moveForward", "moveBack", "moveLeft", "moveRight", "jump", "sprint", "crouch"] as const;

/**
 * No `replication` policy on purpose. Placed geometry never travels through the engine's `objects`
 * snapshot module — it reaches clients as bounded chunk reads via `api.world.worldScene` — and player
 * presence rides the `ConvexPresenceTransport` lane rather than the `entities` module, so
 * `aoiRadius` would cull nothing. Spatial culling for this game is the chunk read seam.
 */
export const game = defineGame({
  name: "LLMville",
  assets: worldModelAssetCatalog,
  world: llmvilleWorld,
  multiplayer: convexPresenceTransport,
  lifecycle: "always-live",
  content: llmvilleContent,
  input: {
    ...Object.fromEntries(WALK_ACTIONS.map((action) => [action, keybindToCodes(DEFAULT_APP_KEYBINDS[action])])),
    // A tap on the world interacts on touch; the keyboard's interact key stays with the game's input.
    interact: [],
  },
  GameUI: LlmvilleGameUI,
  scene: { WorldOverlay: LlmvilleWorld },
  scenePlacement: false,
  camera: {
    perspective: "first",
    rigs: { firstPerson: { eyeHeight: MOVEMENT_TUNING.standEyeHeight, sensitivity: 0.002, reticle: false, viewmodel: false } },
    lens: { frustum: { far: WORLD_CAMERA_FAR } },
  },
  controls: {
    movement: { collideObjects: true, beforeCommit: stepAroundNearbyPlayers },
    prompts: (ctx) =>
      buildSceneObjectPrompts(ctx.scene.object.list(), (instanceId) => ctx.scene.object.catalog(instanceId)?.proximityPrompt ?? null),
    touch: { hidden: ["sprint", "crouch"], gestures: { tap: "interact" } },
  },
  rendering: {
    lighting: {
      ambient: { color: "#fff0d6", intensity: 0.85 },
      hemisphere: { skyColor: "#f9e4bf", groundColor: "#526d60", intensity: 0.9 },
      directional: [
        {
          color: "#ffe1ae",
          intensity: 1.4,
          position: [8, DATACENTER_CEILING_HEIGHT + 10, 6],
          castShadow: true,
          cascades: 1,
          shadowMaxFar: 36,
          shadowMapSize: 2048,
          shadowBias: -0.0006,
          shadowNormalBias: 0.02,
        },
      ],
    },
    backdrop: { background: WORLD_FOG_COLOR, fog: { color: WORLD_FOG_COLOR, near: WORLD_FOG_NEAR, far: WORLD_FOG_FAR } },
    postProcessing: { toneMapping: "aces", exposure: 1.25 },
  },
  chrome: { settings: false, notices: false },
});
