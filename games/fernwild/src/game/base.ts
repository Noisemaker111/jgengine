import { createBaseBuilding, type BaseBuilding, type BaseBuildingState, type BaseVec3, type BasePiece, type StructurePlan } from "../engine-local/basebuilding/baseBuilding";
import type { StationInstance } from "@jgengine/core/crafting/recipe";
import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { createEmptyInventory, putItem, takeItem, type InventoryState } from "@jgengine/core/inventory/inventoryModel";
import { createSpoilage, type Spoilage } from "@jgengine/core/inventory/spoilage";
import { playerMovementHeading } from "@jgengine/core/movement/playerMovement";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { createVitals, type Vitals, type VitalsState } from "@jgengine/core/stats/vitals";

import { BAG, HOTBAR } from "./bags";
import { emptyPlot, growPlot, PLOT, SEEDS, type Plot } from "./data/farm";
import { FUEL, FUEL_MAX } from "./data/fuel";
import { BASE_BUILDING, BEDS, CONTAINERS, STATIONS, structureDef, TIER_COLORS } from "./data/structures";
import { itemLabel, itemTraits, SPOILS } from "./data/items";
import { setScreen } from "./screens";

/** ARK's build reach: the ghost sits this far in front of the survivor. */
const BUILD_REACH = 3.5;
/** Cursor height above the feet: between floor edges and wall tops, since no camera pitch reaches the sim. */
const CURSOR_HEIGHT = 1.2;
/** How far E and G reach a piece in front. */
const USE_REACH = 4;
/** Share of a piece's cost a demolish hands back. Ours: ark.wiki.gg's structure pages don't state one. */
const DEMOLISH_REFUND = 0.5;
const SOLIDS_LAYER = "fernwild:base";

interface Base {
  building: BaseBuilding;
  ghost: StructurePlan | null;
  /** Rotate presses: quarter turns on the ground, the next snap variant when snapping. */
  turn: number;
  syncedVersion: number;
  /** The piece in front of the survivor, for E (doors, fires), G (demolish) and the look readout. */
  aimed: string | null;
  /** The burning station the survivor faces within reach: found by distance and facing, since a campfire sits below the eye-height ray. */
  fire: string | null;
  /** Each burning station's fire, by piece id: a fuel meter that drains while it has any. */
  fires: Map<string, Vitals>;
  /** The container the survivor faces within reach, found as fires are. */
  store: string | null;
  /** Each container's items, by piece id. */
  stores: Map<string, InventoryState>;
  /** The container whose inventory is open. */
  viewing: string | null;
  /** The spoil timers of what every container holds, each at its container's rate. */
  spoilage: Spoilage;
  /** The crop plot the survivor faces within reach, found as fires are. */
  plot: string | null;
  /** Each crop plot's soil, by piece id. */
  plots: Map<string, Plot>;
}

const baseOf = perContext((): Base => ({ building: createBaseBuilding(BASE_BUILDING), ghost: null, turn: 0, syncedVersion: -1, aimed: null, fire: null, fires: new Map(), store: null, stores: new Map(), viewing: null, spoilage: createSpoilage(SPOILS), plot: null, plots: new Map() }));

const isPlot = (pieceId: string): boolean => pieceId === "crop_plot";

/** A crop plot's soil, made bare the first time it is asked for. */
function plotOf(base: Base, piece: BasePiece): Plot {
  let plot = base.plots.get(piece.id);
  if (plot === undefined) {
    plot = emptyPlot();
    base.plots.set(piece.id, plot);
  }
  return plot;
}

/** How many of an item the survivor carries, hotbar and bag. */
const carried = (ctx: GameContext, itemId: string): number => ctx.player.inventory.count(HOTBAR, itemId) + ctx.player.inventory.count(BAG, itemId);

/** Take one of an item from the bag, else the hotbar. */
function takeOne(ctx: GameContext, itemId: string): void {
  ctx.player.inventory.take(ctx.player.inventory.count(BAG, itemId) > 0 ? BAG : HOTBAR, itemId, 1);
}

type PlotStep = { kind: "harvest"; crop: string } | { kind: "plant"; seed: string } | { kind: "fertilize" } | { kind: "water" } | { kind: "none"; why: string };

