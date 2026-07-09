import { describe, expect, test } from "bun:test";
import { createFactionGraph, createFactionRoster } from "@jgengine/core/faction/factions";
import { createReputationLedger, effectiveRelation } from "@jgengine/core/faction/reputation";
import { createThreatTable } from "@jgengine/core/ai/threat";
import { createTargeting } from "@jgengine/core/scene/targeting";

function realm() {
  const graph = createFactionGraph({
    factions: [
      { id: "wardens", relations: { gravecallers: "hostile", mirefen: "hostile" } },
      { id: "gravecallers", relations: { wardens: "hostile", mirefen: "friendly" } },
      { id: "mirefen", relations: { wardens: "hostile", gravecallers: "friendly" } },
      { id: "wildlife" },
    ],
  });
  const roster = createFactionRoster(graph);
  roster.assign("hero", "wardens");
  roster.assign("cultist", "gravecallers");
  roster.assign("bog-lurker", "mirefen");
  roster.assign("marsh-boar", "wildlife");
  return { graph, roster };
}

describe("classic-mmo faction aggro", () => {
  test("a cultist aggros a warden but ignores wildlife", () => {
    const { roster } = realm();
    expect(roster.isHostile("cultist", "hero")).toBe(true);
    expect(roster.isHostile("cultist", "marsh-boar")).toBe(false);
    expect(roster.hostilesOf("cultist", ["hero", "marsh-boar", "bog-lurker"])).toEqual(["hero"]);
  });

  test("hostile-target cycling is driven by the faction roster", () => {
    const { roster } = realm();
    const candidates = ["hero", "cultist", "bog-lurker", "marsh-boar"];
    const targeting = createTargeting({
      candidates: () => candidates,
      classify: (from, to) => (roster.isHostile(from, to) ? "hostile" : "friendly"),
    });
    expect(targeting.cycleTarget("hero", { filter: "hostile" })).toBe("cultist");
    expect(targeting.cycleTarget("hero", { filter: "hostile" })).toBe("bog-lurker");
    expect(targeting.cycleTarget("hero", { filter: "hostile" })).toBe("cultist");
  });
});

describe("reputation flips a faction's hostility", () => {
  test("grinding mirefen reputation turns bog-lurkers from hostile to friendly", () => {
    const { graph } = realm();
    const ledger = createReputationLedger({ initial: { mirefen: -6000 } });

    const baseHostility = graph.relationBetween("wardens", "mirefen");
    expect(baseHostility).toBe("hostile");
    expect(effectiveRelation({ base: baseHostility, ledger, actorId: "hero", factionId: "mirefen" })).toBe("hostile");

    ledger.gain("hero", "mirefen", 3000);
    expect(ledger.tier("hero", "mirefen").id).toBe("unfriendly");
    expect(effectiveRelation({ base: baseHostility, ledger, actorId: "hero", factionId: "mirefen" })).toBe("neutral");

    ledger.gain("hero", "mirefen", 6000);
    expect(ledger.tier("hero", "mirefen").id).toBe("friendly");
    expect(effectiveRelation({ base: baseHostility, ledger, actorId: "hero", factionId: "mirefen" })).toBe("friendly");
  });
});

describe("threat and taunt over faction combat", () => {
  test("a party pulls a cultist, the healer draws aggro, the tank taunts it back", () => {
    const table = createThreatTable({ decayPerSecond: 0 });
    table.add("hero", 120);
    table.add("healer", 150);
    expect(table.highest()).toBe("healer");

    table.taunt("hero", 3);
    expect(table.highest()).toBe("hero");
    table.decay(3);
    expect(table.forcedTarget()).toBeNull();
    expect(table.highest()).toBe("hero");
  });
});
