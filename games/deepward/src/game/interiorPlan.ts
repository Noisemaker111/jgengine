import { planInteriorDressing, type InteriorClearance, type InteriorClutterSlot, type InteriorDebrisSlot, type InteriorDressingOptions, type InteriorDressingPlan } from "@jgengine/core/world/interiorDressing";

import type { Stratum } from "./strata";

/** A floor rectangle: centre and size on the ground plane. */
export interface FloorRect { x: number; z: number; w: number; d: number }

/**
 * How densely each floor is dressed. Receiving is a working dock left mid-shift (racks, carts, crates,
 * paperwork, pipe runs), the cold stores are tiled aisles with failed strip lamps and frost-burst
 * crates, the ink wells drip, rust and are strewn with scrap, and the choir is near-empty concrete
 * with tall ribs and a few burned-out lamps, so the floors read as different places before any prop
 * does. A share of every floor's wall lamps are dead, so each corridor has its dark stretches.
 */
export const DRESSING: Readonly<Record<Stratum, Omit<InteriorDressingOptions, "seed" | "floorY" | "ceilingY" | "keepClear">>> = {
  vault: {
    density: 1.3,
    trims: { skirting: 0.16, rail: 1.05, crown: true, ribSpacing: 4 },
    pipes: { perWall: 2, radius: 0.075, drops: 0.3 },
    cables: { chance: 0.55, floor: 0.45 },
    decals: { grime: 0.7, leaks: 0.08, rust: 0.06, floor: 0.05, wet: 0.012, paper: 0.025, scorch: 0.015 },
    fixtures: { spacing: 7, drop: 0.55, dead: 0.2, flicker: 0.1 },
    clutter: { spacing: 2.2, chance: 0.55 },
    panels: { chance: 0.55, hatches: 0.18, height: 1 },
    debris: { wall: 0.5, corners: 3, open: 0.03 },
  },
  cold: {
    density: 1.1,
    trims: { skirting: 0.2, rail: false, crown: true, ribSpacing: 3 },
    pipes: { perWall: 1, radius: 0.09, drops: 0.15 },
    cables: { chance: 0.25, floor: 0.3 },
    decals: { grime: 0.45, leaks: 0.05, rust: 0.03, floor: 0.03, wet: 0, paper: 0.03, scorch: 0 },
    fixtures: { spacing: 6, drop: 0.45, dead: 0.3, flicker: 0.12 },
    clutter: { spacing: 2.4, chance: 0.5 },
    panels: { chance: 0.4, hatches: 0.14, height: 1.15 },
    debris: { wall: 0.35, corners: 2, open: 0.015 },
  },
  wells: {
    density: 1.4,
    trims: { skirting: 0.12, rail: false, crown: false, ribSpacing: 2.6 },
    pipes: { perWall: 3, radius: 0.1, drops: 0.45 },
    cables: { chance: 0.85, sag: 0.32, floor: 0.6 },
    decals: { grime: 0.9, leaks: 0.4, rust: 0.3, floor: 0.07, wet: 0.06, paper: 0.015, scorch: 0.04 },
    fixtures: { spacing: 9, drop: 0.6, dead: 0.25, flicker: 0.15 },
    clutter: { spacing: 2, chance: 0.6 },
    panels: { chance: 0.3, hatches: 0.1, height: 0.9 },
    debris: { wall: 0.7, corners: 4, open: 0.05 },
  },
  choir: {
    density: 1,
    trims: { skirting: 0.28, rail: false, crown: true, ribSpacing: 2.5 },
    pipes: { perWall: 1, radius: 0.12, drops: 0.1 },
    cables: { chance: 0.2, sag: 0.4, floor: 0.25 },
    decals: { grime: 0.8, leaks: 0.2, rust: 0.05, floor: 0.03, wet: 0.02, paper: 0.01, scorch: 0.05 },
    fixtures: { spacing: 8, drop: 0.9, dead: 0.3, flicker: 0.15 },
    clutter: { spacing: 3, chance: 0.3 },
    panels: { chance: 0.35, hatches: 0.06, height: 1.3 },
    debris: { wall: 0.3, corners: 3, open: 0.02 },
  },
};

