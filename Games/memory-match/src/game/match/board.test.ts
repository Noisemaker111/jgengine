import { describe, expect, test } from "bun:test";

import { dealBoard } from "./board";
import { BOARD_SIZES, GLYPH_POOL } from "./catalog";

describe("glyph pool", () => {
  test("holds at least 18 distinct glyphs so a 6x6 deal never repeats a face", () => {
    expect(new Set(GLYPH_POOL).size).toBe(GLYPH_POOL.length);
    expect(GLYPH_POOL.length).toBeGreaterThanOrEqual(18);
  });
});

describe("dealBoard", () => {
  test("4x4 deals 16 cards across 8 pairs", () => {
    const board = dealBoard("alpha", BOARD_SIZES["4x4"]);
    expect(board.cards.length).toBe(16);
    expect(board.pairCount).toBe(8);
    expect(board.rows).toBe(4);
    expect(board.cols).toBe(4);
  });

  test("6x6 deals 36 cards across 18 pairs", () => {
    const board = dealBoard("alpha", BOARD_SIZES["6x6"]);
    expect(board.cards.length).toBe(36);
    expect(board.pairCount).toBe(18);
  });

  test("every pairId appears exactly twice with one consistent glyph", () => {
    for (const size of [BOARD_SIZES["4x4"], BOARD_SIZES["6x6"]]) {
      const board = dealBoard("pair-integrity", size);
      const byPair = new Map<number, string[]>();
      for (const card of board.cards) {
        const bucket = byPair.get(card.pairId) ?? [];
        bucket.push(card.glyph);
        byPair.set(card.pairId, bucket);
      }
      expect(byPair.size).toBe(size.pairCount);
      for (const glyphs of byPair.values()) {
        expect(glyphs.length).toBe(2);
        expect(glyphs[0]).toBe(glyphs[1] as string);
      }
    }
  });

  test("distinct pairIds carry distinct glyphs drawn from the pool", () => {
    const board = dealBoard("distinct", BOARD_SIZES["6x6"]);
    const glyphByPair = new Map<number, string>();
    for (const card of board.cards) glyphByPair.set(card.pairId, card.glyph);
    const glyphs = [...glyphByPair.values()];
    expect(new Set(glyphs).size).toBe(glyphs.length);
    for (const glyph of glyphs) expect(GLYPH_POOL).toContain(glyph);
  });

  test("the same seed and size always deal the identical board", () => {
    const first = dealBoard("determinism", BOARD_SIZES["6x6"]);
    const second = dealBoard("determinism", BOARD_SIZES["6x6"]);
    expect(second.cards).toEqual(first.cards);
  });

  test("different seeds deal different card orders", () => {
    const first = dealBoard("seed-one", BOARD_SIZES["4x4"]);
    const second = dealBoard("seed-two", BOARD_SIZES["4x4"]);
    expect(second.cards.map((card) => card.glyph).join(",")).not.toBe(
      first.cards.map((card) => card.glyph).join(","),
    );
  });

  test("board sizes shuffle independently under one seed", () => {
    const small = dealBoard("shared-seed", BOARD_SIZES["4x4"]);
    const large = dealBoard("shared-seed", BOARD_SIZES["6x6"]);
    expect(small.cards.length).toBe(16);
    expect(large.cards.length).toBe(36);
  });
});
