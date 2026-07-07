import { describe, expect, test } from "bun:test";

import {
  boardTotals,
  createLaneBoard,
  createLaneBoardState,
  laneAggregate,
  laneOutcome,
  lanesWon,
  placeCard,
  type LaneBoardConfig,
} from "@jgengine/core/board/laneBoard";

interface UnitCard {
  name: string;
  power: number;
}

const config: LaneBoardConfig<UnitCard> = {
  laneCount: 3,
  sides: ["player", "opponent"],
  power: (c) => c.power,
  laneRules: [
    null,
    { id: "double", apply: ({ subtotal }) => subtotal * 2 },
    null,
  ],
};

function seed() {
  let state = createLaneBoardState(config);
  const put = (lane: number, side: string, name: string, power: number) => {
    const r = placeCard(state, config, lane, side, { name, power });
    if (r.status === "ok") state = r.state;
    return r;
  };
  put(0, "player", "a", 3);
  put(0, "opponent", "b", 5);
  put(1, "player", "c", 4);
  put(2, "player", "d", 2);
  put(2, "opponent", "e", 2);
  return state;
}

describe("laneBoard aggregates", () => {
  test("per-side subtotal sums card power", () => {
    const state = seed();
    expect(laneAggregate(state, config, 0, "player").subtotal).toBe(3);
    expect(laneAggregate(state, config, 0, "opponent").subtotal).toBe(5);
  });

  test("per-lane rule modifies the total but not the subtotal", () => {
    const state = seed();
    const agg = laneAggregate(state, config, 1, "player");
    expect(agg.subtotal).toBe(4);
    expect(agg.total).toBe(8);
  });

  test("laneOutcome picks the higher-total side and ties give no winner", () => {
    const state = seed();
    expect(laneOutcome(state, config, 0).winner).toBe("opponent");
    expect(laneOutcome(state, config, 1).winner).toBe("player");
    expect(laneOutcome(state, config, 2).winner).toBeNull();
  });

  test("boardTotals sum lane totals per side", () => {
    const state = seed();
    const totals = boardTotals(state, config);
    expect(totals.player).toBe(3 + 8 + 2);
    expect(totals.opponent).toBe(5 + 0 + 2);
  });

  test("lanesWon counts decided lanes", () => {
    const state = seed();
    const won = lanesWon(state, config);
    expect(won.player).toBe(1);
    expect(won.opponent).toBe(1);
  });
});

describe("createLaneBoard controller", () => {
  test("place is rejected for invalid lane or side", () => {
    const board = createLaneBoard(config);
    expect(board.place(9, "player", { name: "x", power: 1 }).status).toBe("rejected");
    expect(board.place(0, "ghost", { name: "x", power: 1 }).status).toBe("rejected");
    expect(board.place(0, "player", { name: "x", power: 1 }).status).toBe("ok");
    expect(board.aggregate(0, "player").total).toBe(1);
  });

  test("remove filters matching cards from a lane cell", () => {
    const board = createLaneBoard(config);
    board.place(0, "player", { name: "keep", power: 2 });
    board.place(0, "player", { name: "drop", power: 9 });
    board.remove(0, "player", (c) => c.name === "drop");
    expect(board.aggregate(0, "player").total).toBe(2);
  });
});
