import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { editorLayers } from "../editorLayers";
import { idea } from "./idea";
import { shrineOf } from "./places";
import { GOAL, journey, relicId, RELICS_NEEDED } from "./spec";

const act = (action: string, target: string) => command(`${idea.spec}.act`, { action, target });

/** What E does here: take the relic on its shrine, or use the goal once every relic is yours. */
export function prompts(ctx: GameContext): PositionedPrompt[] {
  const world = journey.of(ctx);
  const out: PositionedPrompt[] = [];
  for (const landmark of idea.landmarks) {
    const shrine = shrineOf(editorLayers, landmark.id);
    if (shrine === null) continue;
    const at = { x: shrine.x, z: shrine.z };
    if (landmark.relic !== undefined) {
      const id = relicId(landmark.id);
      if (world.fact(`${id}.taken`) === true) continue;
      const guarded = world.num(`${id}.guards`) > 0;
      const text = guarded ? `${landmark.relic.label} - its guardian still stands` : `Take ${landmark.relic.label}`;
      out.push({ id, position: at, prompt: proximityPrompt({ radius: 3.4, display: keybind("interact", text), invoke: act("take_relic", id) }) });
    } else if (landmark.role === "final" && world.fact(`${GOAL}.lit`) !== true) {
      const have = world.num("journey.relics");
      const text = have < RELICS_NEEDED ? `${idea.goal.label} - bring all ${RELICS_NEEDED} relics (${have}/${RELICS_NEEDED})` : `${idea.goal.verb} ${idea.goal.label}`;
      out.push({ id: GOAL, position: at, prompt: proximityPrompt({ radius: 3.8, display: keybind("interact", text), invoke: act("awaken", GOAL) }) });
    }
  }
  return out;
}