/** What E does at a plot: pick it when ripe, else plant, fertilize or water it with what the survivor carries. */
function plotStep(ctx: GameContext, plot: Plot): PlotStep {
  if (plot.seed !== null && plot.growth >= 1) return { kind: "harvest", crop: SEEDS[plot.seed] ?? plot.seed };
  if (plot.seed === null) {
    const seed = Object.keys(SEEDS).find((id) => carried(ctx, id) > 0);
    return seed === undefined ? { kind: "none", why: "needs a seed" } : { kind: "plant", seed };
  }
  if (plot.fertilizer <= PLOT.fertilizerMax - PLOT.fertilizerEach && carried(ctx, "fertilizer") > 0) return { kind: "fertilize" };
  if (plot.water <= PLOT.waterMax - PLOT.pour && carried(ctx, "waterskin") > 0) return { kind: "water" };
  const growing = `growing ${Math.floor(plot.growth * 100)}%, water ${Math.ceil(plot.water)}, fertilizer ${Math.ceil(plot.fertilizer)}`;
  return { kind: "none", why: plot.water <= 0 ? `${growing}: needs water` : plot.fertilizer <= 0 ? `${growing}: needs fertilizer` : growing };
}

function plotLabel(step: PlotStep): string {
  if (step.kind === "harvest") return `Harvest ${itemLabel(step.crop)}`;
  if (step.kind === "plant") return `Plant ${itemLabel(step.seed)}`;
  if (step.kind === "fertilize") return "Add Fertilizer";
  if (step.kind === "water") return "Pour Waterskin";
  return `Crop Plot: ${step.why}`;
}

function usePlot(ctx: GameContext, base: Base, piece: BasePiece): boolean {
  const plot = plotOf(base, piece);
  const step = plotStep(ctx, plot);
  if (step.kind === "harvest") {
    ctx.player.inventory.put(BAG, step.crop, PLOT.harvest);
    base.plots.set(piece.id, { ...plot, growth: PLOT.regrow });
    ctx.game.notices.push({ text: `+${PLOT.harvest} ${itemLabel(step.crop)}`, tone: "success" });
  } else if (step.kind === "plant") {
    takeOne(ctx, step.seed);
    base.plots.set(piece.id, { ...plot, seed: step.seed, growth: 0 });
  } else if (step.kind === "fertilize") {
    takeOne(ctx, "fertilizer");
    base.plots.set(piece.id, { ...plot, fertilizer: Math.min(PLOT.fertilizerMax, plot.fertilizer + PLOT.fertilizerEach) });
  } else if (step.kind === "water") {
    base.plots.set(piece.id, { ...plot, water: Math.min(PLOT.waterMax, plot.water + PLOT.pour) });
  } else {
    ctx.game.notices.push({ text: plotLabel(step), tone: "deny" });
    return false;
  }
  ctx.touch();
  return true;
}

const fireBody = (): Vitals => createVitals([{ id: "fuel", max: FUEL_MAX, start: 0, rate: -1 }]);

/** Whether a piece burns fuel (a campfire, a cooking pot). */
const burns = (pieceId: string): boolean => FUEL.sources(pieceId).length > 0;

/** A burning station's fire, made empty the first time it is asked for; null for a piece that does not burn. */
function fireOf(base: Base, piece: BasePiece): Vitals | null {
  if (!burns(piece.pieceId)) return null;
  let fire = base.fires.get(piece.id);
  if (fire === undefined) {
    fire = fireBody();
    base.fires.set(piece.id, fire);
  }
  return fire;
}

/** Whether a station can work: one that burns needs fuel in it. */
const lit = (base: Base, piece: BasePiece): boolean => (fireOf(base, piece)?.value("fuel") ?? 1) > 0;

/** The burning station in front of the survivor, or null. */
function aimedFire(base: Base): BasePiece | null {
  return base.fire === null ? null : base.building.get(base.fire);
}

/** Half-angle of the cone in front of the survivor that a fire must sit in to be stoked. */
const FIRE_FACING = Math.cos(Math.PI / 3);

