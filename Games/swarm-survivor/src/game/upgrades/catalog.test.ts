import { describe, expect, test } from "bun:test";

import { seededRng } from "@jgengine/core/item/affix";

import { UPGRADE_OFFERS, createUpgradeDraft } from "./catalog";

describe("swarm-survivor upgrade draft", () => {
  test("presents three distinct offers", () => {
    const draft = createUpgradeDraft(seededRng("swarm-test"));
    const offers = draft.present(3);
    expect(offers.length).toBe(3);
    const ids = new Set(offers.map((offer) => offer.id));
    expect(ids.size).toBe(3);
  });

  test("choosing an offer stacks it and future presents respect maxStacks", () => {
    const draft = createUpgradeDraft(seededRng("swarm-test-2"));
    const target = UPGRADE_OFFERS.find((offer) => offer.id === "magnetic_core")!;
    for (let i = 0; i < target.maxStacks!; i += 1) {
      expect(draft.choose("magnetic_core")).toBe(true);
    }
    expect(draft.stack().atMax("magnetic_core")).toBe(true);
    const offers = draft.present(UPGRADE_OFFERS.length);
    expect(offers.some((offer) => offer.id === "magnetic_core")).toBe(false);
  });

  test("adrenal surge compounds its damage multiplier per stack", () => {
    const draft = createUpgradeDraft(seededRng("swarm-test-3"));
    draft.choose("adrenal_surge");
    draft.choose("adrenal_surge");
    const total = draft.stack().total("damageMultiplier");
    expect(total.multiply).toBeCloseTo(1.12 * 1.12, 5);
  });
});
