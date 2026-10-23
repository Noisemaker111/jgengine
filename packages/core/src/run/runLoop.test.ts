import { describe, expect, test } from "bun:test";

import { createRunLoop, installRunProbe, type RunLoop, type RunLoopState } from "./runLoop";

interface Change {
  label: string;
}

const CHANGES = [
  { id: "tight-line", value: { label: "HOBBS runs a tighter line" }, weight: 2 },
  { id: "short-yard", value: { label: "One more salvage drop" } },
  { id: "cold-start", value: { label: "The crusher starts closer" } },
  { id: "night-shift", value: { label: "Night shift: no headlights" }, after: 2 },
] as const;

function loop(seed = "yard-six"): RunLoop<Change> {
  return createRunLoop<Change>({ seed, changes: CHANGES });
}

/** The change ids a career plays over `runs` settled runs, banking every one. */
function sequence(run: RunLoop<Change>, runs: number): (string | null)[] {
  const played: (string | null)[] = [];
  for (let index = 0; index < runs; index += 1) {
    played.push(run.start().changeId);
    run.carry(100);
    run.settle("banked");
  }
  return played;
}

describe("run loop", () => {
  test("a banked run banks its haul scaled by the line", () => {
    const run = loop();
    expect(run.start().run).toBe(1);
    expect(run.carry(240)).toBe(240);
    expect(run.carry(60)).toBe(300);
    // A clean line pays above the haul, a scrappy one pays under it.
    expect(run.settle("banked", 1.25)).toMatchObject({ outcome: "banked", haul: 300, banked: 375, lost: 0 });
    const state = run.snapshot();
    expect(state.bankedTotal).toBe(375);
    expect(state.lostTotal).toBe(0);
    expect(state.bestHaul).toBe(375);
    expect(state.haul).toBe(0);
    expect(state.completed).toBe(1);
  });

  test("a wrecked run loses the haul and keeps the bank", () => {
    const run = loop();
    run.start();
    run.carry(300);
    run.settle("banked", 1);
    run.start();
    run.carry(180);
    const wreck = run.settle("lost");
    expect(wreck).toMatchObject({ outcome: "lost", haul: 180, banked: 0, lost: 180 });
    const state = run.snapshot();
    expect(state.bankedTotal).toBe(300);
    expect(state.lostTotal).toBe(180);
    expect(state.bestHaul).toBe(300);
    expect(state.haul).toBe(0);
  });

  test("a wreck after a bank still opens a fresh run", () => {
    const run = loop();
    run.start();
    run.carry(50);
    run.settle("banked");
    run.start();
    run.carry(90);
    const settlement = run.settle("lost");
    expect(settlement.next.run).toBe(3);
    expect(run.start().run).toBe(3);
    expect(run.haul()).toBe(0);
  });

  test("a multiplier cannot invent money from a bad number", () => {
    const run = loop();
    run.start();
    run.carry(100);
    expect(run.settle("banked", Number.NaN).banked).toBe(100);
    run.start();
    run.carry(100);
    expect(run.settle("banked", -3).banked).toBe(0);
  });

  test("carry ignores amounts that are not a positive number", () => {
    const run = loop();
    run.start();
    expect(run.carry(-40)).toBe(0);
    expect(run.carry(Number.POSITIVE_INFINITY)).toBe(0);
    expect(run.haul()).toBe(0);
  });

  test("settling twice throws instead of banking one haul twice", () => {
    const run = loop();
    run.start();
    run.carry(120);
    run.settle("banked");
    expect(() => run.settle("banked")).toThrow(/no run is open/);
    expect(run.snapshot().bankedTotal).toBe(120);
  });

  test("two loops on one seed play the same next-run sequence", () => {
    expect(sequence(loop("yard-six"), 8)).toEqual(sequence(loop("yard-six"), 8));
  });

  test("a different seed draws a different sequence", () => {
    const a = sequence(loop("yard-six"), 10);
    const b = sequence(loop("row-six"), 10);
    expect(a).not.toEqual(b);
  });

  test("the next run never repeats the change just played", () => {
    const played = sequence(loop("yard-six"), 20);
    for (let index = 1; index < played.length; index += 1) expect(played[index]).not.toBe(played[index - 1]);
  });

  test("an `after` gate keeps a late change out of an early run", () => {
    const played = sequence(loop("yard-six"), 40);
    // `after: 2` means two settled runs before it can be drawn, so runs 1 and 2 never show it.
    expect(played.slice(0, 2)).not.toContain("night-shift");
    expect(played.slice(2)).toContain("night-shift");
  });

  test("a snapshot restores mid-career and replays the same sequence", () => {
    const run = loop("save-me");
    const head = sequence(run, 3);
    const saved: RunLoopState = run.snapshot();

    const resumed = loop("save-me");
    resumed.restore(JSON.parse(JSON.stringify(saved)));
    expect(resumed.snapshot()).toEqual(saved);
    expect(resumed.offer().run).toBe(4);

    const tail = sequence(resumed, 4);
    const whole = sequence(loop("save-me"), 7);
    expect([...head, ...tail]).toEqual(whole);
  });

  test("a restored haul survives a save and settles the same way", () => {
    const run = loop();
    run.start();
    run.carry(140);
    const resumed = loop();
    resumed.restore(JSON.parse(JSON.stringify(run.snapshot())));
    expect(resumed.haul()).toBe(140);
    expect(resumed.settle("banked", 1.5)).toMatchObject({ haul: 140, banked: 210 });
  });

  test("an offer before the first run names a change, and the same offer starts it", () => {
    const run = loop();
    const offer = run.offer();
    expect(offer.run).toBe(1);
    expect(offer.changeId).not.toBeNull();
    expect(run.start()).toEqual(offer);
  });

  test("starting an open run keeps its haul and its change", () => {
    const run = loop();
    const first = run.start();
    run.carry(75);
    expect(run.start()).toEqual(first);
    expect(run.haul()).toBe(75);
  });

  test("a loop with no table still banks and loses", () => {
    const run = createRunLoop<Change>({ seed: "bare" });
    expect(run.start()).toEqual({ run: 1, changeId: null, change: null });
    run.carry(30);
    expect(run.settle("banked").banked).toBe(30);
  });

  test("a one-entry table still offers its only change every run", () => {
    const run = createRunLoop<Change>({ seed: "one", changes: [{ id: "only", value: { label: "Only" } }] });
    const played = sequence(run, 4);
    expect(played).toEqual(["only", "only", "only", "only"]);
  });

  test("a duplicate change id is refused at construction", () => {
    expect(() =>
      createRunLoop<Change>({
        seed: "dup",
        changes: [
          { id: "same", value: { label: "a" } },
          { id: "same", value: { label: "b" } },
        ],
      }),
    ).toThrow(/declared twice/);
  });

  test("a save naming a change this build dropped is cleaned up", () => {
    const run = loop();
    run.start();
    const state = run.snapshot();
    const resumed = createRunLoop<Change>({ seed: "yard-six", changes: [{ id: "short-yard", value: { label: "Kept" } }] });
    resumed.restore({ ...state, changeId: "retired-change" });
    expect(resumed.snapshot().changeId).toBeNull();
    expect(resumed.start().run).toBe(1);
  });
});

