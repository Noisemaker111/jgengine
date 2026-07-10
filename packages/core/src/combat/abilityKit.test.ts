import { describe, expect, it } from "bun:test";
import { createAbilityKit } from "./abilityKit";

describe("abilityKit", () => {
  it("starts ready and lists slots in order", () => {
    const kit = createAbilityKit([
      { id: "bolt", cooldownMs: 1500 },
      { id: "dash", cooldownMs: 3000, chargesMax: 2 },
    ]);
    expect(kit.slots()).toEqual(["bolt", "dash"]);
    expect(kit.state("bolt")?.state).toBe("ready");
    expect(kit.state("dash")?.charges).toBe(2);
  });

  it("casting starts a cooldown and shows just-cast then cooldown", () => {
    const kit = createAbilityKit([{ id: "bolt", cooldownMs: 1000, flashMs: 200 }]);
    const cast = kit.cast("bolt");
    expect(cast.ok).toBe(true);
    expect(kit.state("bolt")?.state).toBe("just-cast");
    expect(kit.state("bolt")?.charges).toBe(0);

    kit.tick(0.25);
    expect(kit.state("bolt")?.state).toBe("cooldown");
    expect(kit.state("bolt")?.cooldownRemainingMs).toBeCloseTo(750, 1);
  });

  it("rejects casting while on cooldown", () => {
    const kit = createAbilityKit([{ id: "bolt", cooldownMs: 1000 }]);
    kit.cast("bolt");
    const second = kit.cast("bolt");
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("cooldown");
  });

  it("recharges a charge when the cooldown elapses", () => {
    const kit = createAbilityKit([{ id: "bolt", cooldownMs: 1000, flashMs: 0 }]);
    kit.cast("bolt");
    kit.tick(0.6);
    expect(kit.state("bolt")?.state).toBe("cooldown");
    kit.tick(0.5);
    expect(kit.state("bolt")?.state).toBe("ready");
    expect(kit.state("bolt")?.charges).toBe(1);
  });

  it("supports multiple charges recharging one at a time", () => {
    const kit = createAbilityKit([{ id: "dash", cooldownMs: 1000, chargesMax: 3, flashMs: 0 }]);
    kit.cast("dash");
    kit.cast("dash");
    expect(kit.state("dash")?.charges).toBe(1);
    kit.tick(1.0);
    expect(kit.state("dash")?.charges).toBe(2);
    kit.tick(1.0);
    expect(kit.state("dash")?.charges).toBe(3);
    expect(kit.state("dash")?.cooldownRemainingMs).toBe(0);
  });

  it("credits leftover overflow across a multi-charge recharge in one tick", () => {
    const kit = createAbilityKit([{ id: "dash", cooldownMs: 1000, chargesMax: 3, flashMs: 0 }]);
    kit.cast("dash");
    kit.cast("dash");
    kit.tick(2.0);
    expect(kit.state("dash")?.charges).toBe(3);
  });

  it("gates on resource cost as no-resource", () => {
    const kit = createAbilityKit([{ id: "ult", cooldownMs: 0, resourceCost: 100 }]);
    expect(kit.state("ult", 40)?.state).toBe("no-resource");
    expect(kit.canCast("ult", 40).ok).toBe(false);
    const cast = kit.cast("ult", 40);
    expect(cast.ok).toBe(false);
    if (!cast.ok) expect(cast.reason).toBe("no-resource");
    expect(kit.state("ult", 100)?.state).toBe("ready");
    expect(kit.cast("ult", 100).ok).toBe(true);
  });

  it("does not consume a resource itself (reports only)", () => {
    const kit = createAbilityKit([{ id: "ult", cooldownMs: 500, resourceCost: 50 }]);
    const cast = kit.cast("ult", 60);
    expect(cast.ok).toBe(true);
    if (cast.ok) expect(cast.slot.resourceCost).toBe(50);
  });

  it("cooldown ticks on game-time so pause and fast-forward carry through", () => {
    const kit = createAbilityKit([{ id: "bolt", cooldownMs: 1000, flashMs: 0 }]);
    kit.cast("bolt");
    kit.tick(0);
    expect(kit.state("bolt")?.cooldownRemainingMs).toBe(1000);
    kit.tick(1.0);
    expect(kit.state("bolt")?.state).toBe("ready");
  });

  it("reset restores charges and clears cooldown", () => {
    const kit = createAbilityKit([{ id: "bolt", cooldownMs: 1000 }]);
    kit.cast("bolt");
    kit.reset("bolt");
    expect(kit.state("bolt")?.state).toBe("ready");
    expect(kit.state("bolt")?.charges).toBe(1);
  });

  it("returns unknown-slot for missing ids and throws on duplicates", () => {
    const kit = createAbilityKit([{ id: "bolt", cooldownMs: 100 }]);
    const result = kit.cast("missing");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unknown-slot");
    expect(() => createAbilityKit([{ id: "x", cooldownMs: 1 }, { id: "x", cooldownMs: 2 }])).toThrow();
  });

  it("retuneSlot updates cooldown and cost for future activations", () => {
    const kit = createAbilityKit([{ id: "bolt", cooldownMs: 1000, resourceCost: 10, flashMs: 0 }]);
    expect(kit.retuneSlot("bolt", { cooldownMs: 200, resourceCost: 50 })).toBe(true);
    expect(kit.config("bolt")).toMatchObject({ cooldownMs: 200, resourceCost: 50 });
    const cast = kit.cast("bolt", 50);
    expect(cast.ok).toBe(true);
    if (cast.ok) expect(cast.slot.resourceCost).toBe(50);
    kit.tick(0.2);
    expect(kit.state("bolt")?.state).toBe("ready");
  });

  it("retuneSlot does not crash an in-flight cooldown and clamps negative values to zero", () => {
    const kit = createAbilityKit([{ id: "bolt", cooldownMs: 1000, flashMs: 0 }]);
    kit.cast("bolt");
    kit.tick(0.1);
    expect(kit.retuneSlot("bolt", { cooldownMs: -50 })).toBe(true);
    expect(kit.config("bolt")?.cooldownMs).toBe(0);
    kit.tick(0.1);
    expect(kit.state("bolt")?.state).toBe("ready");
    expect(kit.state("bolt")?.charges).toBe(1);
  });

  it("retuneSlot returns false for an unknown slot", () => {
    const kit = createAbilityKit([{ id: "bolt", cooldownMs: 1000 }]);
    expect(kit.retuneSlot("missing", { cooldownMs: 500 })).toBe(false);
  });

  it("state precedence puts just-cast ahead of no-resource", () => {
    const kit = createAbilityKit([{ id: "ult", cooldownMs: 1000, resourceCost: 100, flashMs: 300 }]);
    kit.cast("ult", 100);
    expect(kit.state("ult", 0)?.state).toBe("just-cast");
    kit.tick(0.4);
    expect(kit.state("ult", 0)?.state).toBe("cooldown");
  });
});

