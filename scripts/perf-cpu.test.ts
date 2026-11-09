import { expect, test } from "bun:test";
import { profileHitches, type CpuProfile } from "./perf-cpu";

const frame = (functionName: string, lineNumber: number) => ({ functionName, url: "http://localhost:5173/@fs/C:/repo/games/deepward/src/game/ui/GameUI.tsx", lineNumber, columnNumber: 0 });

test("a hitch lists the functions that ran inside it by self time, and nothing from outside it", () => {
  const profile: CpuProfile = {
    nodes: [
      { id: 1, callFrame: { functionName: "(root)", url: "", lineNumber: -1, columnNumber: -1 }, children: [5, 4] },
      { id: 5, callFrame: frame("openPause", 137), children: [2, 3] },
      { id: 2, callFrame: frame("rebuildHud", 41) },
      { id: 3, callFrame: frame("layoutDial", 90) },
      { id: 4, callFrame: { functionName: "(idle)", url: "", lineNumber: -1, columnNumber: -1 } },
    ],
    startTime: 0,
    // One sample a millisecond from the start: 10 in layoutDial before the hitch, 30 in rebuildHud, 10 in layoutDial, 10 idle.
    samples: [...Array(10).fill(3), ...Array(30).fill(2), ...Array(10).fill(3), ...Array(10).fill(4)],
    timeDeltas: Array(60).fill(1000),
  };
  // Sampling began at page time 1000; the hitch log's zero is at 900, so a 49.5 ms hitch ending at 0.16 s spans 1010.5 to 1060, between samples.
  const [hitch] = profileHitches(profile, 1000, 900, [{ atS: 0.16, ms: 49.5 }]);
  expect(hitch!.top.map((entry) => entry.fn)).toEqual(["rebuildHud", "layoutDial"]);
  expect(hitch!.top[0]!.ms).toBeCloseTo(30, 0);
  // Only the 10 ms inside the hitch, not the 10 before it.
  expect(hitch!.top[1]!.ms).toBeCloseTo(10, 0);
  expect(hitch!.top[0]!.at).toBe("games/deepward/src/game/ui/GameUI.tsx:42");
  // The handler that called both is credited with both.
  expect(hitch!.ours[0]).toEqual({ fn: "openPause", at: "games/deepward/src/game/ui/GameUI.tsx:138", ms: 40 });
});
