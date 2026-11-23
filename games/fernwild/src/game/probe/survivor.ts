import type { GameContext } from "@jgengine/core/runtime/gameContext";
import {
  nearestHarvestable,
  survivorView,
} from "../survivor";
import type { ProbeFrame } from "./frame";

/** What proofs and flows read about survivor: its part of the capture probe. */
export function survivorProbe(ctx: GameContext, { here, sight }: ProbeFrame) {
  const view = survivorView(ctx);
  return {
    unlocks: view.engrams.filter((engram) => engram.learned).length,
    engramsSeen: view.engrams.filter((engram) => engram.learned).length,
    engramsTotal: view.engrams.length,
    // Lifetime tallies the systems move: gathers that took something, items crafted, drinks, stat points spent.
    gathered: view.tally.gathered,
    crafted: view.tally.crafted,
    drinks: view.tally.drinks,
    spentPoints: view.spentPoints,
    level: view.level,
    aimStrike: view.aim.strike === null ? 0 : 1,
    aimPick: view.aim.pick === null ? 0 : 1,
    xp: view.xp,
    health: Math.round(view.health.value),
    healthMax: Math.round(view.health.max),
    food: Math.round(view.food.value),
    water: Math.round(view.water.value),
    stamina: Math.round(view.stamina.value),
    oxygen: Math.round(view.oxygen.value),
    underwater: view.underwater ? 1 : 0,
    weight: view.weight.value,
    weightMax: view.weight.max,
    engramPoints: view.engramPoints,
    // What the survivor can see around them: the nearest tree, flint rock and berry bush within 80 m, and
    // the nearest easy prey or the grounds it grazes, as a camera yaw and metres (-1 with none).
    ...sight("tree", nearestHarvestable(ctx, here, 80, "strike", "thatch")),
    ...sight("rock", nearestHarvestable(ctx, here, 80, "strike", "flint")),
    ...sight("bush", nearestHarvestable(ctx, here, 80, "pick", "mejoberry")),
    // Where the nearest berry bush stands, to the decimetre, so a proof can tell it from the next one.
    ...((at) => ({ bushX: at === null ? 0 : Math.round(at[0] * 10) / 10, bushZ: at === null ? 0 : Math.round(at[2] * 10) / 10 }))(nearestHarvestable(ctx, here, 80, "pick", "mejoberry")),
    crafting: view.queue.length,
    // The first queued craft's progress in percent (-1 with none), and the fuel left in the nearest burning station within 6 m (-1 with none).
    craftProgress: view.queue[0] === undefined ? -1 : Math.round(view.queue[0].progress * 100),
    // How many hostile airs (a cave's gas, heat or cold) the survivor stands in.
    hazards: view.hazards.length,
    // Uses the tool in hand has left before it breaks, and its most; -1 for fists or what never wears.
    heldDurability: view.held?.left ?? -1,
    heldDurabilityMax: view.held?.max ?? -1,
    // Carried tools that have worn and could be repaired.
    wornTools: view.worn.length,
    // Hotbar slot in hand, 1-based; 0 bare-handed.
    holding: view.activeSlot === null ? 0 : view.activeSlot + 1,
    // Air temperature where the survivor stands, °C, and how hard rain and snow fall there, in percent.
    temperature: view.temperature,
    // 1 while a roof, ceiling or rock is overhead.
    sheltered: view.sheltered ? 1 : 0,
    // 1 shut in a room, roof and walls all round, where the air is held toward indoor warmth.
    indoors: view.indoors ? 1 : 0,
    webbed: view.webbed ? 1 : 0,
  };
}
