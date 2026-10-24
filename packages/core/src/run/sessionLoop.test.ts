import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  createSessionLoop,
  installSessionProbe,
  type SessionLoop,
  type SessionLoopState,
  type SessionReadout,
} from "./sessionLoop";

describe("a park day: continuous, carries nothing, offers nothing", () => {
  // The whole config for a game whose sessions are days with nothing at stake.
  const parkDay = () => createSessionLoop({ kind: "day", carries: false });

  test("a day opens, ends, and carries nothing even when the game tries", () => {
    const park = parkDay();
    expect(park.phase()).toBe("idle");
    expect(park.kind()).toBe("day");
    expect(park.start()).toEqual({ session: 1, optionId: null, option: null });
    expect(park.phase()).toBe("open");

    expect(park.carry(500)).toBe(0);
    expect(park.carried()).toBe(0);

    const closed = park.settle();
    expect(closed).toMatchObject({ session: 1, carried: 0, closed: 1 });
    expect(closed.result).toBeUndefined();
    expect(park.phase()).toBe("closed");
    expect(park.start().session).toBe(2);
  });

  test("a day never offers a change and never carries one back", () => {
    const park = parkDay();
    expect(park.present(3)).toEqual([]);
    expect(park.offer()).toEqual({ session: 1, optionId: null, option: null });
    expect(park.choose("anything")).toBe(false);
    park.restore({ session: 4, closed: 3, carried: 900, optionId: "anything" });
    expect(park.snapshot()).toEqual({ session: 4, closed: 3, carried: 0, optionId: null });
  });

  test("the probe reports the live day without changing it", () => {
    const scope = globalThis as typeof globalThis & { __jgengineRun?: { read(): SessionReadout } };
    const park = parkDay();
    park.start();
    const stop = installSessionProbe(park);
    try {
      expect(scope.__jgengineRun?.read()).toEqual({
        session: 1,
        phase: "open",
        kind: "day",
        carried: 0,
        closed: 0,
        offered: null,
      });
    } finally {
      stop();
    }
    expect(scope.__jgengineRun).toBeUndefined();
  });
});

interface WaveEnd {
  survived: boolean;
}

describe("a wave loop: carries a quantity, settles it, offers nothing", () => {
  /** Waves keep what they gathered only when the player survived; the game owns that rule. */
  function waves(): SessionLoop<never, WaveEnd, number> {
    return createSessionLoop<never, WaveEnd, number>({
      kind: "wave",
      seed: "tide-7",
      settle: ({ carried, input }) => (input.survived ? carried : 0),
    });
  }

  test("a survived wave keeps what it carried and a failed wave keeps nothing", () => {
    const loop = waves();
    loop.start();
    expect(loop.carry(40)).toBe(40);
    expect(loop.carry(15)).toBe(55);
    const survived = loop.settle({ survived: true });
    expect(survived).toMatchObject({ session: 1, carried: 55, closed: 1, result: 55 });
    expect(loop.carried()).toBe(0);

    loop.start();
    loop.carry(60);
    const failed = loop.settle({ survived: false });
    expect(failed).toMatchObject({ session: 2, carried: 60, closed: 2, result: 0 });
    expect(loop.snapshot()).toEqual({ session: 2, closed: 2, carried: 0, optionId: null });
  });

  test("a wave loop with no table offers nothing at all", () => {
    const loop = waves();
    expect(loop.present(5)).toEqual([]);
    loop.start();
    expect(loop.offer().optionId).toBeNull();
    expect(loop.choose("no-such-wave-change")).toBe(false);
    expect(loop.settle({ survived: true }).next).toEqual({ session: 2, optionId: null, option: null });
  });

  test("a save restores the wave in progress and its carried quantity", () => {
    const loop = waves();
    loop.start();
    loop.carry(35);
    const resumed = waves();
    resumed.restore(JSON.parse(JSON.stringify(loop.snapshot())));
    expect(resumed.phase()).toBe("open");
    expect(resumed.carried()).toBe(35);
    expect(resumed.settle({ survived: true }).result).toBe(35);
  });
});

