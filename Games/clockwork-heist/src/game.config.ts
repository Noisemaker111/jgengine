import { defineGame } from "@jgengine/shell/defineGame";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { heistPrompts } from "./game/prompts";
import { MansionEnvironment, renderMansionEntity } from "./game/render/MansionRender";
import { GameUI } from "./game/ui/GameUI";
import { PALETTE } from "./game/ui/palette";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Clockwork Heist",
  world,
  physics,
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  environment: MansionEnvironment,
  renderEntity: renderMansionEntity,
  prompts: heistPrompts,
  shadows: false,
  backdrop: { background: PALETTE.midnightBlue },
  lighting: { ambient: { color: PALETTE.candlelight, intensity: 0.2 } },
  movement: { collideObjects: true },
  camera: {
    rig: "topDown",
    topDown: { height: 15, pitch: 1.05, yaw: Math.PI / 4, followSmoothing: 7, zoom: { min: 9, max: 22 } },
  },
});
