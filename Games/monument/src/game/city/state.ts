import type { GameContext } from "@jgengine/core/runtime/gameContext";

import {
  CELL,
  DAY_LENGTH,
  initialBuildings,
  lots,
  makeBuilding,
  TYPOLOGY_CYCLE,
  type Building,
  type DecisionRecord,
  type DistrictCharter,
  type DistrictMood,
  type Lens,
  type Plaza,
  type PlazaKind,
  type Program,
  type Tool,
} from "../catalog";
import { briefCompleted, growthBriefs, nextCharterEvent, AGE_PER_DAY, CITY_EVENTS, CONDITION_FLOOR, FORMAL_WEAR_PER_DAY, WEAR_PER_DAY } from "./briefs";
import { MOOD_DEFS, type SavedCity } from "./library";
import { resolveCityMetrics } from "./metrics";
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

export interface CitySnapshot {
  buildings: Building[];
  plazas: Plaza[];
  briefStage: number;
  charter: DistrictCharter;
  decisions: DecisionRecord[];
}

const HISTORY_LIMIT = 60;
const PLAZA_KIND_CYCLE: readonly PlazaKind[] = ["garden", "water", "forum"];

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
export const activeCharter = (ctx: GameContext): DistrictCharter => read(ctx, "charter", {});
export const systemsPanelOpen = (ctx: GameContext): boolean => read(ctx, "systems", false);
export const briefStage = (ctx: GameContext): number => read(ctx, "briefStage", 0);
export const focusMode = (ctx: GameContext): boolean => read(ctx, "focus", false);
export const helpOpen = (ctx: GameContext): boolean => read(ctx, "help", false);
export const welcomeOpen = (ctx: GameContext): boolean => read(ctx, "welcome", true);
export const libraryRevision = (ctx: GameContext): number => read(ctx, "libraryRev", 0);
export const cityDay = (ctx: GameContext): number => ctx.time.calendar().day + read(ctx, "dayBase", 0);
export const cityDecisions = (ctx: GameContext): DecisionRecord[] => read(ctx, "decisions", []);
export const activeEventId = (ctx: GameContext): keyof DistrictCharter | null => read(ctx, "activeEvent", null);
export const historyDepth = (ctx: GameContext): number => read(ctx, "history", [] as CitySnapshot[]).length;
export const futureDepth = (ctx: GameContext): number => read(ctx, "future", [] as CitySnapshot[]).length;

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
  if (id !== null) ctx.game.store.set("systems", false);
}

export function toggleSystems(ctx: GameContext): void {
  const next = !systemsPanelOpen(ctx);
  ctx.game.store.set("systems", next);
  if (next) ctx.game.store.set("selectedId", null);
}

const nextId = (ctx: GameContext, prefix: string): string => {
  const seq = read(ctx, "seq", 0) + 1;
  ctx.game.store.set("seq", seq);
  return `${prefix}-${seq}`;
};

const placedCount = (ctx: GameContext): number => read(ctx, "placedCount", 0);

const citySnapshot = (ctx: GameContext): CitySnapshot =>
  structuredClone({
    buildings: cityBuildings(ctx),
    plazas: cityPlazas(ctx),
    briefStage: briefStage(ctx),
    charter: activeCharter(ctx),
    decisions: cityDecisions(ctx),
  });

export function captureHistory(ctx: GameContext): void {
  const history = [...read(ctx, "history", [] as CitySnapshot[]), citySnapshot(ctx)];
  if (history.length > HISTORY_LIMIT) history.shift();
  ctx.game.store.set("history", history);
  ctx.game.store.set("future", [] as CitySnapshot[]);
}

function syncSceneObjects(ctx: GameContext): void {
  const wanted = new Map<string, { catalogId: string; x: number; z: number }>();
  for (const b of cityBuildings(ctx)) wanted.set(b.id, { catalogId: "building", x: b.x, z: b.z });
  for (const p of cityPlazas(ctx)) wanted.set(p.id, { catalogId: "plaza", x: p.x, z: p.z });
  for (const object of ctx.scene.object.list()) {
    if (object.catalogId !== "building" && object.catalogId !== "plaza") continue;
    const record = wanted.get(object.instanceId);
    if (record === undefined) {
      ctx.scene.object.remove(object.instanceId);
    } else {
      if (record.x !== object.position[0] || record.z !== object.position[2]) {
        ctx.scene.object.move(object.instanceId, record.x, 0, record.z);
      }
      wanted.delete(object.instanceId);
    }
  }
  for (const [id, record] of wanted) ctx.scene.object.place(record.catalogId, record.x, 0, record.z, { instanceId: id });
}

