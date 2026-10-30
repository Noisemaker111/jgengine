import { describe, expect, test } from "bun:test";
import {
  createReputationLedger,
  effectiveRelation,
  type ReputationTier,
  tierForStanding,
} from "@jgengine/core/faction/reputation";

const TIERS: readonly ReputationTier[] = [
  { id: "outcast", min: -100, relation: "hostile" },
  { id: "neutral", min: 0, relation: "neutral" },
  { id: "friend", min: 100, relation: "friendly" },
  { id: "ally", min: 200, relation: "friendly" },
];

describe("tierForStanding", () => {
  test("maps standings to the caller's ladder", () => {
    expect(tierForStanding(TIERS, 0).id).toBe("neutral");
    expect(tierForStanding(TIERS, 99).id).toBe("neutral");
    expect(tierForStanding(TIERS, 100).id).toBe("friend");
    expect(tierForStanding(TIERS, 200).id).toBe("ally");
    expect(tierForStanding(TIERS, -50).id).toBe("outcast");
  });

  test("standings below the lowest tier clamp to the bottom tier", () => {
    expect(tierForStanding(TIERS, -999999).id).toBe("outcast");
  });

  test("a standing exactly on a tier floor takes that tier, one below stays under it", () => {
    expect(tierForStanding(TIERS, 100).id).toBe("friend");
    expect(tierForStanding(TIERS, 99.99).id).toBe("neutral");
    expect(tierForStanding(TIERS, -100).id).toBe("outcast");
    expect(tierForStanding(TIERS, -100.01).id).toBe("outcast");
  });

  test("a tier list with nothing in it is refused", () => {
    expect(() => tierForStanding([], 0)).toThrow(RangeError);
  });
});

describe("reputation ledger", () => {
  test("default standing is zero / neutral", () => {
    const ledger = createReputationLedger({ tiers: TIERS });
    expect(ledger.standing("player", "gravecallers")).toBe(0);
    expect(ledger.tier("player", "gravecallers").id).toBe("neutral");
    expect(ledger.relation("player", "gravecallers")).toBe("neutral");
    expect(ledger.hasStanding("player", "gravecallers")).toBe(false);
  });

  test("gains accumulate and cross tier thresholds", () => {
    const ledger = createReputationLedger({ tiers: TIERS });
    expect(ledger.gain("player", "wardens", 100)).toBe(100);
    expect(ledger.tier("player", "wardens").id).toBe("friend");
    expect(ledger.relation("player", "wardens")).toBe("friendly");
    ledger.gain("player", "wardens", 100);
    expect(ledger.tier("player", "wardens").id).toBe("ally");
  });

  test("initial standings seed a starting relation", () => {
    const ledger = createReputationLedger({ tiers: TIERS, initial: { gravecallers: -50 } });
    expect(ledger.standing("player", "gravecallers")).toBe(-50);
    expect(ledger.relation("player", "gravecallers")).toBe("hostile");
    expect(ledger.hasStanding("player", "gravecallers")).toBe(true);
  });

  test("clamps to configured bounds", () => {
    const ledger = createReputationLedger({ tiers: TIERS, min: -100, max: 200 });
    expect(ledger.gain("player", "wardens", 999999)).toBe(200);
    expect(ledger.gain("player", "gravecallers", -999999)).toBe(-100);
  });

  test("standings snapshot merges initial and earned values", () => {
    const ledger = createReputationLedger({ tiers: TIERS, initial: { gravecallers: -50, wardens: 0 } });
    ledger.gain("player", "wardens", 150);
    expect(ledger.standings("player")).toEqual({ gravecallers: -50, wardens: 150 });
  });

  test("reset clears one or all factions", () => {
    const ledger = createReputationLedger({ tiers: TIERS });
    ledger.set("player", "wardens", 200);
    ledger.set("player", "gravecallers", -50);
    ledger.reset("player", "wardens");
    expect(ledger.hasStanding("player", "wardens")).toBe(false);
    expect(ledger.standing("player", "gravecallers")).toBe(-50);
    ledger.reset("player");
    expect(ledger.hasStanding("player", "gravecallers")).toBe(false);
  });
});

describe("effectiveRelation", () => {
  test("reputation standing overrides the base faction relation", () => {
    const ledger = createReputationLedger({ tiers: TIERS, initial: { gravecallers: -50 } });
    expect(
      effectiveRelation({ base: "hostile", ledger, actorId: "player", factionId: "gravecallers" }),
    ).toBe("hostile");
    ledger.gain("player", "gravecallers", 200);
    expect(
      effectiveRelation({ base: "hostile", ledger, actorId: "player", factionId: "gravecallers" }),
    ).toBe("friendly");
  });

  test("falls back to the base relation when the actor has no standing", () => {
    const ledger = createReputationLedger({ tiers: TIERS });
    expect(
      effectiveRelation({ base: "hostile", ledger, actorId: "player", factionId: "wildlife" }),
    ).toBe("hostile");
  });
});

describe("reputation ledger snapshot", () => {
  test("snapshot and restore replay bit-exactly", () => {
    const ledger = createReputationLedger({ tiers: TIERS, initial: { guild: 50 }, min: -100, max: 200 });
    ledger.gain("p1", "guild", 100);
    ledger.set("p2", "bandits", -80);
    const saved = ledger.snapshot();
    const frozen = JSON.parse(JSON.stringify(saved));
    const play = () => [
      ledger.gain("p1", "guild", 100),
      ledger.gain("p2", "bandits", -20),
      ledger.tier("p1", "guild").id,
      ledger.standings("p2"),
      ledger.hasStanding("p3", "bandits"),
    ];
    const a = play();
    ledger.reset("p1");
    expect(saved).toEqual(frozen);
    ledger.restore(saved);
    expect(play()).toEqual(a);
  });
});
