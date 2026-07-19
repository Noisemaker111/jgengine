import { seededRng } from "@jgengine/shell/gameKit";
import { createLootRegistry } from "@jgengine/core/game/lootTable";

// The joint: an authored weighted table rolled with INJECTED determinism (never
// Math.random), so a host can roll a kill's drops and replicate the exact result.
const loot = createLootRegistry();
loot.register({
  id: "goblin",
  entries: [
    { item: "coin", count: [3, 8], weight: 70 },
    { item: "dagger", count: 1, weight: 25 },
    { item: "ruby", count: 1, weight: 5 },
  ],
});

const rng = seededRng("run-seed");

export function rollKill(): void {
  for (const drop of loot.roll("goblin", rng)) {
    // grant drop.item × drop.count to the killer's inventory / feed
    void drop;
  }
}
