import { describe, expect, it } from "bun:test";
import { createRunDraft, createRunModifierStack, type RunModifierOffer } from "./runDraft";
import { createStats } from "../stats/statModifiers";

type Stat = "damage" | "moveSpeed" | "maxHealth";

const offers: RunModifierOffer<Stat>[] = [
  { id: "sharp_claws", weight: 10, maxStacks: 3, stats: { damage: { add: 5 } } },
  { id: "swift", weight: 8, maxStacks: 2, stats: { moveSpeed: { multiply: 1.1 } } },
  { id: "vitality", weight: 6, stats: { maxHealth: { add: 20 } } },
  { id: "berserk", weight: 2, stats: { damage: { multiply: 1.5 } } },
];

describe("createRunModifierStack", () => {
  it("stacks additive modifiers per pick", () => {
    const stack = createRunModifierStack(offers);
    stack.add("sharp_claws");
    stack.add("sharp_claws");
    expect(stack.count("sharp_claws")).toBe(2);
    expect(stack.total("damage").add).toBe(10);
  });

  it("compounds multiplicative modifiers exponentially by stack count", () => {
    const stack = createRunModifierStack(offers);
    stack.add("swift");
    stack.add("swift");
    expect(stack.total("moveSpeed").multiply).toBeCloseTo(1.21, 5);
  });

  it("enforces maxStacks", () => {
    const stack = createRunModifierStack(offers);
    expect(stack.add("swift")).toBe(true);
    expect(stack.add("swift")).toBe(true);
    expect(stack.atMax("swift")).toBe(true);
    expect(stack.add("swift")).toBe(false);
    expect(stack.count("swift")).toBe(2);
  });

  it("applies aggregated modifiers onto a Stats source", () => {
    const stack = createRunModifierStack(offers);
    stack.add("sharp_claws");
    stack.add("berserk");
    const stats = createStats<Stat>({ damage: 10, moveSpeed: 1, maxHealth: 100 });
    stack.apply(stats);
    expect(stats.get("damage")).toBeCloseTo((10 + 5) * 1.5, 5);
  });
});

describe("createRunDraft", () => {
  it("presents N distinct weighted picks (Vampire Survivors level-up)", () => {
    const draft = createRunDraft({ offers, rng: () => 0 });
    const presented = draft.present(3);
    expect(presented.length).toBe(3);
    const ids = new Set(presented.map((offer) => offer.id));
    expect(ids.size).toBe(3);
  });

  it("chosen picks stack for the run (Hades boons)", () => {
    const draft = createRunDraft({ offers });
    expect(draft.choose("sharp_claws")).toBe(true);
    expect(draft.choose("sharp_claws")).toBe(true);
    expect(draft.stack().total("damage").add).toBe(10);
  });

  it("stops offering an option once maxed out", () => {
    const seq = [0.99, 0.99, 0.99, 0.99];
    let i = 0;
    const draft = createRunDraft({ offers, rng: () => seq[i++ % seq.length]! });
    draft.choose("vitality");
    const presented = draft.present(4);
    expect(presented.some((offer) => offer.id === "vitality")).toBe(true);
    expect(presented.length).toBeLessThanOrEqual(offers.length);
  });

  it("caps presentation to the available pool size", () => {
    const draft = createRunDraft({ offers, rng: () => 0.5 });
    expect(draft.present(99).length).toBe(offers.length);
  });
});