/** The nearest piece `wanted` within reach inside the survivor's forward cone, or null: low pieces sit under the eye-height ray. */
function facingPiece(base: Base, at: BaseVec3, yaw: number, wanted: (pieceId: string) => boolean): string | null {
  const ahead = forward(yaw);
  let best: string | null = null;
  let nearest = USE_REACH;
  for (const piece of base.building.list()) {
    if (!wanted(piece.pieceId)) continue;
    const dx = piece.position[0] - at[0];
    const dz = piece.position[2] - at[2];
    const distance = Math.hypot(dx, dz);
    if (distance > nearest) continue;
    if (distance > 0.5 && (dx * ahead[0] + dz * ahead[2]) / distance < FIRE_FACING) continue;
    nearest = distance;
    best = piece.id;
  }
  return best;
}

/** The fuel the survivor carries that a station would take next, or null. */
function nextFuel(ctx: GameContext, pieceId: string): string | null {
  return FUEL.pick(pieceId, (itemId) => ctx.player.inventory.count(BAG, itemId) + ctx.player.inventory.count(HOTBAR, itemId) > 0);
}

/** E at a campfire or pot: one fuel from the survivor's bag or hotbar onto its fire. */
function stoke(ctx: GameContext, base: Base, piece: BasePiece): boolean {
  const fire = fireOf(base, piece);
  const itemId = nextFuel(ctx, piece.pieceId);
  if (fire === null || itemId === null) {
    ctx.game.notices.push({ text: `Needs ${FUEL.sources(piece.pieceId).map(itemLabel).join(" or ")} to burn`, tone: "deny" });
    return false;
  }
  if (ctx.player.inventory.take(BAG, itemId, 1).status !== "ok" && ctx.player.inventory.take(HOTBAR, itemId, 1).status !== "ok") return false;
  fire.dose(...(FUEL.of(piece.pieceId, itemId) ?? []));
  return true;
}

/** Seconds of fuel left in the nearest burning station within `reach` metres, or -1 with none. */
export function fuelNear(ctx: GameContext, at: readonly [number, number, number], reach: number): number {
  const base = baseOf(ctx);
  let best = -1;
  let nearest = reach;
  for (const piece of base.building.list()) {
    const fire = fireOf(base, piece);
    const distance = Math.hypot(piece.position[0] - at[0], piece.position[2] - at[2]);
    if (fire === null || distance > nearest) continue;
    nearest = distance;
    best = fire.value("fuel");
  }
  return best;
}

/** Put `seconds` of fuel on every burning station's fire (a cheat, for proofs). */
export function fuelStations(ctx: GameContext, seconds: number): void {
  const base = baseOf(ctx);
  for (const piece of base.building.list()) fireOf(base, piece)?.change("fuel", seconds);
}

/** The model, for the world overlay. */
export function baseBuilding(ctx: GameContext): BaseBuilding {
  return baseOf(ctx).building;
}

export function baseGhost(ctx: GameContext): StructurePlan | null {
  return baseOf(ctx).ghost;
}

export function structureColor(pieceId: string): string {
  const def = structureDef(pieceId);
  return def === null ? "#888888" : TIER_COLORS[def.tier];
}

function aimYaw(ctx: GameContext, fallback: number): number {
  return playerMovementHeading(ctx, ctx.player.userId) || fallback;
}

function eye(position: BaseVec3): BaseVec3 {
  return [position[0], position[1] + 1.5, position[2]];
}

function forward(yaw: number): BaseVec3 {
  return [Math.sin(yaw), 0, Math.cos(yaw)];
}

function planFor(ctx: GameContext, base: Base, pieceId: string, yaw: number): StructurePlan | null {
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me === null) return null;
  const ahead = forward(yaw);
  const cursor: BaseVec3 = [me.position[0] + ahead[0] * BUILD_REACH, me.position[1] + CURSOR_HEIGHT, me.position[2] + ahead[2] * BUILD_REACH];
  return base.building.plan(pieceId, cursor, { rotationY: yaw + (base.turn * Math.PI) / 2, variant: base.turn, groundHeightAt: ctx.world.groundHeightAt });
}

function syncSolids(ctx: GameContext, base: Base): void {
  const version = base.building.version();
  if (version === base.syncedVersion) return;
  base.syncedVersion = version;
  ctx.world.solids.set(SOLIDS_LAYER, base.building.solids());
}

