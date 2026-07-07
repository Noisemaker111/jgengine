import { describe, expect, test } from "bun:test";

import { createContestedChannel } from "./contestedChannel";

describe("contested channel", () => {
  test("fills over duration and emits start then complete", () => {
    const channel = createContestedChannel({ duration: 4 });
    const start = channel.start("attackers");
    expect(start?.kind).toBe("start");
    expect(channel.phase()).toBe("active");

    let completed = false;
    for (let i = 0; i < 3; i += 1) {
      const events = channel.tick(1, { attackers: 1 });
      expect(events.map((e) => e.kind)).toEqual(["tick"]);
    }
    const last = channel.tick(1, { attackers: 1 });
    expect(last.map((e) => e.kind)).toEqual(["tick", "complete"]);
    completed = channel.phase() === "complete";
    expect(completed).toBe(true);
    expect(channel.progress()).toBe(1);
    expect(channel.remaining()).toBe(0);
  });

  test("damage interrupts and keeps progress by default", () => {
    const channel = createContestedChannel({ duration: 4 });
    channel.start("attackers");
    channel.tick(2, { attackers: 1 });
    expect(channel.progress()).toBeCloseTo(0.5, 5);
    const interrupt = channel.damage("shot");
    expect(interrupt?.kind).toBe("interrupted");
    expect(interrupt?.reason).toBe("shot");
    expect(channel.phase()).toBe("interrupted");
    expect(channel.progress()).toBeCloseTo(0.5, 5);
    expect(channel.tick(1, { attackers: 1 })).toEqual([]);
  });

  test("resetOnInterrupt zeroes progress", () => {
    const channel = createContestedChannel({ duration: 4, resetOnInterrupt: true });
    channel.start("attackers");
    channel.tick(2, { attackers: 1 });
    channel.damage();
    expect(channel.progress()).toBe(0);
  });

  test("interruptOnDamage false ignores damage", () => {
    const channel = createContestedChannel({ duration: 4, interruptOnDamage: false });
    channel.start("attackers");
    channel.tick(1, { attackers: 1 });
    expect(channel.damage()).toBeNull();
    expect(channel.phase()).toBe("active");
  });

  test("favorability scales the fill rate per team", () => {
    const channel = createContestedChannel({ duration: 4, favorability: { home: 2 } });
    channel.start("home");
    channel.tick(1, { home: 1 });
    expect(channel.progress()).toBeCloseTo(0.5, 5);
  });

  test("ratePerOccupant fills faster with more owners present (Deadlock urn)", () => {
    const channel = createContestedChannel({ duration: 4, ratePerOccupant: true });
    channel.start("home");
    channel.tick(1, { home: 2 });
    expect(channel.progress()).toBeCloseTo(0.5, 5);
  });

  test("contested pause holds progress while an opposing team occupies", () => {
    const channel = createContestedChannel({ duration: 4 });
    channel.start("attackers");
    channel.tick(1, { attackers: 1 });
    const contested = channel.tick(1, { attackers: 1, defenders: 1 });
    expect(contested.map((e) => e.kind)).toEqual(["contested"]);
    expect(channel.phase()).toBe("contested");
    expect(channel.progress()).toBeCloseTo(0.25, 5);
  });

  test("contested decay bleeds progress back down", () => {
    const channel = createContestedChannel({ duration: 4, contested: "decay", decayRate: 0.5 });
    channel.start("attackers");
    channel.tick(2, { attackers: 1 });
    expect(channel.progress()).toBeCloseTo(0.5, 5);
    channel.tick(1, { attackers: 1, defenders: 1 });
    expect(channel.progress()).toBeCloseTo(0, 5);
  });

  test("owner leaving pauses the channel", () => {
    const channel = createContestedChannel({ duration: 4 });
    channel.start("attackers");
    channel.tick(1, { attackers: 1 });
    const left = channel.tick(1, { defenders: 1 });
    expect(left.map((e) => e.kind)).toEqual(["paused"]);
    expect(channel.phase()).toBe("paused");
  });

  test("start is rejected while already channeling", () => {
    const channel = createContestedChannel({ duration: 4 });
    channel.start("attackers");
    expect(channel.start("defenders")).toBeNull();
  });
});
