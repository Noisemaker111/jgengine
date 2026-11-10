import { expect, test } from "bun:test";
import { compactPatches } from "./patches";

interface Box { id: number; c?: Box[] }

test("a later ancestor replacement supersedes patches for its removed and retained descendants", () => {
  const removed = { id: 3 };
  const retained = { id: 4 };
  const oldParent = { id: 2, c: [removed, retained] };
  const replacement = { id: 2, c: [retained] };
  const sibling = { id: 5 };
  const root = { id: 1, c: [replacement, sibling] };
  const owners = new Map<Box, Box>([[removed, oldParent], [retained, replacement], [oldParent, root], [replacement, root], [sibling, root]]);
  expect(compactPatches([removed, retained, replacement, sibling, sibling], new Set<Box>([root]), (box) => owners.get(box))).toEqual([replacement, sibling]);
});

test("a child under an anonymous flow wrapper remains an independent patch", () => {
  const child = { id: 3 };
  const line = { id: 0, c: [child] };
  const root = { id: 1, c: [line] };
  const owners = new Map<Box, Box>([[child, line], [line, root]]);
  expect(compactPatches([child], new Set<Box>([root]), (box) => owners.get(box))).toEqual([child]);
});
