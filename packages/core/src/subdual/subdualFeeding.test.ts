import { expect, test } from "bun:test";

import {
  createSubdualFeeding,
  type FeedingSupply,
  type SubdualFeedingConfig,
  type SubdualFeedingEvent,
} from "./subdualFeeding";

// A stag: 100 subdual at level 1 and 190 at 10, grain before apples.
const STAG: SubdualFeedingConfig = {
  capacity: { kind: "piecewise", points: [[1, 100], [10, 190]] },
  drain: { kind: "const", value: 0.5 },
  hitCost: 2,
  starveLoss: 0.001,
  foods: {
    grain: { meals: { kind: "piecewise", points: [[1, 4], [10, 13]] }, seconds: { kind: "piecewise", points: [[1, 40], [10, 130]] }, cost: 0.02 },
    apple: { meals: { kind: "const", value: 8 }, seconds: { kind: "const", value: 80 }, cost: 0.05 },
  },
};

type Won = Extract<SubdualFeedingEvent, { type: "won" }>;

function pantry(stock: Record<string, number>): FeedingSupply {
  return {
    count: (itemId) => stock[itemId] ?? 0,
    take(itemId) {
      const held = stock[itemId] ?? 0;
      if (held <= 0) return false;
      stock[itemId] = held - 1;
      return true;
    },
  };
}

/** A down creature at `level`, fed from `stock` a second at a time until it is won or `seconds` pass. */
function win(config: SubdualFeedingConfig, level: number, stock: Record<string, number>, seconds: number, pace = 1, hurt = 0) {
  const taming = createSubdualFeeding({ stag: config });
  taming.track("s1", "stag", level);
  taming.subdue("s1", 10000);
  if (hurt > 0) taming.hurt("s1", hurt);
  const supply = pantry(stock);
  const events: SubdualFeedingEvent[] = [];
  let elapsed = 0;
  while (elapsed < seconds) {
    for (const { event } of taming.tick(1, () => supply, pace)) events.push(event);
    elapsed += 1;
    if (events.some((event) => event.type === "won")) break;
  }
  const won = events.find((event): event is Won => event.type === "won") ?? null;
  return { events, won, elapsed, stock };
}

test("capacity and meal tables follow the caller's levels", () => {
  const taming = createSubdualFeeding({ stag: STAG });
  taming.track("s1", "stag", 1);
  taming.track("s10", "stag", 10);
  expect(taming.capacity("s1")).toBe(100);
  expect(taming.capacity("s10")).toBe(190);
  // Four meals at level 1, ten seconds apart.
  const { won, elapsed } = win(STAG, 1, { grain: 10 }, 120);
  expect(won).not.toBeNull();
  expect(elapsed).toBeGreaterThan(25);
  expect(elapsed).toBeLessThan(45);
});

test("a hit fills the subdual meter up to capacity, and a full one puts it down", () => {
  const taming = createSubdualFeeding({ stag: STAG });
  taming.track("s1", "stag", 1);
  expect(taming.subdue("s1", 99)).toBe(false);
  expect(taming.state("s1")?.subdual.pool.current).toBe(99);
  expect(taming.subdue("s1", 500)).toBe(true);
  const state = taming.state("s1");
  expect(state?.subdual.pool.current).toBe(100);
  expect(state?.subdued).toBe(true);
  expect(taming.subdue("s1", 500)).toBe(false);
});

test("it eats the first food it holds, and a faster pace brings meals sooner without eating more", () => {
  const slow = win(STAG, 1, { grain: 10, apple: 10 }, 120);
  expect(slow.events.filter((event) => event.type === "ate").map((event) => (event.type === "ate" ? event.itemId : ""))).toEqual(["grain", "grain", "grain", "grain"]);
  expect(slow.stock).toMatchObject({ grain: 6, apple: 10 });
  const fast = win(STAG, 1, { grain: 10, apple: 10 }, 120, 10);
  expect(fast.won).not.toBeNull();
  expect(fast.elapsed).toBeLessThan(10);
  expect(fast.stock).toMatchObject({ grain: 6, apple: 10 });
});

test("with nothing it will eat the win slips back", () => {
  const taming = createSubdualFeeding({ stag: STAG });
  taming.track("s1", "stag", 1);
  taming.subdue("s1", 1000);
  const stock = { apple: 5 };
  for (const { event } of taming.tick(1, () => pantry(stock))) expect(event.type).toBe("ate");
  expect(stock.apple).toBe(4);
  const fed = taming.state("s1")?.progress.pool.current ?? 0;
  expect(fed).toBeCloseTo(1 / 8);
  // Held down all the while, so the loss is the missing food and not the waking.
  taming.dose("s1", { amount: 1000, seconds: 1000 });
  for (let t = 0; t < 400; t += 1) taming.tick(1, () => null);
  expect(taming.state("s1")?.subdued).toBe(true);
  expect(taming.state("s1")?.progress.pool.current ?? 1).toBeLessThan(fed);
});

test("when the subdual meter empties it gets away, losing the win; a dose holds it down until it runs out", () => {
  const taming = createSubdualFeeding({ stag: STAG });
  taming.track("s1", "stag", 1);
  taming.subdue("s1", 500);
  taming.dose("s1", { amount: 50, seconds: 10 });
  const events: SubdualFeedingEvent[] = [];
  for (let t = 0; t < 400; t += 1) for (const { event } of taming.tick(1, () => null)) events.push(event);
  expect(events.some((event) => event.type === "released")).toBe(true);
  expect(taming.state("s1")?.subdued).toBe(false);
  expect(taming.state("s1")?.progress.pool.current).toBe(0);
  expect(taming.state("s1")?.doses).toEqual([]);
});

test("damage and meals both cost quality", () => {
  const clean = win(STAG, 1, { grain: 10 }, 120);
  expect(clean.won?.quality).toBeCloseTo(1 / (1 + 4 * 0.02));
  // Half its health taken while down weighs the same as one meal's `hitCost` of two, and four meals follow.
  const rough = win(STAG, 1, { grain: 10 }, 120, 1, 0.5);
  expect(rough.won?.quality).toBeCloseTo(1 / (1 + 1 + 4 * 0.02));
});

test("state round-trips through JSON", () => {
  const taming = createSubdualFeeding({ stag: STAG });
  taming.track("s1", "stag", 7);
  taming.subdue("s1", 10000);
  taming.dose("s1", { amount: 20, seconds: 4 });
  const saved = JSON.parse(JSON.stringify(taming.snapshot()));
  taming.reset();
  expect(taming.state("s1")).toBeNull();
  taming.restore(saved);
  const state = taming.state("s1");
  expect(state).toMatchObject({ level: 7, subdued: true });
  expect(state?.subdual.pool.current).toBeCloseTo(160);
  expect(state?.doses.length).toBe(1);
});
