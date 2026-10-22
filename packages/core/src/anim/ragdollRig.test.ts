import { describe, expect, test } from "bun:test";

import { PhysicsWorld } from "../physics/physicsWorld";
import { createRagdoll } from "../physics/ragdoll";
import { KAYKIT_SCHEME, SKELETON_SLOTS, mapRigToStandard, type SkeletonSlot } from "./skeletonStandard";
import { HUMANOID_RAGDOLL_BODIES, ragdollBoneOrientations, ragdollConfigFromPoses, type RagdollPose } from "./ragdollRig";

const BONES = [
  "root",
  "hips",
  "spine",
  "chest",
  "head",
  "upperarm.l",
  "upperarm.r",
  "lowerarm.l",
  "lowerarm.r",
  "hand.l",
  "hand.r",
  "handslot.l",
  "handslot.r",
  "upperleg.l",
  "upperleg.r",
  "lowerleg.l",
  "lowerleg.r",
  "foot.l",
  "foot.r",
  "toes.l",
  "toes.r",
];

const MAP = mapRigToStandard(BONES, KAYKIT_SCHEME);

/** A standing humanoid pose: hips at 0.95, feet on the ground, arms out. */
function standingPose(): RagdollPose[] {
  const at = (slot: SkeletonSlot, position: readonly [number, number, number]): RagdollPose => ({ slot, position, orientation: [0, 0, 0, 1] });
  return [
    at("root", [0, 0, 0]),
    at("hips", [0, 0.95, 0]),
    at("spine", [0, 1.1, 0]),
    at("chest", [0, 1.35, 0]),
    at("head", [0, 1.7, 0]),
    at("upperArm.l", [0.2, 1.4, 0]),
    at("lowerArm.l", [0.45, 1.35, 0]),
    at("hand.l", [0.65, 1.3, 0]),
    at("handSlot.l", [0.7, 1.3, 0]),
    at("upperArm.r", [-0.2, 1.4, 0]),
    at("lowerArm.r", [-0.45, 1.35, 0]),
    at("hand.r", [-0.65, 1.3, 0]),
    at("handSlot.r", [-0.7, 1.3, 0]),
    at("upperLeg.l", [0.12, 0.9, 0]),
    at("lowerLeg.l", [0.12, 0.5, 0]),
    at("foot.l", [0.12, 0.08, 0]),
    at("toes.l", [0.12, 0.04, 0.15]),
    at("upperLeg.r", [-0.12, 0.9, 0]),
    at("lowerLeg.r", [-0.12, 0.5, 0]),
    at("foot.r", [-0.12, 0.08, 0]),
    at("toes.r", [-0.12, 0.04, 0.15]),
  ];
}

describe("ragdollConfigFromPoses", () => {
  test("one body per shaped slot, linked to its parent, with prop sockets left out", () => {
    const config = ragdollConfigFromPoses(MAP, standingPose());
    const names = config.bones.map((bone) => bone.name);
    expect(names).toContain("hips");
    expect(names).toContain("toes.r");
    expect(names).not.toContain("handSlot.l");
    expect(names).not.toContain("handSlot.r");
    expect(names).toHaveLength(Object.keys(HUMANOID_RAGDOLL_BODIES).length);
    // Every body except the root has exactly one link to its nearest shaped ancestor.
    expect(config.links).toHaveLength(config.bones.length - 1);
    expect(config.links.every((link) => link.kind === "distance")).toBe(true);
    expect(config.links.some((link) => link.a === "chest" && link.b === "head")).toBe(true);
    expect(config.links.some((link) => link.b === "hips")).toBe(true);
    expect(config.links.some((link) => link.b === "root")).toBe(false);
  });

  test("bodies start where the character was, and scale resizes them", () => {
    const pose = standingPose();
    const config = ragdollConfigFromPoses(MAP, pose, { scale: 1.5 });
    const head = config.bones.find((bone) => bone.name === "head")!;
    expect(head.position).toEqual([0, 1.7, 0]);
    expect(head.halfExtents[0]).toBeCloseTo(0.09 * 1.5, 9);
    const tall = ragdollConfigFromPoses(MAP, pose, { bodies: { head: { halfExtents: [1, 1, 1], mass: 2 } } });
    expect(tall.bones.find((bone) => bone.name === "head")!.mass).toBe(2);
  });

  test("a slot the rig lacks is skipped and its child links to the nearest present ancestor", () => {
    const armless = mapRigToStandard(["root", "hips", "spine", "chest", "head"], KAYKIT_SCHEME);
    const config = ragdollConfigFromPoses(armless, standingPose());
    expect(config.bones.map((bone) => bone.name)).toEqual(["root", "hips", "spine", "chest", "head"]);
    expect(config.links).toEqual([
      { a: "root", b: "hips", kind: "distance" },
      { a: "hips", b: "spine", kind: "distance" },
      { a: "spine", b: "chest", kind: "distance" },
      { a: "chest", b: "head", kind: "distance" },
    ]);
  });

  test("a pose missing a bone leaves that body out rather than guessing a position", () => {
    const config = ragdollConfigFromPoses(MAP, standingPose().filter((pose) => pose.slot !== "head"));
    expect(config.bones.map((bone) => bone.name)).not.toContain("head");
  });
});

