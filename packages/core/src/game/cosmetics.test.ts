import { describe, expect, test } from "bun:test";

import { createGameEvents } from "./events";
import { createCosmetics } from "./cosmetics";

describe("cosmetics", () => {
  test("apply merges a registered loadout's slots and emits a change event", () => {
    const events = createGameEvents();
    const changes: { userId: string; slots: Record<string, string> }[] = [];
    events.on("cosmetics.changed", (event) => void changes.push(event));
    const cosmetics = createCosmetics({ events });
    cosmetics.register({
      default_hero: { slots: { skin: "hero_bronze", back: "cape_red" } },
    });

    expect(cosmetics.has("default_hero")).toBe(true);
    expect(cosmetics.apply("alice", "default_hero")).toBeNull();
    expect(cosmetics.get("alice")).toEqual({ skin: "hero_bronze", back: "cape_red" });
    expect(changes).toEqual([{ userId: "alice", slots: { skin: "hero_bronze", back: "cape_red" } }]);
  });

  test("apply rejects an unknown loadout id", () => {
    const cosmetics = createCosmetics();
    expect(cosmetics.apply("alice", "missing")).toEqual({ reason: 'unknown cosmetic loadout "missing"' });
  });

  test("equip sets or clears a single slot without touching the rest", () => {
    const cosmetics = createCosmetics();
    cosmetics.equip("alice", "skin", "hero_bronze");
    cosmetics.equip("alice", "hat", "party_hat");
    expect(cosmetics.get("alice")).toEqual({ skin: "hero_bronze", hat: "party_hat" });

    cosmetics.equip("alice", "hat", null);
    expect(cosmetics.get("alice")).toEqual({ skin: "hero_bronze" });
  });

  test("get returns an empty object for a user with no cosmetics", () => {
    const cosmetics = createCosmetics();
    expect(cosmetics.get("bob")).toEqual({});
  });

  test("snapshot and hydrate round-trip a user's cosmetics", () => {
    const cosmetics = createCosmetics();
    cosmetics.equip("alice", "skin", "hero_bronze");
    const snapshot = cosmetics.snapshot("alice");

    const restored = createCosmetics();
    restored.hydrate("alice", snapshot);
    expect(restored.get("alice")).toEqual({ skin: "hero_bronze" });
  });
});