describe("run choices", () => {
  test("present offers distinct changes and the same three on a replay", () => {
    const offered = loop().present(3);
    expect(offered).toHaveLength(3);
    expect(new Set(offered.map((choice) => choice.id)).size).toBe(3);
    expect(offered.map((choice) => choice.id)).toEqual(loop().present(3).map((choice) => choice.id));
  });

  test("present carries each change's payload, not just its id", () => {
    for (const choice of loop().present(3)) {
      expect(choice.change.label.length).toBeGreaterThan(0);
    }
  });

  test("present leaves out a change its `after` gate has not opened yet", () => {
    const run = loop();
    expect(run.present(4).map((choice) => choice.id)).not.toContain("night-shift");
    run.start();
    run.settle("banked");
    run.start();
    run.settle("banked");
    // `after: 2` opens on run 3, once two runs have settled.
    expect(run.present(4).map((choice) => choice.id)).toContain("night-shift");
  });

  test("present never offers the change the last run played", () => {
    const run = loop();
    const played = run.start().changeId;
    run.carry(10);
    run.settle("banked");
    expect(run.present(3).map((choice) => choice.id)).not.toContain(played);
  });

  test("present never asks for more changes than the table has", () => {
    expect(loop().present(50)).toHaveLength(3);
    expect(loop().present(0)).toEqual([]);
    expect(loop().present(Number.NaN)).toEqual([]);
    expect(createRunLoop<Change>({ seed: "bare" }).present(3)).toEqual([]);
  });

  test("choosing a presented change opens the next run with it", () => {
    const run = loop();
    run.start();
    run.carry(100);
    run.settle("banked", 1);
    const pick = run.present(3)[1];
    expect(pick).toBeDefined();
    if (pick === undefined) return;
    expect(run.choose(pick.id)).toBe(true);
    expect(run.snapshot()).toMatchObject({ run: 2, completed: 1, changeId: pick.id, haul: 0 });
    expect(run.start()).toEqual({ run: 2, changeId: pick.id, change: pick.change });
  });

  test("a pick this loop's table does not carry is refused without changing the offer", () => {
    const run = loop();
    run.start();
    run.settle("banked");
    const before = run.offer();
    expect(run.choose("no-such-relic")).toBe(false);
    expect(run.offer()).toEqual(before);
    expect(run.snapshot().run).toBe(1);
  });

  test("choosing nothing opens the next run plain", () => {
    const run = loop();
    run.start();
    run.carry(40);
    run.settle("lost");
    expect(run.choose(null)).toBe(true);
    expect(run.start()).toEqual({ run: 2, changeId: null, change: null });
  });

  test("a chosen change survives a save and opens the run it was picked for", () => {
    const run = loop();
    run.start();
    run.carry(80);
    run.settle("banked");
    run.choose("short-yard");
    const resumed = loop();
    resumed.restore(JSON.parse(JSON.stringify(run.snapshot())));
    expect(resumed.offer().changeId).toBe("short-yard");
    expect(resumed.start().changeId).toBe("short-yard");
  });
});

