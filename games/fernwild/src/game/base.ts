import { createBaseBuilding, type BaseBuilding, type BaseBuildingState, type BaseVec3, type BasePiece, type StructurePlan } from "@jgengine/core/basebuilding/baseBuilding";
import type { StationInstance } from "@jgengine/core/crafting/recipe";
import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { playerMovementHeading } from "@jgengine/core/movement/playerMovement";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { BAG, HOTBAR } from "./bags";
import { BASE_BUILDING, STATIONS, structureDef, TIER_COLORS } from "./data/structures";
import { itemLabel } from "./data/items";

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
  /** The piece in front of the survivor, for E (doors), G (demolish) and the look readout. */
  aimed: string | null;
}

const baseOf = perContext((): Base => ({ building: createBaseBuilding(BASE_BUILDING), ghost: null, turn: 0, syncedVersion: -1, aimed: null }));

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
export function tickBase(ctx: GameContext, heldItemId: string | null): void {
  const base = baseOf(ctx);
  const me = ctx.scene.entity.get(ctx.player.userId);
  syncSolids(ctx, base);
  if (me === null) return;
  const yaw = aimYaw(ctx, me.rotationY);
  base.ghost = heldItemId !== null && structureDef(heldItemId) !== null ? planFor(ctx, base, heldItemId, yaw) : null;
  base.aimed = base.building.raycast(eye(me.position), forward(yaw), USE_REACH)?.id ?? null;
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

/** E on a door or its frame: swing it. */
export function useStructure(ctx: GameContext): boolean {
  const base = baseOf(ctx);
  const door = aimedDoor(base);
  if (door === null) return false;
  const open = base.building.toggle(door.id);
  syncSolids(ctx, base);
  return open !== null;
}

function fell(ctx: GameContext, removed: readonly BasePiece[], refund: number): void {
  if (removed.length === 0) return;
  for (const piece of removed) {
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
  return baseOf(ctx)
    .building.list()
    .filter((piece) => STATIONS.has(piece.pieceId))
    .map((piece) => ({ catalogId: piece.pieceId, position: [piece.position[0], piece.position[2]] }));
}

/** E opens and shuts the door in front. */
export function basePrompts(ctx: GameContext): PositionedPrompt[] {
  const piece = aimedDoor(baseOf(ctx));
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
  };
}

export type BaseView = ReturnType<typeof baseView>;

/** How many pieces whose id starts with `prefix` stand in the base (`thatch_wall`, or `thatch_` for every thatch piece). */
export function piecesBuilt(ctx: GameContext, prefix: string): number {
  return baseOf(ctx).building.list().filter((piece) => piece.pieceId.startsWith(prefix)).length;
}

export function baseSave(ctx: GameContext) {
  return {
    key: "fernwild.base",
    snapshot: (): BaseBuildingState => baseOf(ctx).building.snapshot(),
    hydrate: (data: BaseBuildingState) => {
      const base = baseOf(ctx);
      base.building.restore(data);
      syncSolids(ctx, base);
    },
  };
}

export function resetBase(ctx: GameContext): void {
  const base = baseOf(ctx);
  base.building.clear();
  base.ghost = null;
  base.turn = 0;
  syncSolids(ctx, base);
}