interface Boon {
  label: string;
}

type DescentEnd = "banked" | "lost";

const BOONS = [
  { id: "tighter-line", value: { label: "HOBBS runs a tighter line" }, weight: 2 },
  { id: "spare-parts", value: { label: "One more salvage drop" } },
  { id: "cold-start", value: { label: "The crusher starts closer" } },
  { id: "night-shift", value: { label: "Night shift: no headlights" }, after: 2 },
] as const;

describe("a roguelike: carries, banks or loses, and opens with an authored offer", () => {
  function descent(seed: string) {
    const ledger = { bank: 0, lost: 0 };
    const loop = createSessionLoop<Boon, DescentEnd, number>({
      kind: "descent",
      seed,
      offers: BOONS,
      settle: ({ carried, input }) => {
        const kept = input === "banked" ? Math.round(carried * 1.5) : 0;
        ledger.bank += kept;
        if (input === "lost") ledger.lost += carried;
        return kept;
      },
    });
    return { loop, ledger };
  }

  function play(loop: SessionLoop<Boon, DescentEnd, number>, sessions: number): (string | null)[] {
    const opened: (string | null)[] = [];
    for (let index = 0; index < sessions; index += 1) {
      opened.push(loop.start().optionId);
      loop.carry(100);
      loop.settle("banked");
    }
    return opened;
  }

  test("a banked descent banks the carried total and a lost one loses it", () => {
    const { loop, ledger } = descent("seam-9");
    expect(loop.start().session).toBe(1);
    expect(loop.carry(240)).toBe(240);
    expect(loop.settle("banked")).toMatchObject({ session: 1, carried: 240, closed: 1, result: 360 });
    expect(ledger.bank).toBe(360);

    loop.start();
    loop.carry(90);
    expect(loop.settle("lost")).toMatchObject({ session: 2, carried: 90, closed: 2, result: 0 });
    expect(ledger).toEqual({ bank: 360, lost: 90 });
    expect(loop.carried()).toBe(0);
  });

  test("present offers distinct authored options and choose opens the session with the pick", () => {
    const { loop } = descent("seam-9");
    const offered = loop.present(3);
    expect(offered).toHaveLength(3);
    expect(new Set(offered.map((choice) => choice.id)).size).toBe(3);
    expect(offered.map((choice) => choice.id)).not.toContain("night-shift");

    const pick = offered[1];
    expect(pick).toBeDefined();
    if (pick === undefined) return;
    expect(loop.choose(pick.id)).toBe(true);
    expect(loop.start()).toEqual({ session: 1, optionId: pick.id, option: pick.value });
  });

  test("an `after` gate opens a late option only once enough sessions have closed", () => {
    const { loop } = descent("seam-9");
    play(loop, 2);
    expect(loop.present(3).map((choice) => choice.id)).toContain("night-shift");
    expect(play(descent("seam-9").loop, 6)).toContain("night-shift");
  });

  test("the same seed replays the same options after a snapshot and restore", () => {
    const first = descent("seam-9");
    const head = play(first.loop, 3);
    const saved = first.loop.snapshot();

    const resumed = descent("seam-9");
    resumed.loop.restore(JSON.parse(JSON.stringify(saved)));
    expect(resumed.loop.snapshot()).toEqual(saved);

    const tail = play(resumed.loop, 4);
    expect([...head, ...tail]).toEqual(play(descent("seam-9").loop, 7));
  });

  test("a save mid-descent restores the carried total and the option it opened with", () => {
    const { loop } = descent("seam-9");
    const opened = loop.start();
    loop.carry(70);
    const resumed = descent("seam-9");
    resumed.loop.restore(JSON.parse(JSON.stringify(loop.snapshot())));
    expect(resumed.loop.carried()).toBe(70);
    expect(resumed.loop.offer().optionId).toBe(opened.optionId);
    expect(resumed.loop.settle("banked").result).toBe(105);
  });
});

