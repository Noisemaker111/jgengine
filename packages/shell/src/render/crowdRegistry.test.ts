import { describe, expect, test } from "bun:test";

import type { ModelConfig } from "@jgengine/core/game/playableGame";

import {
  CharacterCrowdRegistry,
  crowdClipForSpeed,
  crowdClipsOf,
  crowdEligible,
  crowdKindOf,
  crowdSpeedBandsOf,
} from "./crowdRegistry";

const character: ModelConfig = {
  url: "kaykit-adventurers/Rogue",
  targetHeight: 1.8,
  animation: { states: { idle: "Idle", walk: "Walking_A", run: "Running_A" } },
};

const guest: ModelConfig = { url: "brightway-park/guest_a", scale: 1, anchor: "origin" };

describe("crowdKindOf", () => {
  test("one key per rig a batch can share, distinct for a different tint or height", () => {
    expect(crowdKindOf(character)).toBe(crowdKindOf({ ...character }));
    expect(crowdKindOf(character)).not.toBe(crowdKindOf({ ...character, targetHeight: 2 }));
    expect(crowdKindOf(character)).not.toBe(crowdKindOf({ ...character, material: { color: "#ff0000" } }));
  });

  test("two characters of different models never share a batch", () => {
    expect(crowdKindOf(guest)).not.toBe(crowdKindOf({ ...guest, url: "brightway-park/guest_b" }));
  });
});

describe("crowdEligible", () => {
  test("takes plain rigs and static characters, and refuses the models that need their own rig", () => {
    expect(crowdEligible(character)).toBe(true);
    expect(crowdEligible({ ...character, lod: {} })).toBe(true);
    expect(crowdEligible({ ...character, lod: false })).toBe(false);
    expect(crowdEligible({ ...character, ik: "auto" })).toBe(false);
    expect(crowdEligible({ ...character, attachments: [] })).toBe(false);
    expect(crowdEligible(undefined)).toBe(false);
  });

  test("a character with no animation at all batches: it has no playback to lose", () => {
    expect(crowdEligible(guest)).toBe(true);
    expect(crowdEligible({ ...guest, animation: "none" })).toBe(true);
  });

  test("per-entity rendering a batch cannot reproduce keeps the character on its own rig", () => {
    expect(crowdEligible({ ...guest, surfaceDetail: false })).toBe(false);
    expect(crowdEligible({ ...guest, wind: {} })).toBe(false);
    expect(crowdEligible({ ...guest, hiddenNodes: ["Sword"] })).toBe(false);
    expect(crowdEligible({ ...guest, hiddenNodes: [] })).toBe(true);
    expect(crowdEligible({ ...guest, parts: [] })).toBe(false);
    expect(crowdEligible({ ...guest, materialAssignments: [{ materialId: "a", selector: { mesh: "Body" } }] })).toBe(false);
  });
});

describe("crowd clips", () => {
  test("bakes the rig's own idle, walk and run", () => {
    expect(crowdClipsOf(character, ["Idle", "Walking_A", "Running_A", "Death"])).toEqual(["Idle", "Walking_A", "Running_A"]);
  });

  test("falls back to idle when the pack has no walk, and bakes nothing without a match", () => {
    expect(crowdClipsOf(character, ["Idle"])).toEqual(["Idle"]);
    expect(crowdClipsOf(character, ["Death"])).toEqual([]);
  });

  test("a static character bakes no clips", () => {
    expect(crowdClipsOf(guest, [])).toEqual([]);
  });

  test("picks a clip by ground speed", () => {
    const clips = ["Idle", "Walk", "Run"];
    expect(crowdClipForSpeed(clips, 0)).toBe("Idle");
    expect(crowdClipForSpeed(clips, 1.5)).toBe("Walk");
    expect(crowdClipForSpeed(clips, 4)).toBe("Run");
    expect(crowdClipForSpeed(["Idle"], 4)).toBe("Idle");
    expect(crowdClipForSpeed([], 1)).toBeUndefined();
  });

  test("uses the model's own walk and run speed, not the engine defaults", () => {
    const slow: ModelConfig = { ...character, animation: { states: { idle: "Idle", walk: "Walking_A", walkSpeed: 0.1 } } };
    const bands = crowdSpeedBandsOf(slow, ["Idle", "Walking_A"]);
    expect(bands).toEqual({ walk: 0.1, run: 2.6 });
    expect(crowdClipForSpeed(["Idle", "Walking_A"], 0.2, bands)).toBe("Walking_A");
    expect(crowdClipForSpeed(["Idle", "Walking_A"], 0.05, bands)).toBe("Idle");
  });
});

