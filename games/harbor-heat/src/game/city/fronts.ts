import type { PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import type { WorldHookCall } from "@jgengine/core/worldModel/worldModel";
import { editorLayers } from "../../editorLayers";
import { earn, spend } from "../cash";
import { cityEvent, cityOf } from "../cityRuntime";
import { handrollOf } from "../handroll";

/** A business lot as the scene authors it: which city kind it becomes, its price and where it stands. */
export interface FrontLot {
  slot: string;
  kind: string;
  label: string;
  price: number;
  position: readonly [number, number];
}

export const FRONT_LOTS: readonly FrontLot[] = editorLayers.markers
  .filter((marker) => marker.kind === "front")
  .map((marker) => ({
    slot: marker.id,
    kind: typeof marker.meta?.business === "string" ? marker.meta.business : "lounge",
    label: marker.label ?? marker.id,
    price: typeof marker.meta?.price === "number" ? marker.meta.price : 3000,
    position: [marker.position.x, marker.position.z] as const,
  }));

/** How close the player must stand to a front to buy, collect or fix it, metres. */
const FRONT_REACH = 6;
/** Share of the price a wrecked front costs to reopen. */
const REPAIR_SHARE = 0.3;
const RAIDERS = 3;
/** Metres from its front a raider stands when the raid starts. */
const RAID_SPREAD = 5;

export const lotBySlot = (slot: string): FrontLot | undefined => FRONT_LOTS.find((lot) => lot.slot === slot);

/** The instance standing in a lot, or null when it is for sale. */
export function frontIn(ctx: GameContext, slot: string): string | null {
  return cityOf(ctx).occupant(slot);
}

function lotOf(ctx: GameContext, instanceId: string): FrontLot | undefined {
  const slot = cityOf(ctx).instance(instanceId)?.slot;
  return slot === null || slot === undefined ? undefined : lotBySlot(slot);
}

const raiderIds = (instanceId: string) => Array.from({ length: RAIDERS }, (_, index) => `raider_${instanceId}_${index}`);

/** Why the player can't buy this lot right now, or null. */
export function buyRefusal(ctx: GameContext, lot: FrontLot): string | null {
  const world = cityOf(ctx);
  if (world.occupant(lot.slot) !== null) return `${lot.label} is already yours.`;
  const place = world.placeAt(lot.position[0], lot.position[1]);
  const owner = place === null ? null : world.fact(`${place}.owner`);
  if (owner === "carmine" || owner === "riptide") return `${owner === "carmine" ? "The Carmines" : "The Riptides"} run ${world.def.places?.[place ?? ""]?.label ?? "this block"}. Take it first.`;
  if (handrollOf(ctx).wanted().stars >= 2) return "Nobody sells a business to someone the cops are chasing.";
  if (ctx.game.economy.balance(ctx.player.userId, "cash") < lot.price) return `${lot.label} costs $${lot.price.toLocaleString()}.`;
  return null;
}

/** What a wrecked front costs to reopen. */
export const repairCost = (lot: FrontLot): number => Math.round(lot.price * REPAIR_SHARE);

export function registerFronts(ctx: GameContext): void {
  ctx.game.commands.define<{ slot: string }>("front.buy", {
    validate(state, input) {
      const lot = lotBySlot(input.slot);
      if (lot === undefined) return { reason: "unknown", message: "Nothing for sale here." };
      const refusal = buyRefusal(state, lot);
      return refusal === null ? null : { reason: "refused", message: refusal };
    },
    apply(state, input) {
      const lot = lotBySlot(input.slot)!;
      if (!spend(state, lot.price, "front-purchase", lot.slot)) return;
      const placed = cityOf(state).place(lot.kind, { slot: lot.slot }, { free: true });
      if (!placed.ok) {
        earn(state, lot.price, "front-refund", lot.slot);
        state.game.notices.push({ text: placed.message, tone: "deny" });
        return;
      }
      state.game.notices.push({ text: `${lot.label} is yours. It earns while it stands, and more at night.`, tone: "success" });
      state.game.feedback.cue("objective", `Bought ${lot.label}`);
      state.scene.entity.floatText({ instanceId: state.player.userId, text: "FRONT OWNED", kind: "good" });
    },
  });

  ctx.game.commands.define<Record<string, never>>("front.collect", {
    validate(state) {
      return Math.floor(cityOf(state).num("fronts.takings")) <= 0 ? { reason: "empty", message: "The safe is empty." } : null;
    },
    apply(state) {
      const amount = Math.floor(cityOf(state).num("fronts.takings"));
      cityOf(state).change({ "fronts.takings": -amount });
      earn(state, amount, "front-takings");
      state.game.notices.push({ text: `Collected $${amount.toLocaleString()} from the fronts' safe.`, tone: "success" });
    },
  });

  ctx.game.commands.define<{ slot: string }>("front.repair", {
    validate(state, input) {
      const lot = lotBySlot(input.slot);
      const id = lot === undefined ? null : frontIn(state, lot.slot);
      if (lot === undefined || id === null || cityOf(state).fact(`${id}.hit`) !== true) return { reason: "nothing", message: "Nothing to fix." };
      if (ctx.game.economy.balance(state.player.userId, "cash") < repairCost(lot)) return { reason: "cost", message: `Fixing it costs $${repairCost(lot)}.` };
      return null;
    },
    apply(state, input) {
      const lot = lotBySlot(input.slot)!;
      const id = frontIn(state, lot.slot)!;
      if (!spend(state, repairCost(lot), "front-repair", lot.slot)) return;
      cityEvent(state, { kind: "repaired", target: id });
    },
  });
}

/** One prompt per lot the player stands at: buy it, or collect and fix the one they own. */
export function frontPrompts(ctx: GameContext, at: readonly [number, number, number]): PositionedPrompt[] {
  const out: PositionedPrompt[] = [];
  const world = cityOf(ctx);
  for (const lot of FRONT_LOTS) {
    if (Math.hypot(lot.position[0] - at[0], lot.position[1] - at[2]) > FRONT_REACH + 2) continue;
    const id = world.occupant(lot.slot);
    const base = { position: { x: lot.position[0], z: lot.position[1] }, priority: 2 };
    const reach = { radius: FRONT_REACH, display: { kind: "keybind" as const, actionId: "interact" } };
    if (id === null) {
      out.push({ ...base, id: `front:buy:${lot.slot}`, prompt: { ...reach, invoke: { name: "front.buy", input: { slot: lot.slot } } } });
    } else if (world.fact(`${id}.hit`) === true) {
      out.push({ ...base, id: `front:repair:${lot.slot}`, prompt: { ...reach, invoke: { name: "front.repair", input: { slot: lot.slot } } } });
    } else if (world.num("fronts.takings") >= 1) {
      out.push({ ...base, id: `front:collect:${lot.slot}`, prompt: { ...reach, invoke: { name: "front.collect", input: {} } } });
    }
  }
  return out;
}

/** The label a front prompt shows. */
export function frontPromptLabel(ctx: GameContext, id: string): string | null {
  const [, verb, slot] = id.split(":");
  const lot = slot === undefined ? undefined : lotBySlot(slot);
  if (lot === undefined) return null;
  if (verb === "buy") return `Buy ${lot.label} · $${lot.price.toLocaleString()}`;
  if (verb === "repair") return `Reopen ${lot.label} · $${repairCost(lot).toLocaleString()}`;
  return `Collect takings · $${Math.floor(cityOf(ctx).num("fronts.takings")).toLocaleString()}`;
}

/** World hook: a raid started on a front; its crew turns up at the door. */
export function raidStarted(ctx: GameContext, call: WorldHookCall): void {
  if (call.target === null) return;
  spawnRaiders(ctx, call.target);
  const lot = lotOf(ctx, call.target);
  const text = `Carmines are hitting ${lot?.label ?? "one of your fronts"}! Get there in 60 seconds.`;
  ctx.game.notices.push({ text, tone: "warn" });
  ctx.game.feedback.cue("deny", text);
}

/** World hook: a raid ran out its clock; the crew empties half the safe on the way out. */
export function raidLost(ctx: GameContext, call: WorldHookCall): void {
  if (call.target === null) return;
  const world = cityOf(ctx);
  const stolen = Math.floor(world.num("fronts.takings") / 2);
  if (stolen > 0) world.change({ "fronts.takings": -stolen });
  for (const id of raiderIds(call.target)) ctx.scene.entity.despawn(id);
  const lot = lotOf(ctx, call.target);
  ctx.game.notices.push({ text: `${lot?.label ?? "Your front"} got wrecked${stolen > 0 ? ` and $${stolen} walked out the door` : ""}. Pay to reopen it.`, tone: "warn" });
}

/** Raids whose crew is on the street this session; a raid restored from a save is not in it yet. */
const raidsSpawned = perContext((): Set<string> => new Set());

function spawnRaiders(ctx: GameContext, instanceId: string): void {
  const lot = lotOf(ctx, instanceId);
  if (lot === undefined) return;
  raiderIds(instanceId).forEach((id, index) => {
    if (ctx.scene.entity.get(id) !== null) return;
    const angle = (index / RAIDERS) * Math.PI * 2;
    const x = lot.position[0] + Math.cos(angle) * RAID_SPREAD;
    const z = lot.position[1] + Math.sin(angle) * RAID_SPREAD;
    ctx.scene.entity.spawn("ganger_dock", { id, position: [x, ctx.world.groundHeightAt(x, z), z], role: "npc" });
  });
  raidsSpawned(ctx).add(instanceId);
}

/**
 * Settle every live raid: all of its crew down breaks it, its clock running out loses it. A raid
 * restored from a save gets its crew back first, so loading never hands the player a free win.
 */
export function tickFronts(ctx: GameContext): void {
  const world = cityOf(ctx);
  const spawned = raidsSpawned(ctx);
  for (const front of world.instances("front")) {
    if (world.fact(`${front.id}.raid`) !== true) {
      spawned.delete(front.id);
      continue;
    }
    if (!spawned.has(front.id)) {
      spawnRaiders(ctx, front.id);
      continue;
    }
    const standing = raiderIds(front.id).filter((id) => ctx.scene.entity.get(id) !== null).length;
    if (standing === 0) {
      spawned.delete(front.id);
      cityEvent(ctx, { kind: "raid_repelled", target: front.id });
      ctx.game.feedback.cue("objective", `${lotOf(ctx, front.id)?.label ?? "Front"} saved`);
    } else if (world.num(`${front.id}.raid_clock`) <= 0) {
      spawned.delete(front.id);
      cityEvent(ctx, { kind: "raid_lost", target: front.id });
    }
  }
}

/** Force a raid on the player's first standing front, for a job that is about defending one. */
export function startRaidOnFirstFront(ctx: GameContext): boolean {
  const world = cityOf(ctx);
  const front = world.instances("front").find((entry) => world.fact(`${entry.id}.hit`) !== true && world.fact(`${entry.id}.raid`) !== true);
  if (front === undefined) return false;
  cityEvent(ctx, { kind: "raid", target: front.id });
  return true;
}

/** What the HUD lists for each lot. */
export interface FrontView {
  slot: string;
  label: string;
  owned: boolean;
  status: "for sale" | "open" | "raid" | "wrecked";
  income: number;
  raidSeconds: number;
  position: readonly [number, number];
}

export function frontViews(ctx: GameContext): FrontView[] {
  const world = cityOf(ctx);
  return FRONT_LOTS.map((lot) => {
    const id = world.occupant(lot.slot);
    const raid = id !== null && world.fact(`${id}.raid`) === true;
    const hit = id !== null && world.fact(`${id}.hit`) === true;
    return {
      slot: lot.slot,
      label: lot.label,
      owned: id !== null,
      status: id === null ? "for sale" : raid ? "raid" : hit ? "wrecked" : "open",
      income: id === null ? 0 : world.num(`${id}.income`) + (world.fact("clock.night") === true ? world.num(`${id}.night`) : 0),
      raidSeconds: raid ? Math.ceil(world.num(`${id}.raid_clock`)) : 0,
      position: lot.position,
    };
  });
}