describe("abilityKit cooldown groups", () => {
  const gcdKit = () =>
    createAbilityKit(
      [
        { id: "strike", cooldownMs: 0, groups: ["gcd"] },
        { id: "fireball", cooldownMs: 6000, groups: ["gcd"] },
        { id: "potion", cooldownMs: 2000 },
      ],
      { groups: [{ id: "gcd", cooldownMs: 1500 }] },
    );

  it("casting one member blocks every member until the group recovers", () => {
    const kit = gcdKit();
    expect(kit.cast("strike").ok).toBe(true);
    const blocked = kit.canCast("fireball");
    expect(blocked.ok).toBe(false);
    expect(blocked.ok === false && blocked.reason).toBe("group-cooldown");
    expect(kit.canCast("potion").ok).toBe(true);
    kit.tick(1.5);
    expect(kit.canCast("fireball").ok).toBe(true);
    expect(kit.canCast("strike").ok).toBe(true);
  });

  it("snapshots surface the group block as cooldown state and fraction", () => {
    const kit = gcdKit();
    kit.cast("strike");
    kit.tick(0.3);
    const strike = kit.state("strike")!;
    expect(strike.state).toBe("cooldown");
    expect(strike.groupRemainingMs).toBe(1200);
    expect(strike.cooldownRemainingMs).toBe(1200);
    expect(strike.cooldownFraction).toBeCloseTo(0.8, 5);
    expect(strike.ready).toBe(false);
    expect(kit.groupRemaining("gcd")).toBe(1200);
    expect(kit.groupRemaining("nope")).toBeNull();
  });

  it("a slot's own longer cooldown outlives the group", () => {
    const kit = gcdKit();
    kit.cast("fireball");
    kit.tick(1.5);
    expect(kit.canCast("strike").ok).toBe(true);
    const fireball = kit.canCast("fireball");
    expect(fireball.ok).toBe(false);
    expect(fireball.ok === false && fireball.reason).toBe("cooldown");
  });

  it("full reset clears groups, slot-scoped reset does not", () => {
    const kit = gcdKit();
    kit.cast("strike");
    kit.reset("fireball");
    expect(kit.canCast("fireball").ok).toBe(false);
    kit.reset();
    expect(kit.canCast("fireball").ok).toBe(true);
  });

  it("rejects unknown group references and duplicate groups", () => {
    expect(() => createAbilityKit([{ id: "a", cooldownMs: 0, groups: ["missing"] }])).toThrow();
    expect(() =>
      createAbilityKit([], { groups: [{ id: "g", cooldownMs: 100 }, { id: "g", cooldownMs: 200 }] }),
    ).toThrow();
  });
});
