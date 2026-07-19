import { describe, expect, test } from "bun:test";

import {
  classifyClip,
  defaultAnimationForClips,
  resolveAnimationConfig,
  rolesFromClips,
  type ClipRoleTable,
} from "./clipRoles";

const KAYKIT_SKELETON = [
  "1H_Melee_Attack_Chop",
  "2H_Melee_Idle",
  "Cheer",
  "Death_A",
  "Death_A_Pose",
  "Hit_A",
  "Hit_B",
  "Idle",
  "Interact",
  "Jump_Full_Long",
  "Running_A",
  "Spawn_Ground",
  "Throw",
  "Walking_A",
  "Walking_B",
  "Walking_Backwards",
];

const QUATERNIUS = ["Idle", "Walk", "Run", "Death"];

describe("classifyClip", () => {
  test("KayKit vocabulary", () => {
    expect(classifyClip("Idle")).toBe("idle");
    expect(classifyClip("Walking_A")).toBe("walk");
    expect(classifyClip("Running_A")).toBe("run");
    expect(classifyClip("1H_Melee_Attack_Chop")).toBe("attack");
    expect(classifyClip("Hit_A")).toBe("hit");
    expect(classifyClip("Death_A")).toBe("death");
    expect(classifyClip("Jump_Full_Long")).toBe("jump");
    expect(classifyClip("Spawn_Ground")).toBe("spawn");
    expect(classifyClip("Interact")).toBe("interact");
    expect(classifyClip("Cheer")).toBe("cheer");
  });

  test("Quaternius / Blender-export vocabulary strips rig prefixes", () => {
    expect(classifyClip("Armature|Run")).toBe("run");
    expect(classifyClip("mixamo.com|Walk")).toBe("walk");
    expect(classifyClip("Walk")).toBe("walk");
  });

  test("matching is case-insensitive", () => {
    expect(classifyClip("IDLE")).toBe("idle");
    expect(classifyClip("walking_a")).toBe("walk");
  });

  test("held-pose variants are excluded", () => {
    expect(classifyClip("Death_A_Pose")).toBeNull();
  });

  test("multi-role names resolve by priority (action beats idle)", () => {
    expect(classifyClip("Idle_Attack")).toBe("attack");
    expect(classifyClip("2H_Melee_Idle")).toBe("idle");
  });

  test("unknown names return null", () => {
    expect(classifyClip("Barrel")).toBeNull();
    expect(classifyClip("Sit_Chair_Down")).toBeNull();
    expect(classifyClip("")).toBeNull();
  });

  test("a custom table overrides the default vocabulary", () => {
    const table: ClipRoleTable = { roles: { idle: ["breathe"] } };
    expect(classifyClip("Breathe_Loop", table)).toBe("idle");
    expect(classifyClip("Idle", table)).toBeNull();
  });
});

describe("rolesFromClips", () => {
  test("groups variants sorted lexicographically", () => {
    const roles = rolesFromClips(["Walking_B", "Walking_A", "Idle", "Hit_B", "Hit_A"]);
    expect(roles.walk).toEqual(["Walking_A", "Walking_B"]);
    expect(roles.hit).toEqual(["Hit_A", "Hit_B"]);
    expect(roles.idle).toEqual(["Idle"]);
  });

  test("output is independent of source order", () => {
    const shuffled = [...KAYKIT_SKELETON].reverse();
    expect(rolesFromClips(shuffled)).toEqual(rolesFromClips(KAYKIT_SKELETON));
  });
});

describe("defaultAnimationForClips", () => {
  test("KayKit skeleton gets full states plus one-shots", () => {
    const config = defaultAnimationForClips(KAYKIT_SKELETON);
    expect(config?.states).toEqual({ idle: "Idle", walk: "Walking_A", run: "Running_A" });
    expect(config?.oneShots?.hit).toEqual(["Hit_A", "Hit_B"]);
    expect(config?.oneShots?.death).toBe("Death_A");
    expect(config?.oneShots?.attack).toEqual(["Throw", "1H_Melee_Attack_Chop"]);
  });

  test("Quaternius set gets states and a death one-shot", () => {
    const config = defaultAnimationForClips(QUATERNIUS);
    expect(config?.states).toEqual({ idle: "Idle", walk: "Walk", run: "Run" });
    expect(config?.oneShots).toEqual({ death: "Death" });
  });

  test("idle-only rig loops idle for walk too", () => {
    expect(defaultAnimationForClips(["Idle"])?.states).toEqual({ idle: "Idle", walk: "Idle" });
  });

  test("no identifiable idle means no guess", () => {
    expect(defaultAnimationForClips(["SwingOpen", "SwingClose"])).toBeUndefined();
    expect(defaultAnimationForClips([])).toBeUndefined();
  });
});

describe("resolveAnimationConfig", () => {
  const clips = ["Idle", "Walking_A"];

  test("explicit config passes through untouched", () => {
    const explicit = { clip: "Idle", paused: true };
    expect(resolveAnimationConfig(explicit, clips)).toBe(explicit);
  });

  test('"none" and absent render the bind pose', () => {
    expect(resolveAnimationConfig("none", clips)).toBeUndefined();
    expect(resolveAnimationConfig(undefined, clips)).toBeUndefined();
  });

  test('"auto" derives from clip names', () => {
    expect(resolveAnimationConfig("auto", clips)?.states).toEqual({ idle: "Idle", walk: "Walking_A" });
  });

  test('"auto" without usable clips stays bind pose', () => {
    expect(resolveAnimationConfig("auto", undefined)).toBeUndefined();
    expect(resolveAnimationConfig("auto", [])).toBeUndefined();
    expect(resolveAnimationConfig("auto", ["Mystery"])).toBeUndefined();
  });
});
