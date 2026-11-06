import type { ProofSetup } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

export type Probe = ReturnType<NonNullable<NonNullable<typeof game.capture>["probe"]>>;

/** A levelled survivor with a club in hand, a level-1 raptor four metres ahead, taming twenty times faster. */
export function raptorAhead(s: ProofSetup<Probe>, give: Record<string, number> = {}): void {
  s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
  s.command("cheat", { xp: 100_000, spend: { health: 45, stamina: 8 }, give: { wooden_club: 1, raw_meat: 10, ...give }, toHotbar: ["wooden_club"], tamingSpeed: 20 });
  s.press("Digit1");
  s.hold("KeyD", { until: (p) => p.acrossSpawn > 3, ms: 200, timeoutMs: 4000 });
  s.hold("KeyW", { ms: 250 });
  s.command("cheat", { summon: { species: "raptor", level: 1, distance: 4 } });
  s.wait(700);
}

/** {@link raptorAhead}, clubbed unconscious, its inventory open. */
export function raptorDown(s: ProofSetup<Probe>, give: Record<string, number> = {}): void {
  raptorAhead(s, give);
  s.hold("mouse0", { until: (p) => p.aimedDown === 1, timeoutMs: 30_000 });
  s.hold("KeyE", { until: (p) => p.screen === 1, timeoutMs: 3000 });
}

/** {@link raptorDown}, fed and tamed, its inventory still open. */
export function raptorTamed(s: ProofSetup<Probe>, give: Record<string, number> = {}): void {
  raptorDown(s, give);
  s.command("giveCreature", { inventoryId: "inventory", slot: s.probe().foodSlot });
  s.waitFor((p) => p.tamed === 1, { timeoutMs: 45_000 });
}

/** A tamed female and male raptor beside the survivor, mating on, at night on the cold south coast. */
export function raptorPair(s: ProofSetup<Probe>): void {
  s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
  s.command("cheat", { clock: 3500, teleport: [-1005, 566, 0] });
  s.wait(1000);
  s.command("cheat", { summon: { species: "raptor", level: 20, distance: 6, side: -3.5, sex: "female", tamed: true, mating: true } });
  s.command("cheat", { summon: { species: "raptor", level: 20, distance: 6, side: -1, sex: "male", tamed: true, mating: true } });
}
