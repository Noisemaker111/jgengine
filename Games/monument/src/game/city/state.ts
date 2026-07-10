import type { GameContext } from "@jgengine/core/runtime/gameContext";

import {
  CELL,
  initialBuildings,
  makeBuilding,
  TYPOLOGY_CYCLE,
  type Building,
  type DistrictMood,
  type Lens,
  type Plaza,
  type PlazaKind,
  type Program,
  type Tool,
} from "../catalog";
import { lotAt, occupiedLotKeys } from "./model";

export interface Toast {
  text: string;
  at: number;
}

export interface PointerInput {
  point: { x: number; y: number; z: number };
  entity: string | null;
  object: string | null;
}

const read = <T>(ctx: GameContext, key: string, fallback: T): T => {
  const value = ctx.game.store.get(key);
  return value === undefined ? fallback : (value as T);
};

export const cityBuildings = (ctx: GameContext): Building[] => read(ctx, "buildings", []);
export const cityPlazas = (ctx: GameContext): Plaza[] => read(ctx, "plazas", []);
export const activeTool = (ctx: GameContext): Tool => read(ctx, "tool", "select");
export const selectedId = (ctx: GameContext): string | null => read(ctx, "selectedId", null);
export const activeLens = (ctx: GameContext): Lens => read(ctx, "lens", "material");
export const activeMood = (ctx: GameContext): DistrictMood => read(ctx, "mood", "default");
export const activeToast = (ctx: GameContext): Toast | null => read(ctx, "toast", null);

export const selectedBuilding = (ctx: GameContext): Building | null => {
  const id = selectedId(ctx);
  if (id === null) return null;
  return cityBuildings(ctx).find((b) => b.id === id) ?? null;
};

export const selectedPlaza = (ctx: GameContext): Plaza | null => {
  const id = selectedId(ctx);
  if (id === null) return null;
  return cityPlazas(ctx).find((p) => p.id === id) ?? null;
};

export function pushToast(ctx: GameContext, text: string): void {
  ctx.game.store.set("toast", { text, at: Date.now() } satisfies Toast);
}

export function setTool(ctx: GameContext, tool: Tool): void {
  ctx.game.store.set("tool", tool);
}

export function setLens(ctx: GameContext, lens: Lens): void {
  ctx.game.store.set("lens", lens);
}

export function selectInstance(ctx: GameContext, id: string | null): void {
  ctx.game.store.set("selectedId", id);
}

const nextId = (ctx: GameContext, prefix: string): string => {
  const seq = read(ctx, "seq", 0) + 1;
  ctx.game.store.set("seq", seq);
  return `${prefix}-${seq}`;
};

const placedCount = (ctx: GameContext): number => read(ctx, "placedCount", 0);

export function initCity(ctx: GameContext): void {
  const buildings = initialBuildings();
  ctx.game.store.set("buildings", buildings);
  ctx.game.store.set("plazas", [] satisfies Plaza[]);
  ctx.game.store.set("tool", "select" satisfies Tool);
  ctx.game.store.set("selectedId", null);
  ctx.game.store.set("lens", "material" satisfies Lens);
  ctx.game.store.set("mood", "default" satisfies DistrictMood);
  ctx.game.store.set("seq", 0);
  ctx.game.store.set("placedCount", buildings.length);
  for (const building of buildings) ctx.scene.object.place("building", building.x, 0, building.z, { instanceId: building.id });
}

export function placeBuildingAt(ctx: GameContext, x: number, z: number, program: Program): Building | null {
  const lot = lotAt(x, z);
  if (lot === null) {
    pushToast(ctx, "Outside the site");
    return null;
  }
  const buildings = cityBuildings(ctx);
  const plazas = cityPlazas(ctx);
  if (occupiedLotKeys(buildings, plazas).has(`${lot.gx},${lot.gz}`)) {
    pushToast(ctx, "Lot already claimed");
    return null;
  }
  const count = placedCount(ctx);
  const typology = TYPOLOGY_CYCLE[(count + Math.abs(lot.gx) + Math.abs(lot.gz)) % TYPOLOGY_CYCLE.length];
  const building = makeBuilding(nextId(ctx, "b"), lot.x, lot.z, program, typology, count);
  ctx.game.store.set("buildings", [...buildings, building]);
  ctx.game.store.set("placedCount", count + 1);
  ctx.scene.object.place("building", building.x, 0, building.z, { instanceId: building.id });
  selectInstance(ctx, building.id);
  pushToast(ctx, `${building.name} cast in place`);
  return building;
}

export function placePlazaAt(ctx: GameContext, x: number, z: number, kind: PlazaKind = "forum"): Plaza | null {
  const lot = lotAt(x, z);
  if (lot === null) {
    pushToast(ctx, "Outside the site");
    return null;
  }
  const buildings = cityBuildings(ctx);
  const plazas = cityPlazas(ctx);
  if (occupiedLotKeys(buildings, plazas).has(`${lot.gx},${lot.gz}`)) {
    pushToast(ctx, "Lot already claimed");
    return null;
  }
  const plaza: Plaza = { id: nextId(ctx, "p"), x: lot.x, z: lot.z, trees: kind === "garden" ? 8 : 4, kind };
  ctx.game.store.set("plazas", [...plazas, plaza]);
  ctx.scene.object.place("plaza", plaza.x, 0, plaza.z, { instanceId: plaza.id });
  selectInstance(ctx, plaza.id);
  pushToast(ctx, "Public ground opened");
  return plaza;
}

export function updateBuilding(ctx: GameContext, id: string, patch: Partial<Building>): void {
  const buildings = cityBuildings(ctx);
  const index = buildings.findIndex((b) => b.id === id);
  if (index < 0) return;
  const next = [...buildings];
  next[index] = { ...buildings[index], ...patch, id };
  ctx.game.store.set("buildings", next);
  if (patch.x !== undefined || patch.z !== undefined) {
    ctx.scene.object.move(id, next[index].x, 0, next[index].z);
  }
}

export function updatePlaza(ctx: GameContext, id: string, patch: Partial<Plaza>): void {
  const plazas = cityPlazas(ctx);
  const index = plazas.findIndex((p) => p.id === id);
  if (index < 0) return;
  const next = [...plazas];
  next[index] = { ...plazas[index], ...patch, id };
  ctx.game.store.set("plazas", next);
}

export function demolish(ctx: GameContext, id: string): void {
  const buildings = cityBuildings(ctx);
  const plazas = cityPlazas(ctx);
  const building = buildings.find((b) => b.id === id);
  const plaza = plazas.find((p) => p.id === id);
  if (building !== undefined) {
    ctx.game.store.set("buildings", buildings.filter((b) => b.id !== id));
    pushToast(ctx, `${building.name} struck from the plan`);
  } else if (plaza !== undefined) {
    ctx.game.store.set("plazas", plazas.filter((p) => p.id !== id));
    pushToast(ctx, "Public ground reclaimed");
  } else {
    return;
  }
  ctx.scene.object.remove(id);
  if (selectedId(ctx) === id) selectInstance(ctx, null);
}

export function pointerAction(ctx: GameContext, input: PointerInput): void {
  const tool = activeTool(ctx);
  if (tool === "demolish") {
    if (input.object !== null) demolish(ctx, input.object);
    return;
  }
  if (tool === "select") {
    selectInstance(ctx, input.object);
    return;
  }
  if (input.object !== null) {
    selectInstance(ctx, input.object);
    return;
  }
  if (tool === "plaza") {
    placePlazaAt(ctx, input.point.x, input.point.z);
    return;
  }
  placeBuildingAt(ctx, input.point.x, input.point.z, tool);
}