describe("CharacterCrowdRegistry", () => {
  test("records the current pose per kind and forgets a character that went back to its rig", () => {
    const registry = new CharacterCrowdRegistry();
    registry.set("ped_1", "kind-a", { x: 1, y: 0, z: 2, rotationY: 0, speed: 1 });
    registry.set("ped_2", "kind-a", { x: 3, y: 0, z: 4, rotationY: 0, speed: 0 });
    registry.set("ped_3", "kind-b", { x: 5, y: 0, z: 6, rotationY: 0, speed: 2 });
    expect(registry.count("kind-a")).toBe(2);
    expect(registry.count("kind-b")).toBe(1);

    const seen: string[] = [];
    registry.forEach("kind-a", (id, member) => seen.push(`${id}:${member.x}`));
    expect(seen).toEqual(["ped_1:1", "ped_2:3"]);

    registry.set("ped_1", "kind-a", { x: 10, y: 0, z: 2, rotationY: 0, speed: 1 });
    const positions: number[] = [];
    registry.forEach("kind-a", (id, member) => {
      if (id === "ped_1") positions.push(member.x);
    });
    expect(positions).toEqual([10]);

    registry.delete("ped_1");
    expect(registry.count("kind-a")).toBe(1);
    registry.clear();
    expect(registry.count("kind-a")).toBe(0);
  });

  test("a batch only takes what its declared capacity can draw; the rest keep their own rig", () => {
    const registry = new CharacterCrowdRegistry();
    registry.setCapacity("kind-a", 2);
    expect(registry.claim("a", "kind-a", { x: 0, y: 0, z: 0, rotationY: 0, speed: 0 })).toBe(true);
    expect(registry.claim("b", "kind-a", { x: 1, y: 0, z: 0, rotationY: 0, speed: 0 })).toBe(true);
    expect(registry.claim("c", "kind-a", { x: 2, y: 0, z: 0, rotationY: 0, speed: 0 })).toBe(false);
    expect(registry.count("kind-a")).toBe(2);

    // A claimed member keeps updating past the cap; only new members are refused.
    expect(registry.claim("a", "kind-a", { x: 9, y: 0, z: 0, rotationY: 0, speed: 1 })).toBe(true);
    expect(registry.claim("c", "kind-a", { x: 2, y: 0, z: 0, rotationY: 0, speed: 0 })).toBe(false);

    // A member leaving frees its slot for the next character of that kind.
    registry.delete("b");
    expect(registry.claim("c", "kind-a", { x: 2, y: 0, z: 0, rotationY: 0, speed: 0 })).toBe(true);
    expect(registry.count("kind-a")).toBe(2);
    expect(registry.kindOf("c")).toBe("kind-a");
    expect(registry.kindOf("b")).toBeUndefined();
  });

  test("a batch declares the geometry picking should use, and drops it when it unmounts", () => {
    const registry = new CharacterCrowdRegistry();
    const geometry = new (class {})() as never;
    registry.setGeometry("kind-a", { geometry, position: [0, 0, 0], scale: 1 });
    expect(registry.geometry("kind-a")?.geometry).toBe(geometry);
    registry.setGeometry("kind-a", undefined);
    expect(registry.geometry("kind-a")).toBeUndefined();
  });
});
