import { offline } from "@jgengine/core/runtime/adapter";
import { STUDIO_STAGE_POST } from "@jgengine/core/render/postProcessing";
import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { StudioShowcaseOverlay } from "./game/world/StudioShowcaseOverlay";
import { loop } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Studio Showcase",
  world,
  physics,
  input: keybinds,
  server: "persistent",
  save: "none",
  multiplayer: offline(),
  content,
  loop,
  GameUI,
  WorldOverlay: StudioShowcaseOverlay,
  postProcessing: STUDIO_STAGE_POST,
  camera: { perspective: "third", initialHeight: 2.4, initialDistance: 12 },
});
