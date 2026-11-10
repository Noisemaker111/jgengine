import { expect, test } from "bun:test";
import { atomicColumns, groupInlineFlow, type WireBox } from "./cssMirror.view";

test("unbreakable columns retain their blocks and draw centered separating rules", () => {
  const box: WireBox = { k: "x", id: 1, d: 1 };
  const children: WireBox[] = [{ k: "x", id: 2 }, { k: "x", id: 3 }];
  expect(atomicColumns(box, children, 2, 22, 1, 0x221a1259)).toBe(true);
  expect(box["d"]).toBe(2);
  expect(box["gtc"]).toEqual([[1, 0, 3, 1], [1, 0, 3, 1]]);
  expect(box["gap"]).toEqual([22, 0]);
  expect(children[2]).toMatchObject({ pos: 2, ins: ["50%", 0, "auto", 0], w: 1, mg: [-0.5, 0, 0, 0] });
});

test("columns requiring balancing across multiple blocks stay explicitly unsupported", () => {
  const box: WireBox = { k: "x", id: 1, d: 1 };
  const children: WireBox[] = [{ k: "x", id: 2 }, { k: "x", id: 3 }, { k: "x", id: 4 }];
  expect(atomicColumns(box, children, 2, 22, 1, 0x221a1259)).toBe(false);
  expect(box["d"]).toBe(1);
  expect(children).toHaveLength(3);
});

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