/** Thirty times a second: the ghost for the structure in hand, the piece in front, and the solids. */
export function tickBase(ctx: GameContext, heldItemId: string | null, dt: number): void {
  const base = baseOf(ctx);
  const standing = new Set<string>();
  for (const piece of base.building.list()) {
    const fire = fireOf(base, piece);
    if (fire === null) continue;
    standing.add(piece.id);
    fire.tick(dt);
  }
  for (const id of [...base.fires.keys()]) if (!standing.has(id)) base.fires.delete(id);
  for (const id of [...base.stores.keys()]) if (base.building.get(id) === null) base.stores.delete(id);
  for (const piece of base.building.list()) {
    if (!isPlot(piece.pieceId)) continue;
    // A roof over the plot keeps the rain off it, as it does off the survivor.
    const covered = base.building.list().some((other) => other.id !== piece.id && other.position[1] > piece.position[1] + 1 && Math.hypot(other.position[0] - piece.position[0], other.position[2] - piece.position[2]) < 2.5);
    base.plots.set(piece.id, growPlot(plotOf(base, piece), dt, covered ? 0 : ctx.environment.sample(piece.position[0], piece.position[2]).rain));
  }
  for (const id of [...base.plots.keys()]) if (base.building.get(id) === null) base.plots.delete(id);
  if (base.viewing !== null && base.building.get(base.viewing) === null) closeStore(ctx);
  spoilStores(base, dt);
  const me = ctx.scene.entity.get(ctx.player.userId);
  syncSolids(ctx, base);
  if (me === null) return;
  const yaw = aimYaw(ctx, me.rotationY);
  base.ghost = heldItemId !== null && structureDef(heldItemId) !== null ? planFor(ctx, base, heldItemId, yaw) : null;
  base.fire = facingPiece(base, me.position, yaw, burns);
  base.store = base.fire === null ? facingPiece(base, me.position, yaw, (pieceId) => CONTAINERS[pieceId] !== undefined) : null;
  base.plot = base.fire === null && base.store === null ? facingPiece(base, me.position, yaw, isPlot) : null;
  // A fire, a box or a plot sits under the eye-height ray, so the one faced is the one aimed at when the ray finds nothing.
  base.aimed = base.building.raycast(eye(me.position), forward(yaw), USE_REACH)?.id ?? base.fire ?? base.store ?? base.plot;
  ctx.touch();
}

const BLOCKED: Record<NonNullable<StructurePlan["reason"]>, string> = {
  "unknown-piece": "Can't place that",
  overlap: "Something is in the way",
  "no-support": "Needs something to snap to",
  "too-steep": "Ground is too steep",
};

/** Left click with a structure in hand: stand it where the ghost is and use up one from the hotbar. */
export function placeHeld(ctx: GameContext, itemId: string, yaw: number | undefined): boolean {
  const base = baseOf(ctx);
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me === null) return false;
  const plan = planFor(ctx, base, itemId, yaw ?? aimYaw(ctx, me.rotationY));
  if (plan === null) return false;
  if (!plan.valid) {
    ctx.game.notices.push({ text: BLOCKED[plan.reason ?? "no-support"], tone: "deny" });
    return false;
  }
  if (ctx.player.inventory.count(HOTBAR, itemId) < 1) return false;
  const placed = base.building.place(plan, { owner: ctx.player.userId });
  if (placed === null) return false;
  ctx.player.inventory.take(HOTBAR, itemId, 1);
  syncSolids(ctx, base);
  return true;
}

/** R: turn the ghost a quarter, or flip to the next way it can snap. */
export function rotateBuild(ctx: GameContext): void {
  baseOf(ctx).turn += 1;
}

/** The door in front: the aimed piece itself, or the door hung in the aimed frame. */
function aimedDoor(base: Base): BasePiece | null {
  const aimed = base.aimed === null ? null : base.building.get(base.aimed);
  if (aimed === null) return null;
  const openable = (piece: BasePiece) => base.building.shape(piece.pieceId)?.openBoxes !== undefined;
  if (openable(aimed)) return aimed;
  return base.building.list().find((piece) => openable(piece) && Math.hypot(piece.position[0] - aimed.position[0], piece.position[1] - aimed.position[1], piece.position[2] - aimed.position[2]) < 0.2) ?? null;
}

/** A container's items, made empty the first time it is asked for. */
function storeOf(base: Base, piece: BasePiece): InventoryState | null {
  const spec = CONTAINERS[piece.pieceId];
  if (spec === undefined) return null;
  let store = base.stores.get(piece.id);
  if (store === undefined) {
    store = createEmptyInventory({ slots: spec.slots });
    base.stores.set(piece.id, store);
  }
  return store;
}

