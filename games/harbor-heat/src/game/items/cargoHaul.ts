import { defaultKeyValueStorage } from "@jgengine/core/game/keyValueStore";
import { createInventorySet } from "@jgengine/core/inventory/inventoryModel";
import { createRunHaul } from "@jgengine/core/loot/haul";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";

export const CONTRABAND = "contraband_crate";
export const CONTRABAND_MASS = 5;
export const CARGO_CAPACITY = 12;

export interface CargoView {
  carried: number;
  stashed: number;
  weight: number;
  remaining: number;
}

export const cargoStore = defineStore<CargoView>("harbor.cargo", {
  carried: 0,
  stashed: 0,
  weight: 0,
  remaining: CARGO_CAPACITY,
});

const inventories = createInventorySet({ cargo: { slots: 4 }, lockup: { slots: 8 } }, { stackLimit: () => 99 });
const storage = typeof localStorage === "undefined" ? null : defaultKeyValueStorage();
const haul = createRunHaul({
  inventories,
  runId: "cargo",
  stashId: "lockup",
  weightOf: (id) => (id === CONTRABAND ? CONTRABAND_MASS : 1),
  capacity: CARGO_CAPACITY,
  storage,
  key: "harbor-heat.cargo-lockup",
});

function view(): CargoView {
  const mass = haul.mass();
  return {
    carried: inventories.count("cargo", CONTRABAND),
    stashed: inventories.count("lockup", CONTRABAND),
    weight: mass.run,
    remaining: mass.remaining,
  };
}

function write(ctx: GameContext): CargoView {
  const next = view();
  cargoStore.write(ctx, next);
  return next;
}

/** Load a job's contraband into the cargo hold; over the weight cap, the rest stays ashore. */
export function loadContraband(ctx: GameContext, crates = 2): number {
  let loaded = 0;
  for (let i = 0; i < crates; i += 1) if (haul.carry(CONTRABAND, 1).ok) loaded += 1;
  write(ctx);
  return loaded;
}

/** A failed job loses everything in the cargo hold; the lockup keeps what earlier jobs banked. */
export function failContraband(ctx: GameContext): number {
  const lost = haul.fail().stacks.reduce((sum, stack) => sum + stack.count, 0);
  write(ctx);
  if (lost > 0) ctx.game.notices.push({ text: `Cargo lost: ${lost} crates. The lockup is safe.`, tone: "deny" });
  return lost;
}

/** A delivered job banks the cargo hold into the persistent lockup. */
export function bankContraband(ctx: GameContext): number {
  const moved = haul.bank().stacks.reduce((sum, stack) => sum + stack.count, 0);
  write(ctx);
  if (moved > 0) ctx.game.notices.push({ text: `${moved} crates moved to the lockup.`, tone: "success" });
  return moved;
}

/** Detached cargo and lockup counts for a test or a HUD refresh. */
export function cargoState(): CargoView {
  return view();
}
