import { defineGame } from "@jgengine/shell/defineGame";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { heistPrompts } from "./game/prompts";
import { MansionEnvironment, renderMansionEntity } from "./game/render/MansionRender";
import { GameUI } from "./game/ui/GameUI";
import { PALETTE } from "./game/ui/palette";
import { lifecycle, onInit, onNewPlayer, onTick } from "./loop";
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
  lifecycle,
  GameUI,
  capture: { play: ["startHeist"] },
  environment: MansionEnvironment,
  renderEntity: renderMansionEntity,
  prompts: heistPrompts,
  shadows: false,
  backdrop: { background: PALETTE.midnightBlue },
  lighting: { ambient: { color: PALETTE.candlelight, intensity: 0.2 } },
  movement: { collideObjects: true },
  settings: {
    variant: "panel",
    hideBindings: ["restart"],
    actions: [
      {
        id: "restart",
        label: "Restart heist",
        kind: "danger",
        description: "Back to the gate with the clock reset to dusk.",
        run: (ctx) => ctx.game.commands.run("restart", {}),
      },
    ],
  },
  camera: {
    rig: "topDown",
    topDown: { height: 15, pitch: 1.05, yaw: Math.PI / 4, followSmoothing: 7, zoom: { min: 9, max: 22 } },
  },
});
