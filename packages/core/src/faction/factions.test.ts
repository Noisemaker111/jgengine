import { describe, expect, test } from "bun:test";
import { createFactionGraph, createFactionRoster } from "@jgengine/core/faction/factions";

const graph = createFactionGraph({
  factions: [
    { id: "alliance", relations: { horde: "hostile" }, towardOthers: "neutral" },
    { id: "horde", relations: { alliance: "hostile" }, towardOthers: "neutral" },
    { id: "wildlife" },
    { id: "gravecallers", relations: { wildlife: "hostile" }, towardOthers: "hostile", towardSelf: "friendly" },
  ],
});

describe("faction graph relations", () => {
  test("declared relations resolve both directions", () => {
    expect(graph.relationBetween("alliance", "horde")).toBe("hostile");
    expect(graph.relationBetween("horde", "alliance")).toBe("hostile");
  });

  test("members of the same faction are friendly by default", () => {
    expect(graph.relationBetween("horde", "horde")).toBe("friendly");
  });

  test("towardOthers is the fallback for unlisted factions", () => {
    expect(graph.relationBetween("alliance", "wildlife")).toBe("neutral");
    expect(graph.relationBetween("gravecallers", "alliance")).toBe("hostile");
  });

  test("symmetric fallback mirrors an undeclared direction", () => {
    expect(graph.relationBetween("wildlife", "gravecallers")).toBe("hostile");
  });

  test("unknown or missing factions are unaligned neutral", () => {
    expect(graph.relationBetween("alliance", "ghost")).toBe("neutral");
    expect(graph.relationBetween(null, "horde")).toBe("neutral");
    expect(graph.relationBetween(undefined, undefined)).toBe("neutral");
  });

  test("isHostile / isFriendly / isNeutral predicates", () => {
    expect(graph.isHostile("alliance", "horde")).toBe(true);
    expect(graph.isFriendly("horde", "horde")).toBe(true);
    expect(graph.isNeutral("alliance", "wildlife")).toBe(true);
  });

  test("has and ids expose membership", () => {
    expect(graph.has("horde")).toBe(true);
    expect(graph.has("ghost")).toBe(false);
    expect(graph.ids()).toEqual(["alliance", "horde", "wildlife", "gravecallers"]);
  });
});

describe("faction graph asymmetric mode", () => {
  test("symmetric:false does not mirror undeclared directions", () => {
    const oneWay = createFactionGraph({
      symmetric: false,
      factions: [{ id: "guards", relations: { thieves: "hostile" } }, { id: "thieves" }],
    });
    expect(oneWay.relationBetween("guards", "thieves")).toBe("hostile");
    expect(oneWay.relationBetween("thieves", "guards")).toBe("neutral");
  });

  test("unaligned override changes the default for unknowns", () => {
    const hostileWorld = createFactionGraph({ factions: [{ id: "a" }], unaligned: "hostile" });
    expect(hostileWorld.relationBetween("a", "unknown")).toBe("hostile");
  });
});

describe("faction roster", () => {
  test("assigns entities and resolves relations through the graph", () => {
    const roster = createFactionRoster(graph);
    roster.assign("player-1", "alliance");
    roster.assign("orc-grunt", "horde");
    roster.assign("boar", "wildlife");

    expect(roster.factionOf("player-1")).toBe("alliance");
    expect(roster.relationBetweenEntities("player-1", "orc-grunt")).toBe("hostile");
    expect(roster.isHostile("player-1", "orc-grunt")).toBe(true);
    expect(roster.isFriendly("player-1", "boar")).toBe(false);
    expect(roster.relationBetweenEntities("player-1", "boar")).toBe("neutral");
  });

  test("hostilesOf filters candidates by relation and excludes self", () => {
    const roster = createFactionRoster(graph);
    roster.assign("player-1", "alliance");
    roster.assign("orc-a", "horde");
    roster.assign("orc-b", "horde");
    roster.assign("friend", "alliance");
    expect(roster.hostilesOf("player-1", ["player-1", "orc-a", "orc-b", "friend"])).toEqual(["orc-a", "orc-b"]);
  });

  test("members lists entities in a faction and remove clears membership", () => {
    const roster = createFactionRoster(graph);
    roster.assign("orc-a", "horde");
    roster.assign("orc-b", "horde");
    expect(roster.members("horde")).toEqual(["orc-a", "orc-b"]);
    roster.remove("orc-a");
    expect(roster.members("horde")).toEqual(["orc-b"]);
    expect(roster.factionOf("orc-a")).toBeNull();
  });

  test("unassigned entities are unaligned neutral", () => {
    const roster = createFactionRoster(graph);
    roster.assign("player-1", "alliance");
    expect(roster.relationBetweenEntities("player-1", "nobody")).toBe("neutral");
  });
});