describe("run probe", () => {
  const scope = globalThis as typeof globalThis & { __jgengineRun?: { read(): unknown } };

  test("the probe reports the live run, its totals and the change offered", () => {
    const run = loop();
    run.start();
    run.carry(240);
    const stop = installRunProbe(run);
    try {
      expect(scope.__jgengineRun?.read()).toMatchObject({ run: 1, carried: 240, banked: 0, lost: 0, best: 0 });
      expect(scope.__jgengineRun?.read().offered).toBe(run.offer().changeId);
      run.settle("banked", 1.25);
      expect(scope.__jgengineRun?.read()).toMatchObject({ carried: 0, banked: 300, lost: 0, best: 300 });
      expect(scope.__jgengineRun?.read().offered).toBe(run.offer().changeId);
    } finally {
      stop();
    }
    expect(scope.__jgengineRun).toBeUndefined();
  });

  test("a wrecked run reports what it lost, and a replaced probe is not removed by the old uninstaller", () => {
    const first = loop();
    const second = loop("row-six");
    const stopFirst = installRunProbe(first);
    const stopSecond = installRunProbe(second);
    second.start();
    second.carry(120);
    second.settle("lost");
    expect(scope.__jgengineRun?.read()).toMatchObject({ run: 1, carried: 0, banked: 0, lost: 120, best: 0 });
    stopFirst();
    expect(scope.__jgengineRun).toBeDefined();
    stopSecond();
    expect(scope.__jgengineRun).toBeUndefined();
  });
});