function applySnapshot(ctx: GameContext, snapshot: CitySnapshot): void {
  ctx.game.store.set("buildings", snapshot.buildings);
  ctx.game.store.set("plazas", snapshot.plazas);
  ctx.game.store.set("briefStage", snapshot.briefStage);
  ctx.game.store.set("charter", snapshot.charter);
  ctx.game.store.set("decisions", snapshot.decisions);
  syncSceneObjects(ctx);
  const id = selectedId(ctx);
  if (id !== null && snapshot.buildings.every((b) => b.id !== id) && snapshot.plazas.every((p) => p.id !== id)) {
    selectInstance(ctx, null);
  }
}

export function undoCity(ctx: GameContext): void {
  const history = [...read(ctx, "history", [] as CitySnapshot[])];
  const snapshot = history.pop();
  if (snapshot === undefined) return;
  ctx.game.store.set("future", [...read(ctx, "future", [] as CitySnapshot[]), citySnapshot(ctx)]);
  ctx.game.store.set("history", history);
  applySnapshot(ctx, snapshot);
  pushToast(ctx, "Last move undone");
}

export function redoCity(ctx: GameContext): void {
  const future = [...read(ctx, "future", [] as CitySnapshot[])];
  const snapshot = future.pop();
  if (snapshot === undefined) return;
  ctx.game.store.set("history", [...read(ctx, "history", [] as CitySnapshot[]), citySnapshot(ctx)]);
  ctx.game.store.set("future", future);
  applySnapshot(ctx, snapshot);
  pushToast(ctx, "Move restored");
}

export function initCity(ctx: GameContext): void {
  const buildings = initialBuildings();
  ctx.game.store.set("buildings", buildings);
  ctx.game.store.set("plazas", [] satisfies Plaza[]);
  ctx.game.store.set("tool", "select" satisfies Tool);
  ctx.game.store.set("selectedId", null);
  ctx.game.store.set("lens", "material" satisfies Lens);
  ctx.game.store.set("mood", "default" satisfies DistrictMood);
  ctx.game.store.set("systems", false);
  ctx.game.store.set("focus", false);
  ctx.game.store.set("welcome", true);
  ctx.game.store.set("libraryRev", 0);
  ctx.game.store.set("dayBase", 0);
  ctx.game.store.set("briefStage", 0);
  ctx.game.store.set("charter", {} satisfies DistrictCharter);
  ctx.game.store.set("decisions", [] satisfies DecisionRecord[]);
  ctx.game.store.set("activeEvent", null);
  ctx.game.store.set("seq", 0);
  ctx.game.store.set("placedCount", buildings.length);
  ctx.game.store.set("history", [] satisfies CitySnapshot[]);
  ctx.game.store.set("future", [] satisfies CitySnapshot[]);
  for (const building of buildings) ctx.scene.object.place("building", building.x, 0, building.z, { instanceId: building.id });
  ctx.time.pause();
  applyBootParams(ctx);
}

function applyBootParams(ctx: GameContext): void {
  if (typeof location === "undefined") return;
  const params = new URLSearchParams(location.search);
  const mood = params.get("mood");
  const moodDef = MOOD_DEFS.find((def) => def.id === mood);
  if (moodDef !== undefined) setMood(ctx, moodDef.id);
  if (params.get("menu") === "0") setWelcomeOpen(ctx, false);
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
  captureHistory(ctx);
  const count = placedCount(ctx);
  const typology = TYPOLOGY_CYCLE[(count + Math.abs(lot.gx) + Math.abs(lot.gz)) % TYPOLOGY_CYCLE.length];
  const building = makeBuilding(nextId(ctx, "b"), lot.x, lot.z, program, typology, count);
  ctx.game.store.set("buildings", [...buildings, building]);
  ctx.game.store.set("placedCount", count + 1);
  ctx.scene.object.place("building", building.x, 0, building.z, { instanceId: building.id });
  selectInstance(ctx, building.id);
  pushToast(ctx, "A new building has joined the city");
  return building;
}

