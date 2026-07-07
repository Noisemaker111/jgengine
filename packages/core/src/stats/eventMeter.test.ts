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