/** The open container, or null. */
function viewedStore(base: Base): { piece: BasePiece; items: InventoryState; slots: number } | null {
  const piece = base.viewing === null ? null : base.building.get(base.viewing);
  const items = piece === null ? null : storeOf(base, piece);
  return piece === null || items === null ? null : { piece, items, slots: CONTAINERS[piece.pieceId]!.slots };
}

/** What the containers hold goes off at each one's rate; what it spoils into takes its place if there is room. */
function spoilStores(base: Base, dt: number): void {
  const stacks = [...base.stores].flatMap(([id, items]) => {
    const piece = base.building.get(id);
    const rate = piece === null ? 1 : (CONTAINERS[piece.pieceId]?.spoil ?? 1);
    return items.slots.flatMap((slot, index) => (slot === null ? [] : [{ key: `${id}:${index}`, itemId: slot.itemId, count: slot.count, rate }]));
  });
  for (const unit of base.spoilage.tick(dt, stacks)) {
    const id = unit.key.slice(0, unit.key.lastIndexOf(":"));
    const piece = base.building.get(id);
    const items = base.stores.get(id);
    if (piece === null || items === undefined) continue;
    const taken = takeItem(items, unit.itemId, unit.count);
    if (taken.status !== "ok") continue;
    const into = unit.into === null ? null : putItem(taken.state, { slots: CONTAINERS[piece.pieceId]!.slots }, itemTraits, unit.into, unit.count);
    base.stores.set(id, into?.status === "ok" ? into.state : taken.state);
  }
}

/** A stack from the survivor's bag or hotbar into the open container. */
export function storePut(ctx: GameContext, from: string, slot: number): void {
  const base = baseOf(ctx);
  const open = viewedStore(base);
  const stack = ctx.player.inventory.state(from).slots[slot] ?? null;
  if (open === null || stack === null) return;
  if (CONTAINERS[open.piece.pieceId]!.foodOnly === true && SPOILS[stack.itemId] === undefined) {
    ctx.game.notices.push({ text: `The ${itemLabel(open.piece.pieceId)} only keeps food`, tone: "deny" });
    return;
  }
  const put = putItem(open.items, { slots: open.slots }, itemTraits, stack.itemId, stack.count);
  if (put.status !== "ok") {
    ctx.game.notices.push({ text: `The ${itemLabel(open.piece.pieceId)} is full`, tone: "deny" });
    return;
  }
  ctx.player.inventory.take(from, stack.itemId, stack.count);
  base.stores.set(open.piece.id, put.state);
  ctx.touch();
}

/** A stack from the open container back into the survivor's bag. */
export function storeTake(ctx: GameContext, slot: number): void {
  const base = baseOf(ctx);
  const open = viewedStore(base);
  const stack = open?.items.slots[slot] ?? null;
  if (open === null || stack === null) return;
  if (ctx.player.inventory.put(BAG, stack.itemId, stack.count).status !== "ok") {
    ctx.game.notices.push({ text: "Inventory is full", tone: "deny" });
    return;
  }
  const taken = takeItem(open.items, stack.itemId, stack.count);
  if (taken.status === "ok") base.stores.set(open.piece.id, taken.state);
  ctx.touch();
}

export function closeStore(ctx: GameContext): void {
  baseOf(ctx).viewing = null;
  setScreen(ctx, null);
}

/** The open container for the screen: its label and slots; null with none open. */
export function storeView(ctx: GameContext) {
  const open = viewedStore(baseOf(ctx));
  return open === null ? null : { id: open.piece.id, label: itemLabel(open.piece.pieceId), slots: open.items.slots };
}

/** E on a fire (stoke it), a container (open it), a crop plot (tend it), or a door or its frame (swing it). */
export function useStructure(ctx: GameContext): boolean {
  const base = baseOf(ctx);
  const fire = aimedFire(base);
  if (fire !== null) return stoke(ctx, base, fire);
  const store = base.store === null ? null : base.building.get(base.store);
  if (store !== null) {
    base.viewing = store.id;
    setScreen(ctx, "storage");
    return true;
  }
  const plot = base.plot === null ? null : base.building.get(base.plot);
  if (plot !== null) return usePlot(ctx, base, plot);
  const door = aimedDoor(base);
  if (door === null) return false;
  const open = base.building.toggle(door.id);
  syncSolids(ctx, base);
  return open !== null;
}

