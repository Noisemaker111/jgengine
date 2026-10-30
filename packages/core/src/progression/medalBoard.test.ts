import { describe, expect, test } from "bun:test";

import { createMedalBoard, type MedalBoardConfig } from "@jgengine/core/progression/medalBoard";

const MEDALS = [
  { id: "bronze", points: 1 },
  { id: "silver", points: 2 },
  { id: "gold", points: 3 },
];

const BOARD: MedalBoardConfig = {
  medals: MEDALS,
  tiers: [
    { id: "rookie", requires: 0 },
    { id: "night", requires: 4 },
  ],
  events: [
    { id: "sprint", tier: "rookie", direction: "lower", targets: { bronze: 50, silver: 42, gold: 36 } },
    { id: "sweep", tier: "rookie", direction: "higher", targets: { bronze: 6, silver: 9, gold: 12 } },
    { id: "night-run", tier: "night", direction: "lower", targets: { bronze: 55, gold: 40 } },
  ],
};

describe("medal board", () => {
  test("a lap time earns the medals its targets allow, lower is better", () => {
    const board = createMedalBoard(BOARD);
    expect(board.grade("sprint", 51)).toBeNull();
    expect(board.grade("sprint", 50)).toBe("bronze");
    expect(board.grade("sprint", 40)).toBe("silver");
    expect(board.grade("sprint", 35.9)).toBe("gold");
    expect(board.grade("sweep", 9)).toBe("silver");
  });

  test("submit keeps the best result and names medals earned for the first time", () => {
    const board = createMedalBoard(BOARD);
    const first = board.submit("sprint", 45);
    expect(first).toMatchObject({ medal: "bronze", previous: null, newBest: true, newlyEarned: ["bronze"] });

    const jump = board.submit("sprint", 35);
    expect(jump.newlyEarned).toEqual(["silver", "gold"]);
    expect(board.medalOf("sprint")).toBe("gold");

    const slower = board.submit("sprint", 48);
    expect(slower).toMatchObject({ medal: "bronze", previous: "gold", newBest: false, newlyEarned: [] });
    expect(board.best("sprint")).toBe(35);
  });

  test("a result exactly on a target earns it, just past it stays at the medal below", () => {
    const board = createMedalBoard(BOARD);
    expect(board.grade("sprint", 36)).toBe("gold");
    expect(board.grade("sprint", 36.01)).toBe("silver");
    expect(board.grade("sprint", 42)).toBe("silver");
    expect(board.grade("sprint", 50)).toBe("bronze");
    expect(board.grade("sprint", 50.01)).toBeNull();
    expect(board.grade("sweep", 12)).toBe("gold");
    expect(board.grade("sweep", 11.99)).toBe("silver");
    expect(board.grade("sweep", 5.99)).toBeNull();
  });

  test("two medals with the same target give the better medal", () => {
    const board = createMedalBoard({
      medals: MEDALS,
      events: [{ id: "tied", direction: "higher", targets: { bronze: 5, silver: 5, gold: 9 } }],
    });
    expect(board.grade("tied", 5)).toBe("silver");
    expect(board.grade("tied", 9)).toBe("gold");
  });

  test("a tier opens on medal points and reports the result that opened it", () => {
    const board = createMedalBoard(BOARD);
    expect(board.isOpen("night-run")).toBe(false);
    expect(() => board.submit("night-run", 30)).toThrow(RangeError);

    board.submit("sprint", 40);
    expect(board.points()).toBe(2);
    expect(board.tiers().find((entry) => entry.tier.id === "night")).toMatchObject({ open: false, missing: 2 });

    const opened = board.submit("sweep", 10);
    expect(opened.openedTiers).toEqual(["night"]);
    expect(board.isOpen("night-run")).toBe(true);
    expect(board.count("silver")).toBe(2);
    expect(board.count("gold")).toBe(0);
  });

  test("next names the medal still on offer, skipping medals an event leaves out", () => {
    const board = createMedalBoard(BOARD);
    board.submit("sprint", 40);
    board.submit("sweep", 12);
    expect(board.next("sprint")).toEqual({ medal: "gold", value: 36 });
    expect(board.next("sweep")).toBeNull();
    board.submit("night-run", 50);
    expect(board.next("night-run")).toEqual({ medal: "gold", value: 40 });
  });

  test("snapshot and restore round-trip through JSON, dropping unknown events", () => {
    const board = createMedalBoard(BOARD);
    board.submit("sprint", 41);
    const saved = JSON.parse(JSON.stringify(board.snapshot()));
    const again = createMedalBoard({ ...BOARD, state: { best: { ...saved.best, gone: 3 } } });
    expect(again.best("sprint")).toBe(41);
    expect(again.snapshot()).toEqual({ best: { sprint: 41 } });
    again.restore({ best: {} });
    expect(again.points()).toBe(0);
  });

  test("an authored board refuses targets that get easier as the medal improves", () => {
    expect(() => createMedalBoard({ medals: MEDALS, events: [{ id: "bad", direction: "lower", targets: { bronze: 40, gold: 50 } }] })).toThrow(/gold must be at least as hard/);
    expect(() => createMedalBoard({ medals: MEDALS, events: [{ id: "x", tier: "nope", direction: "higher", targets: {} }] })).toThrow(/unknown tier/);
    expect(() => createMedalBoard({ medals: MEDALS, events: [{ id: "x", direction: "higher", targets: { platinum: 1 } }] })).toThrow(/unknown medal/);
  });
});
