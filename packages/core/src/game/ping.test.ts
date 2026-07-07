import { describe, expect, it } from "bun:test";
import type { PointerHit } from "../input/pointer";
import { createMarkerSet } from "../world/markers";
import {
  classifyPing,
  createPingSystem,
  DEFAULT_PING_CATEGORIES,
  PING_FEED_ACTION,
} from "./ping";

function hit(over: Partial<PointerHit>): PointerHit {
  return {
    point: [1, 0, 2],
    normal: [0, 1, 0],
    entity: null,
    object: null,
    ...over,
  };
}

describe("classifyPing", () => {
  it("classifies a hostile entity as enemy", () => {
    const category = classifyPing(hit({ entity: "mob-1" }), {
      roleOf: () => "enemy",
    });
    expect(category).toBe("enemy");
  });

  it("classifies a friendly/npc entity as a location", () => {
    expect(classifyPing(hit({ entity: "npc-1" }), { roleOf: () => "npc" })).toBe("location");
  });

  it("reads an object's catalog category, defaulting to location", () => {
    const deps = { categoryOf: (id: string) => (id === "chest-1" ? "loot" : null) };
    expect(classifyPing(hit({ object: "chest-1" }), deps)).toBe("loot");
    expect(classifyPing(hit({ object: "rock-1" }), deps)).toBe("location");
  });

  it("classifies open ground as a location", () => {
    expect(classifyPing(hit({}))).toBe("location");
  });

  it("honors custom hostile roles", () => {
    expect(
      classifyPing(hit({ entity: "boss" }), { roleOf: () => "elite" }, { hostileRoles: ["elite"] }),
    ).toBe("enemy");
  });
});

describe("ping system broadcast", () => {
  it("builds a payload from the hit and party membership", () => {
    const markers = createMarkerSet(() => 1000);
    const feed: { action: string; entry: unknown }[] = [];
    const system = createPingSystem({
      markers,
      feed: { push: (action, entry) => feed.push({ action, entry }) },
      party: { membersOf: () => ["me", "ally-1", "ally-2"] },
      now: () => 1000,
      classify: { roleOf: () => "enemy" },
    });
    const payload = system.buildPayload("me", hit({ entity: "mob-1" }));
    expect(payload.category).toBe("enemy");
    expect(payload.from).toBe("me");
    expect(payload.position).toEqual([1, 0, 2]);
    expect(payload.callout).toBe(DEFAULT_PING_CATEGORIES.enemy!.callout);
    expect(payload.recipients).toEqual(["ally-1", "ally-2"]);
  });

  it("ping() adds a categorized marker and pushes to the party feed", () => {
    const markers = createMarkerSet(() => 500);
    const feed: { action: string; entry: unknown }[] = [];
    const system = createPingSystem({
      markers,
      feed: { push: (action, entry) => feed.push({ action, entry }) },
      now: () => 500,
      ttlMs: 8000,
      classify: { categoryOf: () => "loot" },
    });
    const payload = system.ping("me", hit({ object: "chest-1" }));
    const marker = markers.get(payload.id);
    expect(marker).not.toBeNull();
    expect(marker!.kind).toBe("loot");
    expect(marker!.owner).toBe("me");
    expect(marker!.expiresAt).toBe(8500);
    expect(feed).toHaveLength(1);
    expect(feed[0]!.action).toBe(PING_FEED_ACTION);
    expect(feed[0]!.entry).toBe(payload);
  });

  it("allows an explicit category override (ping wheel selection)", () => {
    const markers = createMarkerSet();
    const system = createPingSystem({ markers, feed: { push: () => undefined } });
    const payload = system.ping("me", hit({}), "danger");
    expect(payload.category).toBe("danger");
    expect(markers.get(payload.id)!.kind).toBe("danger");
  });

  it("expires party markers via prune", () => {
    const markers = createMarkerSet(() => 0);
    const system = createPingSystem({
      markers,
      feed: { push: () => undefined },
      now: () => 0,
      ttlMs: 1000,
    });
    system.ping("me", hit({}), "location");
    expect(markers.prune(500)).toBe(0);
    expect(markers.prune(1500)).toBe(1);
  });
});
