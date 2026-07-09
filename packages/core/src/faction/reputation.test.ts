import { describe, expect, test } from "bun:test";
import {
  createReputationLedger,
  DEFAULT_REPUTATION_TIERS,
  effectiveRelation,
  tierForStanding,
} from "@jgengine/core/faction/reputation";

describe("tierForStanding", () => {
  test("maps standings to the classic reputation ladder", () => {
    expect(tierForStanding(DEFAULT_REPUTATION_TIERS, 0).id).toBe("neutral");
    expect(tierForStanding(DEFAULT_REPUTATION_TIERS, 2999).id).toBe("neutral");
    expect(tierForStanding(DEFAULT_REPUTATION_TIERS, 3000).id).toBe("friendly");
    expect(tierForStanding(DEFAULT_REPUTATION_TIERS, 42000).id).toBe("exalted");
    expect(tierForStanding(DEFAULT_REPUTATION_TIERS, -6000).id).toBe("hostile");
  });

  test("standings below the lowest tier clamp to the bottom tier", () => {
    expect(tierForStanding(DEFAULT_REPUTATION_TIERS, -999999).id).toBe("hated");
  });
});

describe("reputation ledger", () => {
  test("default standing is zero / neutral", () => {
    const ledger = createReputationLedger();
    expect(ledger.standing("player", "gravecallers")).toBe(0);
    expect(ledger.tier("player", "gravecallers").id).toBe("neutral");
    expect(ledger.relation("player", "gravecallers")).toBe("neutral");
    expect(ledger.hasStanding("player", "gravecallers")).toBe(false);
  });

  test("gains accumulate and cross tier thresholds", () => {
    const ledger = createReputationLedger();
    expect(ledger.gain("player", "wardens", 3000)).toBe(3000);
    expect(ledger.tier("player", "wardens").id).toBe("friendly");
    expect(ledger.relation("player", "wardens")).toBe("friendly");
    ledger.gain("player", "wardens", 6000);
    expect(ledger.tier("player", "wardens").id).toBe("honored");
  });

  test("initial standings seed a starting relation", () => {
    const ledger = createReputationLedger({ initial: { gravecallers: -6000 } });
    expect(ledger.standing("player", "gravecallers")).toBe(-6000);
    expect(ledger.relation("player", "gravecallers")).toBe("hostile");
    expect(ledger.hasStanding("player", "gravecallers")).toBe(true);
  });

  test("clamps to configured bounds", () => {
    const ledger = createReputationLedger({ min: -6000, max: 42000 });
    expect(ledger.gain("player", "wardens", 999999)).toBe(42000);
    expect(ledger.gain("player", "gravecallers", -999999)).toBe(-6000);
  });

  test("standings snapshot merges initial and earned values", () => {
    const ledger = createReputationLedger({ initial: { gravecallers: -6000, wardens: 0 } });
    ledger.gain("player", "wardens", 9000);
    expect(ledger.standings("player")).toEqual({ gravecallers: -6000, wardens: 9000 });
  });

  test("reset clears one or all factions", () => {
    const ledger = createReputationLedger();
    ledger.set("player", "wardens", 9000);
    ledger.set("player", "gravecallers", -3000);
    ledger.reset("player", "wardens");
    expect(ledger.hasStanding("player", "wardens")).toBe(false);
    expect(ledger.standing("player", "gravecallers")).toBe(-3000);
    ledger.reset("player");
    expect(ledger.hasStanding("player", "gravecallers")).toBe(false);
  });
});

describe("effectiveRelation", () => {
  test("reputation standing overrides the base faction relation", () => {
    const ledger = createReputationLedger({ initial: { gravecallers: -6000 } });
    expect(
      effectiveRelation({ base: "hostile", ledger, actorId: "player", factionId: "gravecallers" }),
    ).toBe("hostile");
    ledger.gain("player", "gravecallers", 9000);
    expect(
      effectiveRelation({ base: "hostile", ledger, actorId: "player", factionId: "gravecallers" }),
    ).toBe("friendly");
  });

  test("falls back to the base relation when the actor has no standing", () => {
    const ledger = createReputationLedger();
    expect(
      effectiveRelation({ base: "hostile", ledger, actorId: "player", factionId: "wildlife" }),
    ).toBe("hostile");
  });
});
