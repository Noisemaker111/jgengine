import { describe, expect, test } from "bun:test";

/**
 * The runner's environment module is read by tests and tools that load the registry, not only by the
 * browser app. Outside a browser it must still import and answer with empty defaults instead of
 * touching `window` or an undefined Vite base URL.
 */
describe("runner environment outside a browser", () => {
  test("imports without a window and defaults every URL param", async () => {
    const env = await import("./appEnv");
    expect(env.GAME_ID).toBeNull();
    expect(env.STATE_PARAM).toBeNull();
    expect(env.MODE).toBe("play");
    expect(env.resolvedRun()).toEqual([]);
  });
});