/** The clutter props each floor draws from: real-size CC0 library models, picked per slot. */
export const FLOOR_PROPS: Readonly<Record<Stratum, readonly string[]>> = {
  vault: ["industrial/metal-rack", "industrial/tool-cart", "industrial/plastic-crate", "industrial/wooden-crate", "industrial/storage-cart", "industrial/hand-truck", "industrial/tool-chest", "office/drawer-cabinet", "industrial/welding-cart", "office/fire-extinguisher", "industrial/power-box", "office/metal-desk"],
  cold: ["industrial/plastic-crate", "industrial/metal-rack", "industrial/compressor", "industrial/storage-cart", "industrial/propane-tank", "industrial/military-crate", "office/drawer-cabinet"],
  wells: ["industrial/barrel", "industrial/propane-tank", "survival/jerrycan", "industrial/generator", "industrial/military-crate", "industrial/welding-cart", "industrial/barrel", "industrial/ladder"],
  choir: ["industrial/military-crate", "survival/ammo-box", "industrial/barrel", "office/drawer-cabinet"],
};

/** The loose floor debris each floor scatters: small CC0 library models, picked per slot. */
export const FLOOR_DEBRIS: Readonly<Record<Stratum, readonly string[]>> = {
  vault: ["industrial/cardboard-box", "industrial/cardboard-box", "industrial/trash-bag", "office/clipboard", "industrial/oil-tin", "industrial/toolbox", "industrial/rusted-can", "industrial/pipe-wrench", "industrial/cement-bag"],
  cold: ["industrial/cardboard-box", "industrial/trash-bag", "industrial/rusted-can", "office/clipboard", "industrial/lpg-tank"],
  wells: ["industrial/rusted-can", "industrial/wheel-rim", "industrial/oil-tin", "industrial/crowbar", "industrial/sledgehammer", "industrial/trash-bag", "industrial/cement-bag", "industrial/rusted-can"],
  choir: ["industrial/cement-bag", "industrial/rusted-can", "industrial/crowbar", "industrial/trash-bag"],
};

/** A floor's dressing plan plus which library model stands in each clutter slot and lies in each debris slot. */
export interface FloorDressing {
  plan: InteriorDressingPlan;
  props: { slot: InteriorClutterSlot; model: string }[];
  debris: { slot: InteriorDebrisSlot; model: string }[];
}

function overlaps(slot: InteriorClutterSlot, block: FloorRect, margin: number): boolean {
  const across = Math.abs(Math.sin(slot.rotationY)) > 0.5;
  const w = across ? slot.depth : slot.width, d = across ? slot.width : slot.depth;
  return Math.abs(slot.position[0] - block.x) < (w + block.w) / 2 + margin && Math.abs(slot.position[2] - block.z) < (d + block.d) / 2 + margin;
}

/**
 * Plan one floor's dressing from its authored rooms. Everything here is derived: the walls come
 * from the room footprints, nothing on the floor covers a kept-clear spot (lifts, pickups, spawns)
 * and no prop stands inside an authored structure.
 */
export function planFloorDressing(stratum: Stratum, rooms: readonly FloorRect[], floorY: number, ceilingY: number, keepClear: readonly InteriorClearance[], blocks: readonly FloorRect[]): FloorDressing {
  const plan = planInteriorDressing(rooms, { seed: `deepward:${stratum}`, floorY, ceilingY, keepClear, ...DRESSING[stratum] });
  const pool = FLOOR_PROPS[stratum];
  const clutter = plan.clutter.filter(slot => !blocks.some(block => overlaps(slot, block, 0.15)));
  // Debris may not lie inside an authored structure or under a clutter prop either.
  const standing = clutter.map(clutterFootprint);
  const debris = plan.debris.filter(slot => ![...blocks, ...standing].some(block => Math.abs(slot.position[0] - block.x) < block.w / 2 + 0.2 && Math.abs(slot.position[2] - block.z) < block.d / 2 + 0.2));
  const scraps = FLOOR_DEBRIS[stratum];
  const choose = <T>(list: readonly T[], pick: number): T => list[Math.min(list.length - 1, Math.floor(pick * list.length))]!;
  return {
    plan: { ...plan, clutter, debris },
    props: clutter.map(slot => ({ slot, model: choose(pool, slot.pick) })),
    debris: debris.map(slot => ({ slot, model: choose(scraps, slot.pick) })),
  };
}

/** The ground a clutter prop takes up, as a box the walk check can test. */
export function clutterFootprint(slot: InteriorClutterSlot): FloorRect {
  const across = Math.abs(Math.sin(slot.rotationY)) > 0.5;
  return { x: slot.position[0], z: slot.position[2], w: across ? slot.depth : slot.width, d: across ? slot.width : slot.depth };
}
