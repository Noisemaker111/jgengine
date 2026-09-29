import { describe, expect, it } from "bun:test";
import { createEventMeter } from "./eventMeter";

describe("eventMeter — ultimate charge (hold mode)", () => {
  function ultMeter() {
    return createEventMeter({
      max: 100,
      mode: "hold",
      gains: { damageDealt: 10, damageTaken: 5, objectiveTick: 2 },
    });
  }

  it("fills from tagged combat events and gates until full", () => {
    const meter = ultMeter();
    for (let i = 0; i < 5; i++) meter.feed("damageDealt");
    expect(meter.value()).toBe(50);
    expect(meter.ready()).toBe(false);
    meter.feed("damageTaken", 4);
    expect(meter.value()).toBe(70);
  });

  it("fires and reports ready when it reaches the threshold", () => {
    const meter = ultMeter();
    for (let i = 0; i < 9; i++) meter.feed("damageDealt");
    const last = meter.feed("damageDealt");
    expect(last.fired).toBe(true);
    expect(last.ready).toBe(true);
    expect(meter.ready()).toBe(true);
  });

  it("consume spends a full ult and resets the charge", () => {
    const meter = ultMeter();
    for (let i = 0; i < 10; i++) meter.feed("damageDealt");
    expect(meter.consume()).toBe(true);
    expect(meter.value()).toBe(0);
    expect(meter.ready()).toBe(false);
    expect(meter.consume()).toBe(false);
  });

  it("ignores unknown tags", () => {
    const meter = ultMeter();
    const result = meter.feed("healed");
    expect(result.amount).toBe(0);
    expect(meter.value()).toBe(0);
  });

  it("holds full without decay in hold mode", () => {
    const meter = createEventMeter({ max: 100, mode: "hold", decayPerSecond: 20, gains: { hit: 100 } });
    meter.feed("hit");
    meter.tick(5);
    expect(meter.value()).toBe(100);
  });
});

describe("eventMeter — streak / combo (reset mode)", () => {
  function streakMeter() {
    return createEventMeter({
      max: 30,
      mode: "reset",
      gains: { kill: 1 },
      resets: ["damageTaken"],
      tiers: [
        { id: "D", at: 3 },
        { id: "C", at: 6 },
        { id: "B", at: 10 },
        { id: "S", at: 20 },
      ],
    });
  }

  it("builds on kills and climbs tiers", () => {
    const meter = streakMeter();
    for (let i = 0; i < 3; i++) meter.feed("kill");
    expect(meter.tier()).toBe("D");
    for (let i = 0; i < 3; i++) meter.feed("kill");
    expect(meter.tier()).toBe("C");
    expect(meter.value()).toBe(6);
  });

  it("reports tierChanged only when crossing a threshold", () => {
    const meter = streakMeter();
    meter.feed("kill");
    meter.feed("kill");
    const crossing = meter.feed("kill");
    expect(crossing.tierChanged).toBe(true);
    expect(crossing.tier).toBe("D");
    const noCross = meter.feed("kill");
    expect(noCross.tierChanged).toBe(false);
  });

  it("resets to zero when the break event fires", () => {
    const meter = streakMeter();
    for (let i = 0; i < 8; i++) meter.feed("kill");
    expect(meter.tier()).toBe("C");
    const broken = meter.feed("damageTaken");
    expect(broken.reset).toBe(true);
    expect(broken.tierChanged).toBe(true);
    expect(meter.value()).toBe(0);
    expect(meter.tier()).toBe(null);
  });

  it("decays the streak toward zero over idle time", () => {
    const meter = createEventMeter({
      max: 30,
      mode: "reset",
      decayPerSecond: 2,
      gains: { kill: 5 },
      resets: [],
    });
    meter.feed("kill");
    meter.feed("kill");
    expect(meter.value()).toBe(10);
    meter.tick(3);
    expect(meter.value()).toBe(4);
  });
});

describe("eventMeter persistence and decay policy", () => {
  it("resumes overflow and decay delay after JSON restore, pausing decay while seen", () => {
    const config = {
      max: 100, mode: "reset" as const, gains: { alarm: 125 },
      decayPerSecond: 10, decayDelayMs: 1000, tiers: [{ id: "alert", at: 20 }],
    };
    const original = createEventMeter(config);
    expect(original.feed("alarm").overflow).toBe(25);
    original.tick(0.4);
    const saved = original.state();
    const decoded = JSON.parse(JSON.stringify(saved));
    const resumed = createEventMeter(config);
    resumed.restore(decoded);
    decoded.idleMs = 0;
    saved.value = 0;
    expect(resumed.state()).toEqual(original.state());
    resumed.tick(10, false);
    expect(resumed.state()).toEqual(original.state());
    for (const dt of [0.5, 0.2, 1]) {
      original.tick(dt);
      resumed.tick(dt);
      expect(resumed.state()).toEqual(original.state());
      expect(resumed.tier()).toBe(original.tier());
    }
    expect(resumed.value()).toBe(13);
    expect(resumed.feed("alarm")).toEqual(original.feed("alarm"));
  });

  it("restores readiness of a latched hold meter and consumes it normally", () => {
    const config = { max: 100, gains: { hit: 100 }, decayPerSecond: 20 };
    const original = createEventMeter(config);
    original.feed("hit");
    original.drain(25);
    const resumed = createEventMeter(config);
    resumed.restore(JSON.parse(JSON.stringify(original.state())));
    resumed.tick(2);
    expect(resumed.value()).toBe(75);
    expect(resumed.ready()).toBe(true);
    expect(resumed.consume()).toBe(true);
    expect(resumed.state()).toEqual({ value: 0, broken: false, idleMs: 0 });
  });
});
