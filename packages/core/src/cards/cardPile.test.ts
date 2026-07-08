import { describe, expect, test } from "bun:test";

import {
  createCardPile,
  createCardPileState,
  draw,
  moveCards,
  pileRng,
  shuffleWithRng,
  shuffleZone,
  zoneOf,
} from "@jgengine/core/cards/cardPile";

const deckIds = Array.from({ length: 10 }, (_, i) => `c${i}`);

function fresh() {
  return createCardPileState(
    { zones: ["deck", "hand", "discard", "exhaust"] },
    { deck: deckIds },
  );
}

describe("shuffle determinism", () => {
  test("same seed produces same order", () => {
    const a = shuffleZone(fresh(), "deck", "seed-1");
    const b = shuffleZone(fresh(), "deck", "seed-1");
    expect(a.zones.deck).toEqual(b.zones.deck);
  });

  test("different seeds diverge", () => {
    const a = shuffleZone(fresh(), "deck", "seed-1");
    const b = shuffleZone(fresh(), "deck", "seed-2");
    expect(a.zones.deck).not.toEqual(b.zones.deck);
  });

  test("shuffle preserves the multiset", () => {
    const shuffled = shuffleZone(fresh(), "deck", 42);
    expect([...shuffled.zones.deck].sort()).toEqual([...deckIds].sort());
  });

  test("numeric and string seeds both drive the same rng contract", () => {
    const r1 = pileRng(7);
    const r2 = pileRng(7);
    expect(r1()).toBe(r2());
    expect(shuffleWithRng(deckIds, pileRng(1))).toEqual(shuffleWithRng(deckIds, pileRng(1)));
  });
});

describe("draw / discard / exhaust transitions", () => {
  test("draw moves n from top of deck to hand", () => {
    const result = draw(fresh(), 3, { from: "deck", to: "hand" });
    expect(result.drawn).toEqual(["c0", "c1", "c2"]);
    expect(result.state.zones.hand).toEqual(["c0", "c1", "c2"]);
    expect(result.state.zones.deck).toHaveLength(7);
    expect(result.reshuffled).toBe(false);
  });

  test("draw respects hand limit", () => {
    const result = draw(fresh(), 8, { from: "deck", to: "hand", handLimit: 5 });
    expect(result.drawn).toHaveLength(5);
    expect(result.state.zones.hand).toHaveLength(5);
  });

  test("draw reshuffles discard into deck when deck runs dry", () => {
    const start = createCardPileState(
      { zones: ["deck", "hand", "discard"] },
      { deck: ["a"], discard: ["x", "y", "z"] },
    );
    const result = draw(start, 3, { from: "deck", to: "hand", reshuffleFrom: "discard", seed: 5 });
    expect(result.drawn).toHaveLength(3);
    expect(result.reshuffled).toBe(true);
    expect(result.state.zones.discard).toHaveLength(0);
    expect([...result.state.zones.hand].sort()).toEqual(["a", "x", "y"].sort());
  });

  test("draw stops when deck empty and no reshuffle source", () => {
    const start = createCardPileState({ zones: ["deck", "hand"] }, { deck: ["a", "b"] });
    const result = draw(start, 5, { from: "deck", to: "hand" });
    expect(result.drawn).toEqual(["a", "b"]);
  });

  test("discard moves named ids from hand to discard", () => {
    const drawn = draw(fresh(), 3, { from: "deck", to: "hand" }).state;
    const result = moveCards(drawn, ["c1"], "hand", "discard");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.state.zones.hand).toEqual(["c0", "c2"]);
    expect(result.state.zones.discard).toEqual(["c1"]);
    expect(zoneOf(result.state, "c1")).toBe("discard");
  });

  test("moving a card not in the source zone is rejected", () => {
    const result = moveCards(fresh(), ["c0"], "hand", "discard");
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.reason).toBe("card-not-in-zone");
  });
});

describe("createCardPile controller", () => {
  test("draw/discard/exhaust flow updates internal state", () => {
    const pile = createCardPile(
      {
        zones: ["deck", "hand", "discard", "exhaust"],
        drawFrom: "deck",
        handZone: "hand",
        discardTo: "discard",
        handLimit: 4,
      },
      { deck: deckIds },
    );
    pile.shuffle("deck", "run-1");
    const drawn = pile.draw(3);
    expect(drawn).toHaveLength(3);
    expect(pile.count("hand")).toBe(3);

    const discarded = pile.discard([drawn[0]]);
    expect(discarded.status).toBe("ok");
    expect(pile.count("discard")).toBe(1);
    expect(pile.count("hand")).toBe(2);

    const exhausted = pile.exhaust([drawn[1]], "exhaust");
    expect(exhausted.status).toBe("ok");
    expect(pile.count("exhaust")).toBe(1);
    expect(pile.zoneOf(drawn[1])).toBe("exhaust");
  });

  test("hand limit clamps draws in the controller", () => {
    const pile = createCardPile(
      { zones: ["deck", "hand"], drawFrom: "deck", handZone: "hand", handLimit: 2 },
      { deck: deckIds },
    );
    pile.draw(10);
    expect(pile.count("hand")).toBe(2);
  });
});

describe("createCardPile onChange", () => {
  function makePile(onChange: () => void) {
    return createCardPile(
      {
        zones: ["deck", "hand", "discard", "exhaust"],
        drawFrom: "deck",
        handZone: "hand",
        discardTo: "discard",
        onChange,
      },
      { deck: deckIds },
    );
  }

  test("fires on draw, discard, shuffle, and reset", () => {
    let fired = 0;
    const pile = makePile(() => {
      fired += 1;
    });
    pile.shuffle("deck", "seed");
    expect(fired).toBe(1);
    const drawn = pile.draw(2);
    expect(fired).toBe(2);
    const discarded = pile.discard([drawn[0]]);
    expect(discarded.status).toBe("ok");
    expect(fired).toBe(3);
    pile.reset(createCardPileState({ zones: ["deck", "hand", "discard", "exhaust"] }));
    expect(fired).toBe(4);
  });

  test("fires on exhaust and move", () => {
    let fired = 0;
    const pile = makePile(() => {
      fired += 1;
    });
    const drawn = pile.draw(2);
    fired = 0;
    const exhausted = pile.exhaust([drawn[0]], "exhaust");
    expect(exhausted.status).toBe("ok");
    expect(fired).toBe(1);
    const moved = pile.move([drawn[1]], "hand", "discard");
    expect(moved.status).toBe("ok");
    expect(fired).toBe(2);
  });

  test("does not fire on a rejected move", () => {
    let fired = 0;
    const pile = makePile(() => {
      fired += 1;
    });
    const rejected = pile.move(["not-in-hand"], "hand", "discard");
    expect(rejected.status).toBe("rejected");
    expect(fired).toBe(0);
  });

  test("does not fire on a rejected discard or exhaust", () => {
    let fired = 0;
    const pile = makePile(() => {
      fired += 1;
    });
    expect(pile.discard(["not-in-hand"]).status).toBe("rejected");
    expect(pile.exhaust(["not-in-hand"], "exhaust").status).toBe("rejected");
    expect(fired).toBe(0);
  });
});
