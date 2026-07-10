import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";

import { OASES } from "./sites";

export const OASIS_PROMPTS: readonly PositionedPrompt[] = OASES.map((oasis) => ({
  id: oasis.id,
  position: { x: oasis.x, z: oasis.z },
  priority: 10,
  prompt: proximityPrompt({
    radius: oasis.waterRadius + 15,
    display: keybind("interact"),
    invoke: command("dock.open", { oasisId: oasis.id }),
  }),
}));

export function oasisPrompts(): readonly PositionedPrompt[] {
  return OASIS_PROMPTS;
}