function fell(ctx: GameContext, removed: readonly BasePiece[], refund: number): void {
  if (removed.length === 0) return;
  const base = baseOf(ctx);
  for (const piece of removed) {
    // What a container held comes out with it, into the bag as far as it fits.
    for (const slot of base.stores.get(piece.id)?.slots ?? []) if (slot !== null) ctx.player.inventory.put(BAG, slot.itemId, slot.count);
    base.stores.delete(piece.id);
    base.plots.delete(piece.id);
    for (const [itemId, count] of Object.entries(structureDef(piece.pieceId)?.cost ?? {})) {
      const back = Math.floor(count * refund);
      if (back > 0) ctx.player.inventory.put(BAG, itemId, back);
    }
  }
  const label = itemLabel(removed[0]!.pieceId);
  ctx.game.notices.push({ text: removed.length > 1 ? `${label} destroyed, ${removed.length - 1} more fell with it` : `${label} destroyed`, tone: "deny" });
}

/** G: take down the piece in front, and what it held up, for half its cost back. */
export function demolish(ctx: GameContext): void {
  const base = baseOf(ctx);
  if (base.aimed === null) return;
  fell(ctx, base.building.remove(base.aimed).removed, DEMOLISH_REFUND);
  base.aimed = null;
  base.fire = null;
  syncSolids(ctx, base);
}

/** A swing that lands on a structure: the tier decides what gets through. Returns false when nothing was in reach. */
export function strikeStructure(ctx: GameContext, yaw: number, reach: number, damage: number, damageClass: string): boolean {
  const base = baseOf(ctx);
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me === null) return false;
  const hit = base.building.raycast(eye(me.position), forward(yaw), reach);
  if (hit === null) return false;
  const piece = base.building.get(hit.id)!;
  const struck = base.building.damage(hit.id, damage, damageClass);
  if (struck.applied === 0) ctx.game.notices.push({ text: `That can't damage a ${itemLabel(piece.pieceId)}`, tone: "deny" });
  else ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: `-${Math.round(struck.applied)}`, kind: "damage" });
  fell(ctx, struck.removed, 0);
  syncSolids(ctx, base);
  return true;
}

/** Placed stations near enough to matter, for recipes that need one. */
export function stations(ctx: GameContext): StationInstance[] {
  const base = baseOf(ctx);
  return base.building
    .list()
    .filter((piece) => STATIONS.has(piece.pieceId) && lit(base, piece))
    .map((piece) => ({ catalogId: piece.pieceId, position: [piece.position[0], piece.position[2]] }));
}

/** E opens and shuts the door in front. */
export function basePrompts(ctx: GameContext): PositionedPrompt[] {
  const base = baseOf(ctx);
  const fire = aimedFire(base);
  if (fire !== null) {
    const fuel = Math.ceil(fireOf(base, fire)?.value("fuel") ?? 0);
    const next = nextFuel(ctx, fire.pieceId);
    const label = next === null ? `${itemLabel(fire.pieceId)}: needs ${FUEL.sources(fire.pieceId).map(itemLabel).join(" or ")}` : `Add ${itemLabel(next)}`;
    const display = fuel > 0 ? `${label} (burning, ${fuel}s left)` : label;
    return [{ id: "fire", position: { x: fire.position[0], z: fire.position[2] }, priority: 3, prompt: proximityPrompt({ radius: USE_REACH + 2, display: keybind("interact", display), invoke: command("structureUse") }) }];
  }
  const store = base.store === null ? null : base.building.get(base.store);
  if (store !== null) {
    return [{ id: "store", position: { x: store.position[0], z: store.position[2] }, priority: 3, prompt: proximityPrompt({ radius: USE_REACH + 2, display: keybind("interact", `Open ${itemLabel(store.pieceId)}`), invoke: command("structureUse") }) }];
  }
  const plot = base.plot === null ? null : base.building.get(base.plot);
  if (plot !== null) {
    return [{ id: "plot", position: { x: plot.position[0], z: plot.position[2] }, priority: 3, prompt: proximityPrompt({ radius: USE_REACH + 2, display: keybind("interact", plotLabel(plotStep(ctx, plotOf(base, plot)))), invoke: command("structureUse") }) }];
  }
  const piece = aimedDoor(base);
  if (piece === null) return [];
  return [
    {
      id: "door",
      position: { x: piece.position[0], z: piece.position[2] },
      priority: 2,
      prompt: proximityPrompt({ radius: USE_REACH + 2, display: keybind("interact", `${piece.open ? "Close" : "Open"} ${itemLabel(piece.pieceId)}`), invoke: command("structureUse") }),
    },
  ];
}

