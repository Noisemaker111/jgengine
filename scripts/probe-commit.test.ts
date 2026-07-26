import { describe, expect, test } from "bun:test";

import { lockfileChanged, restoreTarget } from "./probe-commit";

describe("restoreTarget", () => {
  test("returns to the branch when the probe started on one", () => {
    expect(restoreTarget("main", "a".repeat(40))).toBe("main");
  });

  test("returns to the commit when the probe started detached", () => {
    expect(restoreTarget("HEAD", "a".repeat(40))).toBe("a".repeat(40));
    expect(restoreTarget("", "b".repeat(40))).toBe("b".repeat(40));
  });
});

describe("lockfileChanged", () => {
  test("detects dependency-graph moves", () => {
    expect(lockfileChanged("packages/core/src/index.ts\nbun.lock")).toBe(true);
    expect(lockfileChanged("package.json")).toBe(true);
    expect(lockfileChanged("bun.lockb")).toBe(true);
    expect(lockfileChanged("packages/core/package.json")).toBe(true);
  });

  test("ignores source-only diffs", () => {
    expect(lockfileChanged("packages/core/src/index.ts\nGames/the-robots/src/game.ts")).toBe(false);
    expect(lockfileChanged("apps/dev/src/package.json.ts")).toBe(false);
    expect(lockfileChanged("")).toBe(false);
  });
});
