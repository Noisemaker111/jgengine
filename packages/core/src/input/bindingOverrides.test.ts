import { describe, expect, test } from "bun:test";

import type { ActionCodesMap } from "./actionBindings";
import {
  applyBindingOverrides,
  clearBindingOverride,
  loadBindingOverrides,
  saveBindingOverride,
} from "./bindingOverrides";

function memStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("bindingOverrides", () => {
  test("round-trips a saved override", () => {
    const storage = memStorage();
    saveBindingOverride("dune", "jump", ["Space"], storage);
    expect(loadBindingOverrides("dune", storage)).toEqual({ jump: ["Space"] });
  });

  test("clearing removes one action and empties the key", () => {
    const storage = memStorage();
    saveBindingOverride("dune", "jump", ["Space"], storage);
    saveBindingOverride("dune", "fire", ["mouse0"], storage);
    clearBindingOverride("dune", "jump", storage);
    expect(loadBindingOverrides("dune", storage)).toEqual({ fire: ["mouse0"] });
    clearBindingOverride("dune", "fire", storage);
    expect(storage.getItem("jgengine:keybinds:dune")).toBeNull();
  });

  test("applyBindingOverrides only touches declared actions", () => {
    const input: ActionCodesMap = { jump: ["KeyW"], fire: ["mouse0"] };
    const merged = applyBindingOverrides(input, { jump: ["Space"], ghost: ["KeyG"] });
    expect(merged).toEqual({ jump: ["Space"], fire: ["mouse0"] });
    expect(applyBindingOverrides(input, {})).toBe(input);
  });

  test("ignores malformed persisted entries", () => {
    const storage = memStorage();
    storage.setItem("jgengine:keybinds:dune", JSON.stringify({ jump: 5, fire: ["mouse0"] }));
    expect(loadBindingOverrides("dune", storage)).toEqual({ fire: ["mouse0"] });
  });
});
