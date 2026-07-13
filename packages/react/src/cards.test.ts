import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CardFace, StackedPile, isRedSuit, SUITS, RANKS, type PlayingCard } from "./cards";

describe("card catalog", () => {
  test("52 unique rank/suit combinations", () => {
    expect(SUITS.length).toBe(4);
    expect(RANKS.length).toBe(13);
    expect(isRedSuit("hearts")).toBe(true);
    expect(isRedSuit("diamonds")).toBe(true);
    expect(isRedSuit("clubs")).toBe(false);
    expect(isRedSuit("spades")).toBe(false);
  });
});

describe("CardFace", () => {
  test("renders rank and suit", () => {
    const html = renderToStaticMarkup(createElement(CardFace, { rank: "Q", suit: "hearts" }));
    expect(html).toContain('data-rank="Q"');
    expect(html).toContain('data-suit="hearts"');
    expect(html).toContain('data-suit-glyph="hearts"');
    expect(html).toContain("Q of hearts");
    expect(html).not.toContain("data-face-down");
  });

  test("faceDown renders a back, no rank/suit", () => {
    const html = renderToStaticMarkup(createElement(CardFace, { rank: "A", suit: "spades", faceDown: true }));
    expect(html).toContain("data-face-down");
    expect(html).toContain("Face-down card");
    expect(html).not.toContain('data-rank="A"');
  });
});

describe("StackedPile", () => {
  test("renders one node per card with ascending z-index", () => {
    const cards: PlayingCard[] = [
      { id: "c1", rank: "A", suit: "clubs" },
      { id: "c2", rank: "10", suit: "diamonds" },
      { id: "c3", rank: "K", suit: "spades", faceDown: true },
    ];
    const html = renderToStaticMarkup(createElement(StackedPile, { cards }));
    expect(html).toContain('data-count="3"');
    expect(html).toContain('data-card-slot="0"');
    expect(html).toContain('data-card-slot="2"');
    expect(html).toContain('data-rank="A"');
    expect(html).toContain("Face-down card");
  });

  test("empty pile renders an empty stack", () => {
    const html = renderToStaticMarkup(createElement(StackedPile, { cards: [] }));
    expect(html).toContain('data-count="0"');
    expect(html).not.toContain("data-card-slot");
  });
});
