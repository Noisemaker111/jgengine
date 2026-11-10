import { expect, test } from "bun:test";
import { groupInlineFlow, type WireBox } from "./cssMirror.view";

test("a block-level subtitle interrupts inline content even at an intrinsic width", () => {
  const title: WireBox = { k: "x", id: 1, inl: 1 };
  const subtitle: WireBox = { k: "x", id: 2, d: 1 };
  const after: WireBox = { k: "x", id: 3, inl: 1 };
  const boxes = groupInlineFlow([title, subtitle, after], 3);
  expect(boxes).toHaveLength(3);
  expect(boxes[0]?.c).toEqual([title]);
  expect(boxes[1]).toBe(subtitle);
  expect(boxes[2]?.c).toEqual([after]);
  expect(boxes[0]?.["jc"]).toBe(3);
  expect(subtitle["fb"]).toBeUndefined();
});

test("an out-of-flow decoration does not split an inline run", () => {
  const label: WireBox = { k: "x", id: 1, inl: 1 };
  const decoration: WireBox = { k: "x", id: 2, pos: 2 };
  const link: WireBox = { k: "x", id: 3, inl: 1 };
  const boxes = groupInlineFlow([label, decoration, link], 0);
  expect(boxes).toContain(decoration);
  expect(boxes.find((box) => box.id === 0)?.c).toEqual([label, link]);
});
