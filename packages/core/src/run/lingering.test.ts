import { expect, test } from "bun:test";

import { Lingering } from "./lingering";

test("a value taken back inside the grace period is never freed; one left alone is freed after it", async () => {
  const freed: string[] = [];
  const lingering = new Lingering<string, string>((value) => freed.push(value), 10);
  lingering.park("tree", "tree-atlas");
  lingering.park("rock", "rock-atlas");
  expect(lingering.take("tree")).toBe("tree-atlas");
  expect(lingering.take("tree")).toBeUndefined();
  await Bun.sleep(30);
  expect(freed).toEqual(["rock-atlas"]);
  expect(lingering.size).toBe(0);
});

test("parking over a waiting value frees the old one, and a flush frees everything at once", () => {
  const freed: string[] = [];
  const lingering = new Lingering<string, string>((value) => freed.push(value), 10_000);
  lingering.park("tree", "old");
  lingering.park("tree", "new");
  expect(freed).toEqual(["old"]);
  lingering.park("rock", "rock-atlas");
  lingering.flush();
  expect(freed).toEqual(["old", "new", "rock-atlas"]);
  expect(lingering.size).toBe(0);
});