describe("ragdollBoneOrientations", () => {
  const rest = standingPose();
  const poseOf = (slot: SkeletonSlot) => rest.find((entry) => entry.slot === slot)!;

  test("a bone aims at its child's new position while keeping its death-pose roll", () => {
    const positions: Partial<Record<SkeletonSlot, readonly [number, number, number]>> = {};
    for (const entry of rest) positions[entry.slot] = entry.position;
    // Bend the left knee 90 degrees: the thigh now points straight down.
    positions["lowerLeg.l"] = [0.12, 0.9, -0.4];
    const orientations = ragdollBoneOrientations(rest, positions);
    const thigh = orientations["upperLeg.l"]!;
    // Rest direction is (0, -0.4, 0); the new one is (0, 0, -0.4): a quarter turn about +X.
    expect(thigh[0]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(thigh[1]).toBeCloseTo(0, 6);
    expect(thigh[2]).toBeCloseTo(0, 6);
    expect(thigh[3]).toBeCloseTo(Math.SQRT1_2, 6);
    // A bone whose direction did not change keeps its rest orientation.
    expect(orientations.hips).toEqual([0, 0, 0, 1]);
    expect(orientations["toes.r"]).toEqual(poseOf("toes.r").orientation);
  });

  test("a bone with no posed child, or a collapsed direction, keeps its rest orientation", () => {
    const positions: Partial<Record<SkeletonSlot, readonly [number, number, number]>> = {};
    for (const entry of rest) positions[entry.slot] = entry.position;
    positions["lowerLeg.r"] = positions["upperLeg.r"];
    const orientations = ragdollBoneOrientations(rest, positions);
    expect(orientations["upperLeg.r"]).toEqual([0, 0, 0, 1]);
    expect(orientations["hand.r"]).toEqual(poseOf("hand.r").orientation);
  });

  test("a body with no position this frame keeps its rest orientation", () => {
    const positions: Partial<Record<SkeletonSlot, readonly [number, number, number]>> = { hips: [0, 0.5, 0] };
    const orientations = ragdollBoneOrientations(rest, positions);
    expect(orientations.head).toEqual(poseOf("head").orientation);
  });
});

describe("a ragdoll built from a rig", () => {
  const BOUNDS = { min: [-20, 0, -20] as const, max: [20, 20, 20] as const };

  test("the body collapses to the floor and its joints hold the bones together", () => {
    const world = new PhysicsWorld({ capacity: 64, bounds: BOUNDS, sleepThresholdSteps: 100000 });
    const pose = standingPose();
    const config = ragdollConfigFromPoses(MAP, pose);
    const ragdoll = createRagdoll(world, config);
    for (let frame = 0; frame < 240; frame += 1) world.step(1 / 60);
    const at = (slot: SkeletonSlot) => {
      const id = ragdoll.bones[slot]!;
      return [world.posX[id]!, world.posY[id]!, world.posZ[id]!] as const;
    };
    // The head fell from 1.7 to the floor, and the skeleton is still one piece.
    expect(at("head")[1]).toBeLessThan(1.2);
    const restSeparation = (a: SkeletonSlot, b: SkeletonSlot) => {
      const pa = pose.find((entry) => entry.slot === a)!.position;
      const pb = pose.find((entry) => entry.slot === b)!.position;
      return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
    };
    const separation = (a: SkeletonSlot, b: SkeletonSlot) => {
      const pa = at(a);
      const pb = at(b);
      return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
    };
    const report: string[] = [];
    for (const [a, b] of [["hips", "chest"], ["chest", "head"], ["hips", "upperLeg.l"], ["upperLeg.r", "lowerLeg.r"]] as [SkeletonSlot, SkeletonSlot][]) {
      const rest = restSeparation(a, b);
      const now = separation(a, b);
      report.push(`${a}->${b} ${rest.toFixed(3)}->${now.toFixed(3)}`);
      // A distance joint holds the bones' separation; the collapse stretches it by well under half.
      expect(now).toBeGreaterThan(rest * 0.5);
      expect(now).toBeLessThan(rest * 1.5);
    }
    // The skeleton stays one cluster instead of the bones flying apart.
    const hips = at("hips");
    for (const slot of Object.keys(ragdoll.bones) as SkeletonSlot[]) {
      const point = at(slot);
      expect(Math.hypot(point[0] - hips[0], point[1] - hips[1], point[2] - hips[2])).toBeLessThan(1.6);
    }
    console.log(`ragdoll joint separations: ${report.join(" | ")}`);
  });

  test("bones the rig has no slot for are simply absent from the ragdoll", () => {
    const world = new PhysicsWorld({ capacity: 32, bounds: BOUNDS, sleepThresholdSteps: 100000 });
    const armless = mapRigToStandard(["root", "hips", "spine", "chest", "head"], KAYKIT_SCHEME);
    const ragdoll = createRagdoll(world, ragdollConfigFromPoses(armless, standingPose()));
    expect(Object.keys(ragdoll.bones).sort()).toEqual(["chest", "head", "hips", "root", "spine"]);
    expect(SKELETON_SLOTS).toContain("toes.r");
  });
});