describe("a live session stays durable through the persistence seam", () => {
  function durable(every?: number) {
    const disk = { state: null as SessionLoopState | null, writes: 0 };
    const open = () =>
      createSessionLoop<Boon, DescentEnd, number>({
        kind: "descent",
        seed: "seam-9",
        offers: BOONS,
        persist: {
          load: () => disk.state,
          save: (state) => {
            disk.state = JSON.parse(JSON.stringify(state)) as typeof disk.state;
            disk.writes += 1;
          },
          ...(every === undefined ? {} : { every }),
        },
      });
    return { disk, open };
  }

  test("a process killed between carries comes back carrying what it had", () => {
    const { open, disk } = durable();
    const first = open();
    first.start();
    first.carry(70);
    first.carry(30);
    expect(disk.writes).toBeGreaterThan(0);
    expect(disk.state?.carried).toBe(100);

    const afterCrash = open();
    expect(afterCrash.carried()).toBe(100);
    expect(afterCrash.snapshot()).toEqual(first.snapshot());
    expect(afterCrash.settle("banked").carried).toBe(100);
  });

  test("every N writes the haul once per N carries, and a close writes it too", () => {
    const { open, disk } = durable(3);
    const loop = open();
    loop.start();
    const opened = disk.writes;
    loop.carry(10);
    loop.carry(10);
    expect(disk.writes).toBe(opened);
    loop.carry(10);
    expect(disk.writes).toBe(opened + 1);
    expect(disk.state?.carried).toBe(30);
    loop.settle("banked");
    expect(disk.writes).toBe(opened + 2);
    expect(disk.state?.closed).toBe(1);
    expect(disk.state?.carried).toBe(0);
  });

  test("a storage that throws does not end the session", () => {
    const loop = createSessionLoop<Boon, DescentEnd, number>({
      kind: "descent",
      offers: BOONS,
      persist: {
        save: () => {
          throw new Error("quota exceeded");
        },
      },
    });
    loop.start();
    expect(loop.carry(40)).toBe(40);
    expect(loop.settle("banked").result).toBeUndefined();
  });
});

describe("the base capability stays genre-neutral", () => {
  const source = readFileSync(new URL("./sessionLoop.ts", import.meta.url), "utf8");
  const GENRE = /run|haul|modifier|draft|roguelike/i;
  const GENRE_WORD = /\b(runs?|hauls?|modifiers?|drafts?|roguelike)\b/i;

  const intents = [...source.matchAll(/@capability\s+([^\n]+)/g)].map((match) => match[1] ?? "");
  const exports = [...source.matchAll(/export\s+(?:interface|type|function|const)\s+(\w+)/g)].map((match) => match[1] ?? "");
  const members = [...source.matchAll(/export interface \w+[^{]*\{([\s\S]*?)\n\}/g)].flatMap((match) =>
    [...(match[1] ?? "").matchAll(/^ {2}(\w+)\??[:(]/gm)].map((member) => member[1] ?? ""),
  );

  test("the rule: every game is custom; there are no genre kits", () => {
    expect(GENRE_WORD.test("run-loop bank or lose what a run carries")).toBe(true);
    expect(GENRE.test("RunLoopState")).toBe(true);
    expect(GENRE_WORD.test("session-loop settle the quantity a session carried")).toBe(false);
    expect(GENRE.test("createSessionLoop")).toBe(false);
  });

  test("its capability intent names no genre", () => {
    expect(intents.length).toBeGreaterThan(0);
    for (const intent of intents) expect(intent).not.toMatch(GENRE_WORD);
  });

  test("its public type and member names name no genre", () => {
    expect(exports).toContain("createSessionLoop");
    expect(members).toContain("carried");
    expect(members).toContain("settle");
    for (const name of [...exports, ...members]) expect(name).not.toMatch(GENRE);
  });
});
