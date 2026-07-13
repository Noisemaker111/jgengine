import { describe, expect, test } from "bun:test";
import { perContext } from "@jgengine/core/runtime/perContext";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

describe("perContext", () => {
  const fakeCtx = () => ({}) as unknown as GameContext;

  test("mints one value per context, reuses it, and isolates distinct contexts", () => {
    let inits = 0;
    const state = perContext(() => {
      inits += 1;
      return new Map<string, number>();
    });
    const a = fakeCtx();
    const b = fakeCtx();

    state(a).set("x", 1);
    expect(state(a).get("x")).toBe(1);
    expect(state(a)).toBe(state(a)); // same context resolves to the same value
    expect(inits).toBe(1);

    expect(state(b).has("x")).toBe(false); // a different context gets its own state
    expect(inits).toBe(2);
  });

  test("passes the context to the initializer", () => {
    const state = perContext((ctx) => ctx);
    const a = fakeCtx();
    expect(state(a)).toBe(a);
  });
});