/** What the HUD reads: the ghost's verdict and the piece under the crosshair. */
export function baseView(ctx: GameContext) {
  const base = baseOf(ctx);
  const aimed = base.aimed === null ? null : base.building.get(base.aimed);
  const def = aimed === null ? null : structureDef(aimed.pieceId);
  return {
    count: base.building.list().length,
    ghost: base.ghost === null ? null : { piece: itemLabel(base.ghost.pieceId), valid: base.ghost.valid, why: base.ghost.reason === undefined ? null : BLOCKED[base.ghost.reason], mode: base.ghost.mode },
    aimed: aimed === null || def === null ? null : { label: def.label, health: Math.ceil(aimed.health), max: def.health, open: aimedDoor(base)?.open === true, door: aimedDoor(base) !== null },
    open: base.building.list().filter((piece) => piece.open).length,
    /** Where the first foundation and doorframe stand, so a proof can measure the survivor against the hut. */
    floor: base.building.list().find((piece) => piece.pieceId === "thatch_foundation")?.position ?? null,
    doorway: base.building.list().find((piece) => piece.pieceId === "thatch_doorframe")?.position ?? null,
    /** The faced crop plot's soil, for the look readout and proofs. */
    plot: base.plot === null ? null : (base.plots.get(base.plot) ?? null),
  };
}

export type BaseView = ReturnType<typeof baseView>;

/** How many pieces whose id starts with `prefix` stand in the base (`thatch_wall`, or `thatch_` for every thatch piece). */
/** Where a dead survivor wakes: the last bed placed, used up as they wake on it; null with none. */
export function takeBed(ctx: GameContext): BaseVec3 | null {
  const base = baseOf(ctx);
  const bed = base.building.list().filter((piece) => BEDS.has(piece.pieceId)).at(-1);
  if (bed === undefined) return null;
  base.building.remove(bed.id);
  syncSolids(ctx, base);
  return [bed.position[0], bed.position[1], bed.position[2]];
}

/** Where the last piece of this kind was placed, or undefined with none. */
export function lastPiece(ctx: GameContext, pieceId: string): BaseVec3 | undefined {
  return baseOf(ctx).building.list().filter((piece) => piece.pieceId === pieceId).at(-1)?.position;
}

export function piecesBuilt(ctx: GameContext, prefix: string): number {
  return baseOf(ctx).building.list().filter((piece) => piece.pieceId.startsWith(prefix)).length;
}

interface BaseSave {
  building: BaseBuildingState;
  fires: Record<string, VitalsState>;
  stores: Record<string, InventoryState>;
  spoilage: Record<string, number>;
  plots: Record<string, Plot>;
}

export function baseSave(ctx: GameContext) {
  return {
    key: "fernwild.base5",
    snapshot: (): BaseSave => {
      const base = baseOf(ctx);
      return { building: base.building.snapshot(), fires: Object.fromEntries([...base.fires].map(([id, fire]) => [id, fire.state()])), stores: Object.fromEntries(base.stores), spoilage: base.spoilage.snapshot(), plots: Object.fromEntries(base.plots) };
    },
    hydrate: (data: BaseSave) => {
      const base = baseOf(ctx);
      base.building.restore(data.building);
      base.fires.clear();
      for (const [id, state] of Object.entries(data.fires)) {
        const fire = fireBody();
        fire.restore(state);
        base.fires.set(id, fire);
      }
      base.stores = new Map(Object.entries(data.stores));
      base.spoilage.restore(data.spoilage);
      base.plots = new Map(Object.entries(data.plots));
      syncSolids(ctx, base);
    },
  };
}

export function resetBase(ctx: GameContext): void {
  const base = baseOf(ctx);
  base.building.clear();
  base.fires.clear();
  base.stores.clear();
  base.spoilage.restore({});
  base.plots.clear();
  base.plot = null;
  base.viewing = null;
  base.store = null;
  base.ghost = null;
  base.turn = 0;
  syncSolids(ctx, base);
}
