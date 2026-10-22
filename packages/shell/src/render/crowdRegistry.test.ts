import { describe, expect, test } from "bun:test";

import type { ModelConfig } from "@jgengine/core/game/playableGame";

import {
  CharacterCrowdRegistry,
  crowdClipForSpeed,
  crowdClipsOf,
  crowdEligible,
  crowdKindOf,
} from "./crowdRegistry";

const character: ModelConfig = {
  url: "kaykit-adventurers/Rogue",
  targetHeight: 1.8,
  animation: { states: { idle: "Idle", walk: "Walking_A", run: "Running_A" } },
};

describe("crowdKindOf", () => {
  test("one key per rig a batch can share, distinct for a different tint or height", () => {
    expect(crowdKindOf(character)).toBe(crowdKindOf({ ...character }));
    expect(crowdKindOf(character)).not.toBe(crowdKindOf({ ...character, targetHeight: 2 }));
    expect(crowdKindOf(character)).not.toBe(crowdKindOf({ ...character, material: { color: "#ff0000" } }));
  });
});

describe("crowdEligible", () => {
  test("takes plain animated rigs and refuses the models that need their own skeleton", () => {
    expect(crowdEligible(character)).toBe(true);
    expect(crowdEligible({ ...character, lod: {} })).toBe(true);
    expect(crowdEligible({ ...character, lod: false })).toBe(false);
    expect(crowdEligible({ ...character, animation: "none" })).toBe(false);
    expect(crowdEligible({ url: "kaykit-city-builder/car_sedan" })).toBe(false);
    expect(crowdEligible({ ...character, ik: "auto" })).toBe(false);
    expect(crowdEligible({ ...character, attachments: [] })).toBe(false);
    expect(crowdEligible(undefined)).toBe(false);
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

  test("picks a clip by ground speed", () => {
    const clips = ["Idle", "Walk", "Run"];
    expect(crowdClipForSpeed(clips, 0)).toBe("Idle");
    expect(crowdClipForSpeed(clips, 1.5)).toBe("Walk");
    expect(crowdClipForSpeed(clips, 4)).toBe("Run");
    expect(crowdClipForSpeed(["Idle"], 4)).toBe("Idle");
    expect(crowdClipForSpeed([], 1)).toBeUndefined();
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
});
