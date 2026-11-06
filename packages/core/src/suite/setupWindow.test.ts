import { describe, expect, test } from "bun:test";

import { openSetupWindow, SetupClosedError } from "./setupWindow";

class Bag {
  #items = new Map<string, number>();
  put(id: string, count: number): void {
    this.#items.set(id, (this.#items.get(id) ?? 0) + count);
  }
  count(id: string): number {
    return this.#items.get(id) ?? 0;
  }
}

describe("openSetupWindow", () => {
  test("works while open, private fields and collections included", () => {
    const world = { bag: new Bag(), list: [1, 2], meta: new Map([["a", { n: 1 }]]) };
    const window = openSetupWindow(world, "closed");
    window.view.bag.put("stone", 3);
    window.view.list.push(3);
    const entry = window.view.meta.get("a");
    if (entry !== undefined) entry.n = 2;
    expect(world.bag.count("stone")).toBe(3);
    expect(world.list).toEqual([1, 2, 3]);
    expect(world.meta.get("a")?.n).toBe(2);
    expect([...window.view.list]).toEqual([1, 2, 3]);
  });

  test("everything reached through it stops working once closed", () => {
    const world = { bag: new Bag(), nested: { value: 1 } };
    const window = openSetupWindow(world, "setup is over");
    const bag = window.view.bag;
    const put = bag.put;
    const nested = window.view.nested;
    window.close();
    expect(() => bag.put("stone", 1)).toThrow(SetupClosedError);
    expect(() => put.call(world.bag, "stone", 1)).toThrow("setup is over");
    expect(() => {
      nested.value = 5;
    }).toThrow(SetupClosedError);
    expect(() => window.view.bag).toThrow(SetupClosedError);
    expect(world.nested.value).toBe(1);
    expect(world.bag.count("stone")).toBe(0);
  });
});
