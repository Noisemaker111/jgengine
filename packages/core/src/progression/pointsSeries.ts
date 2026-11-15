/**
 * A points series: a championship, cup or season of rounds where every competitor scores by where
 * they finished. The config names the rounds in order, the competitors and the points each place
 * pays; the state is a plain record of each round's finishing places, so it saves as JSON and a
 * round can be replayed by recording it again. Standings rank by points, then wins, then the
 * best-place count down the order (countback), then the competitor list's order.
 */

/** The series as authored: its rounds in order, who competes, and what each place pays. */
export interface PointsSeriesConfig {
  /** Round ids, in the order they are run. */
  rounds: readonly string[];
  /** Every competitor id; the order breaks a dead heat that countback cannot. */
  competitors: readonly string[];
  /** Points for 1st, 2nd, 3rd...; places past the end of the table score 0. */
  points: readonly number[];
}

/** Each run round's finishing places: round id to competitor id to place (1 is first; 0 did not finish). */
export interface PointsSeriesState {
  results: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

/** One row of the standings. */
export interface PointsSeriesStanding {
  id: string;
  /** 1-based rank in the standings. */
  rank: number;
  points: number;
  wins: number;
  /** How many rounds this competitor has a result in (a did-not-finish counts). */
  rounds: number;
  /** The best place finished, or null before any finish. */
  best: number | null;
}

/** @capability points-series rank competitors across the rounds of a championship, cup or season by points for finishing places */
export interface PointsSeries {
  readonly config: PointsSeriesConfig;
  /** A series with no rounds run. */
  start(): PointsSeriesState;
  /** Points a finishing place pays (0 for a did-not-finish or a place past the table). */
  pointsFor(place: number): number;
  /** Records (or re-records) a round's places; an unknown round or competitor throws. */
  record(state: PointsSeriesState, round: string, places: Readonly<Record<string, number>>): PointsSeriesState;
  /** Everyone ranked, leader first. */
  standings(state: PointsSeriesState): readonly PointsSeriesStanding[];
  /** The first round with no result, or null once every round is run. */
  nextRound(state: PointsSeriesState): string | null;
  /** 1-based number of the next round, or the round count once complete. */
  roundNumber(state: PointsSeriesState): number;
  complete(state: PointsSeriesState): boolean;
  /** The leader once the series is complete; null before. */
  champion(state: PointsSeriesState): string | null;
}

/** Builds a {@link PointsSeries}; throws on an empty or duplicated round or competitor list. */
export function createPointsSeries(config: PointsSeriesConfig): PointsSeries {
  if (config.rounds.length === 0) throw new Error("points series: no rounds");
  if (config.competitors.length === 0) throw new Error("points series: no competitors");
  if (new Set(config.rounds).size !== config.rounds.length) throw new Error("points series: a round is listed twice");
  if (new Set(config.competitors).size !== config.competitors.length) throw new Error("points series: a competitor is listed twice");
  const rounds = new Set(config.rounds);
  const competitors = new Set(config.competitors);
  const order = new Map(config.competitors.map((id, index) => [id, index]));
  const pointsFor = (place: number) => (Number.isInteger(place) && place >= 1 ? config.points[place - 1] ?? 0 : 0);

  const standings = (state: PointsSeriesState): readonly PointsSeriesStanding[] => {
    const rows = config.competitors.map((id) => {
      const places: number[] = [];
      let points = 0;
      let entered = 0;
      for (const round of config.rounds) {
        const place = state.results[round]?.[id];
        if (place === undefined) continue;
        entered += 1;
        points += pointsFor(place);
        if (place >= 1) places.push(place);
      }
      places.sort((a, b) => a - b);
      return { id, points, wins: places.filter((place) => place === 1).length, rounds: entered, best: places[0] ?? null, places };
    });
    rows.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      // Countback: more seconds, then more thirds, and so on.
      for (let place = 2; place <= config.competitors.length; place += 1) {
        const diff = b.places.filter((p) => p === place).length - a.places.filter((p) => p === place).length;
        if (diff !== 0) return diff;
      }
      return order.get(a.id)! - order.get(b.id)!;
    });
    return rows.map(({ places: _places, ...row }, index) => ({ ...row, rank: index + 1 }));
  };

  const nextRound = (state: PointsSeriesState) => config.rounds.find((round) => state.results[round] === undefined) ?? null;

  return {
    config,
    start: () => ({ results: {} }),
    pointsFor,
    record(state, round, places) {
      if (!rounds.has(round)) throw new Error(`points series: unknown round "${round}"`);
      for (const id of Object.keys(places)) if (!competitors.has(id)) throw new Error(`points series: unknown competitor "${id}"`);
      return { results: { ...state.results, [round]: { ...places } } };
    },
    standings,
    nextRound,
    roundNumber(state) {
      const next = nextRound(state);
      return next === null ? config.rounds.length : config.rounds.indexOf(next) + 1;
    },
    complete: (state) => nextRound(state) === null,
    champion: (state) => (nextRound(state) === null ? standings(state)[0]!.id : null),
  };
}
