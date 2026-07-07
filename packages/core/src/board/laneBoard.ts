export type Side = string;

export interface LaneRuleInput<C> {
  lane: number;
  side: Side;
  cards: readonly C[];
  subtotal: number;
}

export interface LaneRule<C> {
  id: string;
  apply: (input: LaneRuleInput<C>) => number;
}

export interface LaneBoardConfig<C> {
  laneCount: number;
  sides: readonly Side[];
  power: (card: C) => number;
  laneRules?: readonly (LaneRule<C> | null | undefined)[];
}

export interface LaneCells<C> {
  readonly [side: Side]: readonly C[];
}

export interface LaneBoardState<C> {
  readonly lanes: readonly LaneCells<C>[];
}

export interface LaneAggregate {
  lane: number;
  side: Side;
  subtotal: number;
  total: number;
  count: number;
}

export interface LaneOutcome {
  lane: number;
  totals: Readonly<Record<Side, number>>;
  winner: Side | null;
}

export type LaneRejection = "invalid-lane" | "invalid-side";

export interface LanePlaceResult<C> {
  status: "ok";
  state: LaneBoardState<C>;
}
export interface LanePlaceRejected {
  status: "rejected";
  reason: LaneRejection;
}
export type LaneResult<C> = LanePlaceResult<C> | LanePlaceRejected;

function emptyLane<C>(sides: readonly Side[]): LaneCells<C> {
  const cells: Record<Side, readonly C[]> = {};
  for (const side of sides) cells[side] = [];
  return cells;
}

export function createLaneBoardState<C>(config: LaneBoardConfig<C>): LaneBoardState<C> {
  if (config.laneCount <= 0) throw new Error("laneBoard needs at least one lane");
  if (config.sides.length === 0) throw new Error("laneBoard needs at least one side");
  const lanes: LaneCells<C>[] = [];
  for (let i = 0; i < config.laneCount; i++) lanes.push(emptyLane<C>(config.sides));
  return { lanes };
}

function validLane<C>(state: LaneBoardState<C>, lane: number): boolean {
  return Number.isInteger(lane) && lane >= 0 && lane < state.lanes.length;
}

export function placeCard<C>(
  state: LaneBoardState<C>,
  config: LaneBoardConfig<C>,
  lane: number,
  side: Side,
  card: C,
): LaneResult<C> {
  if (!validLane(state, lane)) return { status: "rejected", reason: "invalid-lane" };
  if (!config.sides.includes(side)) return { status: "rejected", reason: "invalid-side" };
  const lanes = state.lanes.slice();
  const cell = lanes[lane];
  lanes[lane] = { ...cell, [side]: [...cell[side], card] };
  return { status: "ok", state: { lanes } };
}

export function removeCard<C>(
  state: LaneBoardState<C>,
  lane: number,
  side: Side,
  predicate: (card: C, index: number) => boolean,
): LaneResult<C> {
  if (!validLane(state, lane)) return { status: "rejected", reason: "invalid-lane" };
  const cell = state.lanes[lane];
  if (cell[side] === undefined) return { status: "rejected", reason: "invalid-side" };
  const lanes = state.lanes.slice();
  lanes[lane] = { ...cell, [side]: cell[side].filter((card, index) => !predicate(card, index)) };
  return { status: "ok", state: { lanes } };
}

export function laneAggregate<C>(
  state: LaneBoardState<C>,
  config: LaneBoardConfig<C>,
  lane: number,
  side: Side,
): LaneAggregate {
  const cards = state.lanes[lane]?.[side] ?? [];
  let subtotal = 0;
  for (const card of cards) subtotal += config.power(card);
  const rule = config.laneRules?.[lane] ?? null;
  const total = rule ? rule.apply({ lane, side, cards, subtotal }) : subtotal;
  return { lane, side, subtotal, total, count: cards.length };
}

export function laneOutcome<C>(
  state: LaneBoardState<C>,
  config: LaneBoardConfig<C>,
  lane: number,
): LaneOutcome {
  const totals: Record<Side, number> = {};
  let winner: Side | null = null;
  let best = -Infinity;
  let tie = false;
  for (const side of config.sides) {
    const total = laneAggregate(state, config, lane, side).total;
    totals[side] = total;
    if (total > best) {
      best = total;
      winner = side;
      tie = false;
    } else if (total === best) {
      tie = true;
    }
  }
  return { lane, totals, winner: tie ? null : winner };
}

export function boardTotals<C>(
  state: LaneBoardState<C>,
  config: LaneBoardConfig<C>,
): Readonly<Record<Side, number>> {
  const totals: Record<Side, number> = {};
  for (const side of config.sides) totals[side] = 0;
  for (let lane = 0; lane < state.lanes.length; lane++) {
    for (const side of config.sides) {
      totals[side] += laneAggregate(state, config, lane, side).total;
    }
  }
  return totals;
}

export function lanesWon<C>(
  state: LaneBoardState<C>,
  config: LaneBoardConfig<C>,
): Readonly<Record<Side, number>> {
  const won: Record<Side, number> = {};
  for (const side of config.sides) won[side] = 0;
  for (let lane = 0; lane < state.lanes.length; lane++) {
    const outcome = laneOutcome(state, config, lane);
    if (outcome.winner !== null) won[outcome.winner] += 1;
  }
  return won;
}

export interface LaneBoard<C> {
  state(): LaneBoardState<C>;
  place(lane: number, side: Side, card: C): LaneResult<C>;
  remove(lane: number, side: Side, predicate: (card: C, index: number) => boolean): LaneResult<C>;
  aggregate(lane: number, side: Side): LaneAggregate;
  outcome(lane: number): LaneOutcome;
  totals(): Readonly<Record<Side, number>>;
  lanesWon(): Readonly<Record<Side, number>>;
  reset(next?: LaneBoardState<C>): void;
}

export function createLaneBoard<C>(config: LaneBoardConfig<C>): LaneBoard<C> {
  let state = createLaneBoardState(config);
  return {
    state: () => state,
    place(lane, side, card) {
      const result = placeCard(state, config, lane, side, card);
      if (result.status === "ok") state = result.state;
      return result;
    },
    remove(lane, side, predicate) {
      const result = removeCard(state, lane, side, predicate);
      if (result.status === "ok") state = result.state;
      return result;
    },
    aggregate: (lane, side) => laneAggregate(state, config, lane, side),
    outcome: (lane) => laneOutcome(state, config, lane),
    totals: () => boardTotals(state, config),
    lanesWon: () => lanesWon(state, config),
    reset(next) {
      state = next ?? createLaneBoardState(config);
    },
  };
}
