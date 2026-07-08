import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { PlayableGame } from "@jgengine/shell/registry";
import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { entityCatalog, SCORE } from "./catalog";
import { game } from "./game.config";
import { onInit, onNewPlayer, onTick } from "./loop";
import { cellToWorld, powerCells } from "./maze";
import { renderMazeEntity, MazeEnvironment, PelletOverlay } from "./render/world";
import { GameUI } from "./ui/GameUI";

export const mazeMuncherGame: PlayableGame = {
  game,
  content: {
    entityById: (catalogId) => entityCatalog[catalogId] ?? null,
  },
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  environment: MazeEnvironment,
  WorldOverlay: PelletOverlay,
  renderEntity: renderMazeEntity,
  camera: {
    rig: "topDown",
    followEntityId: null,
    topDown: { height: 26, pitch: 0, yaw: 0 },
  },
};

export const mazeMuncherScenario: UiPreviewScenario = (ctx: GameContext) => {
  const step = 1 / 60;
  for (let index = 0; index < 90; index += 1) onTick(ctx, step);
  const power = powerCells[0]!;
  const world = cellToWorld(power.c, power.r);
  ctx.scene.entity.setPose(ctx.player.userId, { position: world });
  for (let index = 0; index < 45; index += 1) onTick(ctx, step);
  ctx.scene.entity.stats.delta(ctx.player.userId, SCORE, 1240);
};

export default mazeMuncherGame;
