import type { SuiteContent, SuiteUnlock } from "@jgengine/core/suite/contentAudit";

import { FURNITURE } from "../src/game/objects/catalog";
import { MODULE_REPUTATION, STARTING_ROOMS } from "../src/game/boarding/rooms";
import { APPLY_REPUTATION, RETURN_REPUTATION } from "../src/game/boarding/species";
import { FIVE_STAR_REPUTATION, LANDMARK_REPUTATION } from "../src/game/boarding/boarding";

const PATH = "src/game/objects/catalog.ts";

/** Choosier applicants buzz as the house's name grows, and tenants who left come back for a second try. */
const unlocks: SuiteUnlock[] = [
  ...MODULE_REPUTATION.slice(STARTING_ROOMS).map((at, i) => ({ id: `module:${STARTING_ROOMS + i + 1}`, at })),
  ...Object.entries(APPLY_REPUTATION).map(([species, at]) => ({ id: `applicant:${species}`, at: at! })),
  { id: "returning-tenants", at: RETURN_REPUTATION },
  { id: "five-star-listing", at: FIVE_STAR_REPUTATION },
  { id: "station-landmark", at: LANDMARK_REPUTATION },
].sort((a, b) => a.at - b.at);

/** NO VACANCY's content for the suite's data entries: the commons' furnishings and the module runway. */
export const content: SuiteContent = {
  items: FURNITURE.map((def) => ({ id: def.id, placeable: true })),
  start: FURNITURE.map((def) => def.id),
  sources: [],
  uses: [{ id: "place", path: PATH, items: FURNITURE.map((def) => def.id) }],
  places: FURNITURE.map((def) => def.id),
  runway: { axis: "station reputation", cap: 100, unlocks },
};
