import { STUDIO_STAGE_POST } from "@jgengine/core/render/postProcessing";
import { defineGame } from "@jgengine/shell/defineGame";

import { editorLayers } from "./editorLayers";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { loop } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Studio Showcase",
  lifecycle: "always-live",
  world,
  physics,
  input: keybinds,
  server: "persistent",
  save: "none",
  content,
  loop,
  GameUI,
  editorLayers,
  // The showcase never placed catalog-id markers into the object store (the old mount omitted
  // `placeObjects`); keep that off so nothing new pops into the world.
  scenePlacement: false,
  postProcessing: STUDIO_STAGE_POST,
  camera: { perspective: "third", initialHeight: 2.4, initialDistance: 12 },
});
