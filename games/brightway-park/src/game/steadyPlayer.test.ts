import { expect, test } from "bun:test";

import { playSteady } from "../../scripts/balance";

// The economy's measure: a player who opens the gate once a ride runs, hires a mechanic, builds what the
// till allows above a reserve and keeps the lab busy, at default prices, wins Brightway Beginnings
// inside its three months (60 minutes at 1x).
test("a steady player wins the first scenario", () => {
  const run = playSteady(60);
  expect(run.result, `scenario ${run.result}: most guests ${run.peakGuests}, best rating ${run.bestRating}, cash $${run.endCash}`).toBe("won");
}, 300_000); // 60 game minutes of the full park sim: about two minutes on this PC
