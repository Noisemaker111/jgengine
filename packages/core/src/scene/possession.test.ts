import { describe, expect, test } from "bun:test";

import { createGameEvents } from "../game/events";
import { createEntityStore } from "./entityStore";
import { createPossession } from "./possession";

describe("possession", () => {
  test("active defaults to the userId when nothing has been possessed", () => {
    const entities = createEntityStore();
    const possession = createPossession({ entities });
    expect(possession.active("alice")).toBe("alice");
    expect(possession.owns("alice", "alice")).toBe(true);
  });

  test("possess rejects entities the user does not own", () => {
    const entities = createEntityStore();
    entities.spawn("hero", { id: "alice", role: "player" });
    entities.spawn("wolf", { id: "wolf-1", role: "npc" });
    const possession = createPossession({ entities });

    expect(possession.possess("alice", "wolf-1")).toEqual({
      reason: 'entity "wolf-1" is not owned by "alice"',
    });
    expect(possession.active("alice")).toBe("alice");
  });

  test("possess swaps active control and flips entity roles, only for owned entities", () => {
    const entities = createEntityStore();
    entities.spawn("hero", { id: "alice", role: "player" });
    entities.spawn("wolf", { id: "wolf-1", role: "npc" });
    const events = createGameEvents();
    const swapped: { userId: string; entityId: string; previousEntityId: string }[] = [];
    events.on("possession.swapped", (event) => void swapped.push(event));

    const possession = createPossession({ entities, events });
    possession.own("alice", "wolf-1");
    expect(possession.owns("alice", "wolf-1")).toBe(true);
    expect(possession.listOwned("alice").sort()).toEqual(["alice", "wolf-1"].sort());

    expect(possession.possess("alice", "wolf-1")).toBeNull();
    expect(possession.active("alice")).toBe("wolf-1");
    expect(entities.get("wolf-1")?.role).toBe("player");
    expect(entities.get("alice")?.role).toBe("npc");
    expect(swapped).toEqual([{ userId: "alice", entityId: "wolf-1", previousEntityId: "alice" }]);

    expect(possession.possess("alice", "alice")).toBeNull();
    expect(possession.active("alice")).toBe("alice");
    expect(entities.get("alice")?.role).toBe("player");
    expect(entities.get("wolf-1")?.role).toBe("npc");
  });

  test("possessing the already-active entity is a no-op", () => {
    const entities = createEntityStore();
    entities.spawn("hero", { id: "alice", role: "player" });
    const possession = createPossession({ entities });
    expect(possession.possess("alice", "alice")).toBeNull();
    expect(possession.active("alice")).toBe("alice");
  });

  test("possess rejects an owned but unspawned entity", () => {
    const entities = createEntityStore();
    entities.spawn("hero", { id: "alice", role: "player" });
    const possession = createPossession({ entities });
    possession.own("alice", "ghost");
    expect(possession.possess("alice", "ghost")).toEqual({ reason: 'entity "ghost" is not spawned' });
  });

  test("disown clears active control if it was the active entity", () => {
    const entities = createEntityStore();
    entities.spawn("hero", { id: "alice", role: "player" });
    entities.spawn("wolf", { id: "wolf-1", role: "npc" });
    const possession = createPossession({ entities });
    possession.own("alice", "wolf-1");
    possession.possess("alice", "wolf-1");
    expect(possession.active("alice")).toBe("wolf-1");

    possession.disown("alice", "wolf-1");
    expect(possession.owns("alice", "wolf-1")).toBe(false);
    expect(possession.active("alice")).toBe("alice");
  });
});
