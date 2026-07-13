import type { RecipeItem } from "./recipe";

export interface ProductionBuildingDef {
  id: string;
  inputs: readonly RecipeItem[];
  outputs: readonly RecipeItem[];
  rate: number;
  power?: number;
  bufferMultiplier?: number;
}

export interface ProductionBuildingConfig {
  id: string;
  inputs?: readonly RecipeItem[];
  outputs: readonly RecipeItem[];
  rate: number;
  power?: number;
  bufferMultiplier?: number;
}

export type ItemCounts = Readonly<Record<string, number>>;

export interface ProductionState {
  buffer: ItemCounts;
  output: ItemCounts;
  progress: number;
  active: boolean;
}

export interface ProductionTickInput {
  dt: number;
  powered?: boolean;
}

export function productionBuilding(config: ProductionBuildingConfig): ProductionBuildingDef {
  return {
    id: config.id,
    inputs: config.inputs ?? [],
    outputs: config.outputs,
    rate: config.rate,
    power: config.power,
    bufferMultiplier: config.bufferMultiplier,
  };
}

/**
 * A production building that converts input items into outputs over time — factory/crafting station.
 *
 * @capability production-building a factory building converting inputs to outputs over time
 */
export function createProductionState(): ProductionState {
  return { buffer: {}, output: {}, progress: 0, active: false };
}

function addCount(counts: ItemCounts, itemId: string, amount: number): ItemCounts {
  const next = { ...counts };
  const total = (next[itemId] ?? 0) + amount;
  if (total <= 0) delete next[itemId];
  else next[itemId] = total;
  return next;
}

function bufferCapacity(def: ProductionBuildingDef, required: number): number {
  const multiplier = def.bufferMultiplier !== undefined && def.bufferMultiplier > 0 ? def.bufferMultiplier : 2;
  return Math.max(required, Math.ceil(required * multiplier));
}

export function acceptsInput(def: ProductionBuildingDef, state: ProductionState, itemId: string): boolean {
  const input = def.inputs.find((i) => i.itemId === itemId);
  if (input === undefined) return false;
  const held = state.buffer[itemId] ?? 0;
  return held < bufferCapacity(def, input.count);
}

export function feedProduction(
  def: ProductionBuildingDef,
  state: ProductionState,
  itemId: string,
  count: number,
): { state: ProductionState; accepted: number } {
  const input = def.inputs.find((i) => i.itemId === itemId);
  if (input === undefined || count <= 0) return { state, accepted: 0 };
  const capacity = bufferCapacity(def, input.count);
  const held = state.buffer[itemId] ?? 0;
  const accepted = Math.min(count, Math.max(0, capacity - held));
  if (accepted === 0) return { state, accepted: 0 };
  return { state: { ...state, buffer: addCount(state.buffer, itemId, accepted) }, accepted };
}

export function drainOutput(state: ProductionState, itemId: string, count?: number): { state: ProductionState; taken: number } {
  const held = state.output[itemId] ?? 0;
  const taken = count === undefined ? held : Math.min(count, held);
  if (taken <= 0) return { state, taken: 0 };
  return { state: { ...state, output: addCount(state.output, itemId, -taken) }, taken };
}

function hasInputs(def: ProductionBuildingDef, buffer: ItemCounts): boolean {
  return def.inputs.every((i) => (buffer[i.itemId] ?? 0) >= i.count);
}

function consume(def: ProductionBuildingDef, buffer: ItemCounts): ItemCounts {
  let next = buffer;
  for (const input of def.inputs) next = addCount(next, input.itemId, -input.count);
  return next;
}

function emit(def: ProductionBuildingDef, output: ItemCounts): ItemCounts {
  let next = output;
  for (const out of def.outputs) next = addCount(next, out.itemId, out.count);
  return next;
}

export function tickProduction(def: ProductionBuildingDef, state: ProductionState, input: ProductionTickInput): ProductionState {
  const powerNeeded = def.power !== undefined && def.power > 0;
  if (powerNeeded && input.powered !== true) return state;
  if (!(def.rate > 0) || input.dt <= 0) return state;

  const secondsPerCycle = 1 / def.rate;
  let buffer = state.buffer;
  let output = state.output;
  let progress = state.progress;
  let active = state.active;

  if (!active) {
    if (!hasInputs(def, buffer)) return state;
    buffer = consume(def, buffer);
    active = true;
    progress = 0;
  }

  progress += input.dt;

  let guard = 0;
  while (active && progress >= secondsPerCycle) {
    progress -= secondsPerCycle;
    output = emit(def, output);
    if (hasInputs(def, buffer)) {
      buffer = consume(def, buffer);
    } else {
      active = false;
      progress = 0;
    }
    guard += 1;
    if (guard >= 10_000) break;
  }

  return { buffer, output, progress, active };
}

export interface TransportItem {
  itemId: string;
  count: number;
  position: number;
}

export interface TransportPath {
  length: number;
  speed: number;
}

export function advanceTransport(
  path: TransportPath,
  items: readonly TransportItem[],
  dt: number,
): { items: TransportItem[]; delivered: TransportItem[] } {
  if (dt <= 0 || !(path.speed > 0)) return { items: items.slice(), delivered: [] };
  const moving: TransportItem[] = [];
  const delivered: TransportItem[] = [];
  const step = path.speed * dt;
  for (const item of items) {
    const position = item.position + step;
    if (position >= path.length) delivered.push({ ...item, position: path.length });
    else moving.push({ ...item, position });
  }
  return { items: moving, delivered };
}

export interface PowerConsumer {
  id: string;
  demand: number;
}

export interface PowerGridResult {
  powered: ReadonlySet<string>;
  supply: number;
  demand: number;
  deficit: number;
}

export function resolvePowerGrid(supply: number, consumers: readonly PowerConsumer[]): PowerGridResult {
  const powered = new Set<string>();
  let used = 0;
  let demand = 0;
  for (const consumer of consumers) {
    demand += Math.max(0, consumer.demand);
    if (used + consumer.demand <= supply) {
      used += consumer.demand;
      powered.add(consumer.id);
    }
  }
  return { powered, supply, demand, deficit: Math.max(0, demand - supply) };
}
