import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { registerBuildCommands } from "../build/commands";
import { placeObject } from "../build/placement";
import { seedGuests } from "../sim/guests";
import { resetSession, session } from "../session";

interface SeedEntry {
  id: string;
  x: number;
  z: number;
}

const RIDES: readonly SeedEntry[] = [
  { id: "ride_carousel", x: -20, z: 8 },
  { id: "ride_coaster", x: 20, z: 4 },
  { id: "stall_food", x: -12, z: 28 },
  { id: "stall_food", x: 12, z: 28 },
];

const TRACK_LOOP: readonly [number, number][] = [
  [28, 4],
  [28, 8],
  [28, 12],
  [28, 16],
  [24, 16],
  [20, 16],
  [16, 16],
  [16, 12],
  [16, 8],
  [16, 4],
];

const PATHS: readonly [number, number][] = [
  [0, 48],
  [0, 44],
  [0, 40],
  [0, 36],
  [0, 32],
  [0, 28],
  [0, 24],
  [0, 20],
  [0, 16],
  [-4, 20],
  [4, 20],
  [-4, 28],
  [-8, 28],
  [4, 28],
  [8, 28],
  [-4, 12],
  [-8, 12],
  [4, 12],
  [8, 12],
];

const TREES: readonly [number, number][] = [
  [-32, 12],
  [32, 12],
  [-28, -8],
  [28, 28],
  [-20, 32],
  [20, 32],
  [-8, -12],
  [8, -12],
  [-16, 44],
  [16, 44],
  [-32, 32],
  [32, 32],
  [-24, -12],
  [24, -12],
  [0, -12],
  [-32, -20],
];

function seedStarterPark(ctx: GameContext): void {
  for (const entry of RIDES) placeObject(ctx, entry.id, entry.x, entry.z);
  for (const [x, z] of TRACK_LOOP) placeObject(ctx, "track_piece", x, z);
  for (const [x, z] of PATHS) placeObject(ctx, "path_walk", x, z);
  for (const [x, z] of TREES) placeObject(ctx, "deco_tree", x, z);
}

export function setupWorld(ctx: GameContext): void {
  resetSession();
  registerBuildCommands(ctx);
  seedStarterPark(ctx);
  seedGuests(ctx, 24);
  session.started = true;
}