export function placePlazaAt(ctx: GameContext, x: number, z: number, kind?: PlazaKind): Plaza | null {
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
  captureHistory(ctx);
  const plaza: Plaza = {
    id: nextId(ctx, "p"),
    x: lot.x,
    z: lot.z,
    trees: 6,
    kind: kind ?? PLAZA_KIND_CYCLE[plazas.length % PLAZA_KIND_CYCLE.length],
  };
  ctx.game.store.set("plazas", [...plazas, plaza]);
  ctx.scene.object.place("plaza", plaza.x, 0, plaza.z, { instanceId: plaza.id });
  selectInstance(ctx, plaza.id);
  pushToast(ctx, "New public ground established");
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

const rotatedExtents = (b: Pick<Building, "width" | "depth" | "rotation">): { x: number; z: number } => {
  const r = (b.rotation * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { x: (b.width * c + b.depth * s) / 2 + 3, z: (b.width * s + b.depth * c) / 2 + 3 };
};

export function growSibling(ctx: GameContext, id: string): Building | null {
  const buildings = cityBuildings(ctx);
  const plazas = cityPlazas(ctx);
  const selected = buildings.find((b) => b.id === id);
  if (selected === undefined) return null;
  const selectedExt = rotatedExtents(selected);
  const candidates = lots
    .map((lot) => [lot.x, lot.z] as [number, number])
    .sort((a, b) => Math.hypot(a[0] - selected.x, a[1] - selected.z) - Math.hypot(b[0] - selected.x, b[1] - selected.z));
  const spot = candidates.find(([x, z]) => {
    if (Math.abs(x - selected.x) < 1 && Math.abs(z - selected.z) < 1) return false;
    if (plazas.some((p) => Math.abs(x - p.x) < selectedExt.x + CELL * 0.42 && Math.abs(z - p.z) < selectedExt.z + CELL * 0.42)) return false;
    return !buildings.some((other) => {
      const e = rotatedExtents(other);
      return Math.abs(x - other.x) < selectedExt.x + e.x && Math.abs(z - other.z) < selectedExt.z + e.z;
    });
  });
  if (spot === undefined) {
    pushToast(ctx, "No clear site can hold this family member yet");
    return null;
  }
  const variation = (buildings.length % 5) - 2;
  captureHistory(ctx);
  const clone: Building = {
    ...selected,
    id: nextId(ctx, "b"),
    name: `${selected.name} · ${buildings.length + 1}`,
    x: spot[0],
    z: spot[1],
    height: Math.max(12, selected.height * (0.9 + variation * 0.035)),
    rotation: (selected.rotation + (variation % 2 ? 90 : 0) + 360) % 360,
    articulation: Math.max(0, Math.min(100, selected.articulation + variation * 7)),
    branches: Math.max(0, Math.min(8, selected.branches + (variation > 0 ? 1 : variation < 0 ? -1 : 0))),
    crown: Math.max(0, Math.min(100, selected.crown - variation * 6)),
  };
  ctx.game.store.set("buildings", [...buildings, clone]);
  ctx.scene.object.place("building", clone.x, 0, clone.z, { instanceId: clone.id });
  selectInstance(ctx, clone.id);
  pushToast(ctx, "A related structure grew from the same architectural grammar");
  return clone;
}

export function demolish(ctx: GameContext, id: string): void {
  const buildings = cityBuildings(ctx);
  const plazas = cityPlazas(ctx);
  const building = buildings.find((b) => b.id === id);
  const plaza = plazas.find((p) => p.id === id);
  if (building === undefined && plaza === undefined) return;
  captureHistory(ctx);
  if (building !== undefined) {
    ctx.game.store.set("buildings", buildings.filter((b) => b.id !== id));
    pushToast(ctx, "Structure carefully deconstructed for the next idea");
  } else {
    ctx.game.store.set("plazas", plazas.filter((p) => p.id !== id));
    pushToast(ctx, "Public ground opened for a new use");
  }
  ctx.scene.object.remove(id);
  if (selectedId(ctx) === id) selectInstance(ctx, null);
}

export function toggleFocusMode(ctx: GameContext): void {
  ctx.game.store.set("focus", !focusMode(ctx));
}

export function toggleHelp(ctx: GameContext): void {
  ctx.game.store.set("help", !helpOpen(ctx));
}

export function setWelcomeOpen(ctx: GameContext, open: boolean): void {
  ctx.game.store.set("welcome", open);
  if (open) ctx.time.pause();
  else ctx.time.play();
}

export function bumpLibraryRevision(ctx: GameContext): void {
  ctx.game.store.set("libraryRev", libraryRevision(ctx) + 1);
}

export function jumpToHour(ctx: GameContext, hour: number, day?: number): void {
  const targetFraction = ((hour / 24) % 1 + 1) % 1;
  const current = ctx.time.calendar().dayFraction;
  const gameDelta = ((targetFraction - current + 1) % 1) * DAY_LENGTH;
  const wasPaused = ctx.time.snapshot().paused;
  if (wasPaused) ctx.time.play();
  const live = ctx.time.snapshot();
  const rate = live.scale * live.speed * live.timescale;
  if (rate > 0) ctx.time.advance(gameDelta / rate);
  if (wasPaused) ctx.time.pause();
  if (day !== undefined) ctx.game.store.set("dayBase", day - 1 - ctx.time.calendar().day);
}

export function setMood(ctx: GameContext, mood: DistrictMood): void {
  ctx.game.store.set("mood", mood);
  const def = MOOD_DEFS.find((entry) => entry.id === mood);
  if (def !== undefined) jumpToHour(ctx, def.hour);
}

export function captureCity(ctx: GameContext): SavedCity {
  return structuredClone({
    buildings: cityBuildings(ctx),
    plazas: cityPlazas(ctx),
    briefStage: briefStage(ctx),
    charter: activeCharter(ctx),
    decisions: cityDecisions(ctx),
    mood: activeMood(ctx),
    hour: ctx.time.calendar().dayFraction * 24,
    day: cityDay(ctx) + 1,
  });
}

export function loadCity(ctx: GameContext, saved: SavedCity): void {
  ctx.game.store.set("buildings", structuredClone(saved.buildings));
  ctx.game.store.set("plazas", structuredClone(saved.plazas));
  ctx.game.store.set("briefStage", saved.briefStage);
  ctx.game.store.set("charter", structuredClone(saved.charter));
  ctx.game.store.set("decisions", structuredClone(saved.decisions));
  ctx.game.store.set("mood", saved.mood);
  ctx.game.store.set("placedCount", saved.buildings.length);
  ctx.game.store.set("selectedId", null);
  ctx.game.store.set("systems", false);
  ctx.game.store.set("activeEvent", null);
  ctx.game.store.set("history", [] satisfies CitySnapshot[]);
  ctx.game.store.set("future", [] satisfies CitySnapshot[]);
  syncSceneObjects(ctx);
  jumpToHour(ctx, saved.hour, saved.day);
  setWelcomeOpen(ctx, false);
}

export function advanceGrowth(ctx: GameContext): void {
  const stage = briefStage(ctx);
  const charter = activeCharter(ctx);
  const briefs = growthBriefs(resolveCityMetrics(cityBuildings(ctx), cityPlazas(ctx), charter), cityBuildings(ctx).length, cityPlazas(ctx).length);
  if (stage < briefs.length && briefCompleted(briefs[stage])) {
    ctx.game.store.set("briefStage", stage + 1);
    pushToast(ctx, "Sketch complete · a city choice is ready");
  }
  if (activeEventId(ctx) !== null) return;
  const next = nextCharterEvent(briefStage(ctx), charter);
  if (next === null) return;
  ctx.game.store.set("pausedBeforeChoice", ctx.time.snapshot().paused);
  ctx.time.pause();
  ctx.game.store.set("activeEvent", next.id);
}

export function resolveCharter(ctx: GameContext, eventId: keyof DistrictCharter, choiceIndex: number): void {
  const event = CITY_EVENTS.find((entry) => entry.id === eventId);
  const choice = event?.choices[choiceIndex];
  if (event === undefined || choice === undefined) return;
  captureHistory(ctx);
  ctx.game.store.set("charter", { ...activeCharter(ctx), [eventId]: choice.choice } satisfies DistrictCharter);
  const day = ctx.time.calendar().day + 1;
  ctx.game.store.set("decisions", [
    ...cityDecisions(ctx).filter((record) => record.eventId !== eventId),
    { eventId, choice: choice.label, day } satisfies DecisionRecord,
  ]);
  ctx.game.store.set("activeEvent", null);
  if (read(ctx, "pausedBeforeChoice", false) === false) ctx.time.play();
  pushToast(ctx, `City changed · ${choice.label} · ${choice.impacts[0]}`);
}

export function ageBuildingsDaily(ctx: GameContext, days: number): void {
  if (days <= 0) return;
  const wear = activeCharter(ctx).aggregate === "formal" ? FORMAL_WEAR_PER_DAY : WEAR_PER_DAY;
  const aged = cityBuildings(ctx).map((b) => ({
    ...b,
    age: b.age + AGE_PER_DAY * days,
    condition: Math.max(CONDITION_FLOOR, b.condition - wear * days),
  }));
  ctx.game.store.set("buildings", aged);
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
