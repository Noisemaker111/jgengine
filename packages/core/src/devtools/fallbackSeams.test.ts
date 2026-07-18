import { afterEach, describe, expect, test } from "bun:test";

import { devtools } from "./devtools";
import {
  armFallbackSeams,
  beginFallbackPass,
  beginFallbackSeam,
  endFallbackPass,
  fallbackSeamsSnapshot,
  reportFallbackSeam,
} from "./fallbackSeams";

function warnCount(): number {
  return devtools.logs.list().filter((entry) => entry.level === "warn").length;
}

afterEach(() => {
  armFallbackSeams(false);
  devtools.logs.clear();
});

// Simulates one committed scene: the four render seams each fall back to a placeholder.
function runFallbackPass(): void {
  beginFallbackPass();
  reportFallbackSeam("ground", "noScene");
  reportFallbackSeam("entity", "omittedMapping");
  reportFallbackSeam("entity", "omittedMapping");
  reportFallbackSeam("object", "unpulledPack");
  reportFallbackSeam("scatter", "omittedMapping");
  endFallbackPass();
}

describe("fallbackSeams collector", () => {
  test("tallies counts and causes per seam when armed", () => {
    devtools.logs.clear();
    armFallbackSeams(true);
    runFallbackPass();
    expect(fallbackSeamsSnapshot()).toEqual({
      ground: { noScene: 1 },
      entity: { omittedMapping: 2 },
      object: { unpulledPack: 1 },
      scatter: { omittedMapping: 1 },
    });
  });

  test("emits exactly one deduped warn line across identical passes", () => {
    devtools.logs.clear();
    armFallbackSeams(true);
    runFallbackPass();
    expect(warnCount()).toBe(1);
    // A second identical pass must not re-emit — the signature is unchanged.
    runFallbackPass();
    expect(warnCount()).toBe(1);
  });

  test("re-emits when the fallback signature changes", () => {
    devtools.logs.clear();
    armFallbackSeams(true);
    runFallbackPass();
    expect(warnCount()).toBe(1);
    // Adding another object fallback changes the signature → one more line.
    beginFallbackPass();
    reportFallbackSeam("object", "omittedMapping");
    endFallbackPass();
    expect(warnCount()).toBe(2);
  });

  test("beginFallbackSeam re-zeros only its own seam (independent subtrees)", () => {
    armFallbackSeams(true);
    reportFallbackSeam("entity", "omittedMapping");
    reportFallbackSeam("scatter", "omittedMapping");
    // A scatter re-render re-zeros scatter only; the entity tally survives.
    beginFallbackSeam("scatter");
    reportFallbackSeam("scatter", "omittedMapping");
    expect(fallbackSeamsSnapshot()).toEqual({
      entity: { omittedMapping: 1 },
      scatter: { omittedMapping: 1 },
    });
  });

  // CRITICAL: production / opt-out path is a pure no-op — snapshot empty, no log line.
  test("disarmed report is a no-op: empty snapshot and no fallback log", () => {
    devtools.logs.clear();
    armFallbackSeams(false);
    beginFallbackPass();
    reportFallbackSeam("ground", "noScene");
    reportFallbackSeam("entity", "omittedMapping");
    reportFallbackSeam("object", "unpulledPack");
    reportFallbackSeam("scatter", "omittedMapping");
    endFallbackPass();
    expect(fallbackSeamsSnapshot()).toEqual({});
    expect(warnCount()).toBe(0);
  });
});
