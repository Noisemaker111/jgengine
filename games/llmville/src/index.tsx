import { LlmvilleRemotePlayers } from "./agent/components/RemoteAgents";
import { game as llmville } from "./game.config";
import { HostedGameUI, hostedScenePart } from "./runtime/components/HostedWorld";
import { LlmvilleDatacenter, LlmvilleWorld } from "./scene/components/GameScene";

/**
 * LLMville as the dev runner mounts it (`?game=llmville`): the world's shell with nothing around
 * it, so the HUD and the scene each bring the backend themselves. LLMville's own site mounts
 * `game.config` inside its signed-in session instead (`runtime/components/GameSession`); its
 * menus and dev screens open in the runner as previews (`./preview`).
 */
export const game: typeof llmville = {
  ...llmville,
  GameUI: HostedGameUI,
  scene: {
    ...llmville.scene,
    WorldOverlay: hostedScenePart(LlmvilleWorld),
    RemotePlayers: hostedScenePart(LlmvilleRemotePlayers),
    environment: hostedScenePart(LlmvilleDatacenter),
  },
};
