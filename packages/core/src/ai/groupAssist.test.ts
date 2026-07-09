import { describe, expect, test } from "bun:test";
import { createAssistNetwork } from "@jgengine/core/ai/groupAssist";
import { createThreatTable } from "@jgengine/core/ai/threat";

function member(id: string, groupId: string) {
  return { id, groupId, table: createThreatTable() };
}

describe("group assist propagation", () => {
  test("a single pull rallies the whole group", () => {
    const network = createAssistNetwork();
    const tank = member("tank", "raid");
    const healer = member("healer", "raid");
    const dps = member("dps", "raid");
    network.register(tank);
    network.register(healer);
    network.register(dps);

    const assisters = network.addThreat("tank", "boss", 10);

    expect(assisters.sort()).toEqual(["dps", "healer"]);
    expect(tank.table.threatOf("boss")).toBe(10);
    expect(healer.table.threatOf("boss")).toBe(10);
    expect(dps.table.threatOf("boss")).toBe(10);
  });

  test("different group is untouched", () => {
    const network = createAssistNetwork();
    const a = member("a", "raid1");
    const b = member("b", "raid2");
    network.register(a);
    network.register(b);

    const assisters = network.addThreat("a", "boss", 10);

    expect(assisters).toEqual([]);
    expect(a.table.threatOf("boss")).toBe(10);
    expect(b.table.threatOf("boss")).toBe(0);
  });

  test("shareFraction scales the propagated amount", () => {
    const network = createAssistNetwork({ shareFraction: 0.5 });
    const puller = member("puller", "raid");
    const assister = member("assister", "raid");
    network.register(puller);
    network.register(assister);

    network.addThreat("puller", "boss", 10);

    expect(puller.table.threatOf("boss")).toBe(10);
    expect(assister.table.threatOf("boss")).toBe(5);
  });

  test("shareFraction of 0 disables propagation", () => {
    const network = createAssistNetwork({ shareFraction: 0 });
    const puller = member("puller", "raid");
    const assister = member("assister", "raid");
    network.register(puller);
    network.register(assister);

    const assisters = network.addThreat("puller", "boss", 10);

    expect(assisters).toEqual([]);
    expect(puller.table.threatOf("boss")).toBe(10);
    expect(assister.table.threatOf("boss")).toBe(0);
  });

  test("assister that already had threat accumulates on top", () => {
    const network = createAssistNetwork();
    const puller = member("puller", "raid");
    const assister = member("assister", "raid");
    assister.table.add("boss", 20);
    network.register(puller);
    network.register(assister);

    network.addThreat("puller", "boss", 10);

    expect(assister.table.threatOf("boss")).toBe(30);
  });
});

describe("group assist proximity gating", () => {
  test("radius and distanceBetween restrict assistance to nearby members", () => {
    const distances: Record<string, number> = {
      "puller:near": 5,
      "puller:far": 50,
    };
    const network = createAssistNetwork({
      radius: 10,
      distanceBetween: (a, b) => distances[`${a}:${b}`] ?? Number.POSITIVE_INFINITY,
    });
    const puller = member("puller", "raid");
    const near = member("near", "raid");
    const far = member("far", "raid");
    network.register(puller);
    network.register(near);
    network.register(far);

    const assisters = network.addThreat("puller", "boss", 10);

    expect(assisters).toEqual(["near"]);
    expect(near.table.threatOf("boss")).toBe(10);
    expect(far.table.threatOf("boss")).toBe(0);
  });

  test("assistersOf respects radius gating without addThreat", () => {
    const distances: Record<string, number> = {
      "puller:near": 5,
      "puller:far": 50,
    };
    const network = createAssistNetwork({
      radius: 10,
      distanceBetween: (a, b) => distances[`${a}:${b}`] ?? Number.POSITIVE_INFINITY,
    });
    network.register(member("puller", "raid"));
    network.register(member("near", "raid"));
    network.register(member("far", "raid"));

    expect(network.assistersOf("puller")).toEqual(["near"]);
  });

  test("no radius configured means the whole group assists regardless of distanceBetween", () => {
    const network = createAssistNetwork({
      distanceBetween: () => 9999,
    });
    network.register(member("a", "raid"));
    network.register(member("b", "raid"));

    expect(network.assistersOf("a")).toEqual(["b"]);
  });

  test("no distanceBetween configured means the whole group assists regardless of radius", () => {
    const network = createAssistNetwork({ radius: 1 });
    network.register(member("a", "raid"));
    network.register(member("b", "raid"));

    expect(network.assistersOf("a")).toEqual(["b"]);
  });
});

describe("group assist membership management", () => {
  test("register upserts by id, replacing groupId and table", () => {
    const network = createAssistNetwork();
    const a = member("a", "raid1");
    const b = member("b", "raid1");
    network.register(a);
    network.register(b);
    expect(network.assistersOf("a")).toEqual(["b"]);

    network.register({ id: "a", groupId: "raid2", table: createThreatTable() });

    expect(network.assistersOf("a")).toEqual([]);
    expect(network.memberIds("raid1")).toEqual(["b"]);
    expect(network.memberIds("raid2")).toEqual(["a"]);
  });

  test("remove stops a member from assisting or being assisted", () => {
    const network = createAssistNetwork();
    const a = member("a", "raid");
    const b = member("b", "raid");
    network.register(a);
    network.register(b);

    network.remove("b");

    expect(network.assistersOf("a")).toEqual([]);
    expect(network.memberIds()).toEqual(["a"]);
    const assisters = network.addThreat("a", "boss", 10);
    expect(assisters).toEqual([]);
    expect(b.table.threatOf("boss")).toBe(0);
  });

  test("memberIds returns registration order, optionally filtered by group", () => {
    const network = createAssistNetwork();
    network.register(member("c", "raid1"));
    network.register(member("a", "raid2"));
    network.register(member("b", "raid1"));

    expect(network.memberIds()).toEqual(["c", "a", "b"]);
    expect(network.memberIds("raid1")).toEqual(["c", "b"]);
  });

  test("assistersOf returns empty array for an unknown member", () => {
    const network = createAssistNetwork();
    network.register(member("a", "raid"));

    expect(network.assistersOf("ghost")).toEqual([]);
  });
});

describe("group assist addThreat no-ops", () => {
  test("amount <= 0 is a no-op", () => {
    const network = createAssistNetwork();
    const a = member("a", "raid");
    const b = member("b", "raid");
    network.register(a);
    network.register(b);

    expect(network.addThreat("a", "boss", 0)).toEqual([]);
    expect(network.addThreat("a", "boss", -5)).toEqual([]);
    expect(a.table.threatOf("boss")).toBe(0);
    expect(b.table.threatOf("boss")).toBe(0);
  });

  test("unknown member is a no-op", () => {
    const network = createAssistNetwork();
    network.register(member("a", "raid"));

    expect(network.addThreat("ghost", "boss", 10)).toEqual([]);
  });
});
