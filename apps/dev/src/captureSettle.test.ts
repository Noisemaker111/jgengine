import { describe, expect, test } from "bun:test";

import { pickStartAction, waitForQuiescentView, type StartCandidate, type ViewActivity } from "./captureSettle";

const button = (text: string, extra: Partial<StartCandidate> = {}): StartCandidate => ({
  text, disabled: false, visible: true, marked: false, primary: false, utility: false, ...extra,
});

describe("pickStartAction", () => {
  test("skips a disabled primary Continue and picks the new-game action (odd-orbit's menu)", () => {
    const menu = [
      button("Continue household · no save", { primary: true, disabled: true }),
      button("New household"),
      button("Settings"),
      button("Field guide"),
      button("Credits"),
    ];
    expect(pickStartAction(menu)?.text).toBe("New household");
  });

  test("a data-jg-start mark wins over wording and styling", () => {
    expect(pickStartAction([button("Play", { primary: true }), button("Embark", { marked: true })])?.text).toBe("Embark");
  });

  test("prefers an enabled primary button, never settings or quit", () => {
    expect(pickStartAction([button("Quit", { primary: true }), button("Options"), button("Set sail", { primary: true })])?.text).toBe("Set sail");
  });

  test("returns null when nothing reads as a start action", () => {
    expect(pickStartAction([button("Settings"), button("Credits"), button("Gear", { utility: true })])).toBeNull();
  });
});

describe("waitForQuiescentView", () => {
  function harness(script: ViewActivity[]) {
    let clock = 0;
    let index = 0;
    let frames = 0;
    return {
      deps: {
        activity: () => script[Math.min(index, script.length - 1)]!,
        frames: async (count: number) => { frames += count; index += 1; clock += 1000; },
        modelIdle: async () => {},
        now: () => clock,
      },
      frames: () => frames,
    };
  }

  test("waits out a capture state whose spawns start model streaming after the first idle reading", async () => {
    // Staged towers: idle at first, the next frames mount them and start two loads, then nothing new.
    const run = harness([
      { modelLoadStarts: 3, viewLoading: false },
      { modelLoadStarts: 4, viewLoading: false },
      { modelLoadStarts: 5, viewLoading: false },
      { modelLoadStarts: 5, viewLoading: false },
      { modelLoadStarts: 5, viewLoading: false },
    ]);
    expect(await waitForQuiescentView(run.deps, 60_000)).toBeNull();
    expect(run.frames()).toBe(6);
  });

  test("never declares a view ready while the Loading game view fallback is mounted", async () => {
    const run = harness([{ modelLoadStarts: 1, viewLoading: true }]);
    expect(await waitForQuiescentView(run.deps, 5_000)).toContain("Loading game view");
  });
});
