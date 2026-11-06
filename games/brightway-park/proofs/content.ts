import type { ContentProgressionRule } from "@jgengine/core/game/contentValidation";
import type { SuiteContent, SuiteUnlock } from "@jgengine/core/suite/contentAudit";

import { BUILDABLES } from "../src/game/objects/catalog";

const PATH = "src/game/objects/catalog.ts";
const defs = Object.values(BUILDABLES);

/** A lab topic opens its buildable once the topic before it is done; everything else is on the palette from the start. */
const research: ContentProgressionRule[] = defs.flatMap((def) =>
  def.research === undefined ? [] : [{ id: `research:${def.id}`, path: `${PATH}/${def.id}`, requires: def.research.after === undefined ? [] : [def.research.after], provides: [def.id] }]);

/** The lab's runway: every topic run back to back in catalog order, each unlocking at the lab seconds spent so far. */
const unlocks: SuiteUnlock[] = [];
let labSeconds = 0;
for (const def of defs) {
  if (def.research === undefined) continue;
  labSeconds += def.research.seconds;
  unlocks.push({ id: `lab:${def.id}`, at: labSeconds });
}

/** Brightway Park's content for the game suite's data entries: its build palette and research lab. */
export const content: SuiteContent = {
  // Every buildable is something the player places on the lot.
  items: defs.map((def) => ({ id: def.id, placeable: true })),
  start: defs.filter((def) => def.research === undefined).map((def) => def.id),
  sources: research,
  uses: [{ id: "place", path: PATH, items: defs.map((def) => def.id) }],
  places: defs.map((def) => def.id),
  runway: { axis: "lab seconds", cap: labSeconds, unlocks },
};
