import { ragdollConfigFromPoses, type RagdollPose } from "../../anim/ragdollRig";
import { SKELETON_SLOTS, type SkeletonSlot } from "../../anim/skeletonStandard";
import { PhysicsWorld, type PhysicsWorldConfig } from "../../physics/physicsWorld";
import { createRagdoll, type RagdollConfig } from "../../physics/ragdoll";
import { DE_LEVA_MALE } from "./anthropometry";
import { simulateFall, type FallReport } from "./humanFall";

/**
 * A `createRagdoll` body with the reference human's proportions and segment masses (de Leva 1996): head, torso,
 * pelvis, thighs, shanks and feet as boxes, held together by distance links like the engine's death ragdolls.
 * @capability human-ragdoll ragdoll config with real human segment sizes and masses for createRagdoll
 */
export function humanRagdollConfig(mass = 80, stature = 1.8): RagdollConfig {
  const t = DE_LEVA_MALE;
  const ls = stature / t.stature;
  const len = (p: { length: number }) => p.length * ls;
  const m = (p: { massShare: number }) => p.massShare * mass;
  const ankle = t.ankleHeight * ls;
  const shank = len(t.shank);
  const thigh = len(t.thigh);
  const hip = ankle + shank + thigh;
  const trunk = len(t.trunk);
  const head = len(t.head);
  const arms = 2 * (m(t.upperArm) + m(t.forearm) + m(t.hand));
  const torsoMass = m(t.trunk) * 0.6 + arms;
  const pelvisMass = m(t.trunk) * 0.4;
  const bones: RagdollConfig["bones"] = [
    { name: "head", position: [0, hip + trunk + head / 2, 0], halfExtents: [0.08 * ls, head / 2, 0.1 * ls], mass: m(t.head) },
    { name: "torso", position: [0, hip + trunk * 0.7, 0], halfExtents: [0.18 * ls, trunk * 0.3, 0.11 * ls], mass: torsoMass },
    { name: "pelvis", position: [0, hip + trunk * 0.2, 0], halfExtents: [0.16 * ls, trunk * 0.2, 0.1 * ls], mass: pelvisMass },
  ];
  const links: RagdollConfig["links"] = [
    { a: "head", b: "torso" },
    { a: "torso", b: "pelvis" },
  ];
  for (const [side, x] of [["right", 0.09 * ls], ["left", -0.09 * ls]] as const) {
    bones.push({ name: `${side}Thigh`, position: [x, hip - thigh / 2, 0], halfExtents: [0.07 * ls, thigh / 2, 0.07 * ls], mass: m(t.thigh) });
    bones.push({ name: `${side}Shank`, position: [x, ankle + shank / 2, 0], halfExtents: [0.05 * ls, shank / 2, 0.05 * ls], mass: m(t.shank) });
    bones.push({ name: `${side}Foot`, position: [x, ankle / 2, 0.06 * ls], halfExtents: [0.05 * ls, ankle / 2, len(t.foot) / 2], mass: m(t.foot) });
    links.push({ a: "pelvis", b: `${side}Thigh` });
    links.push({ a: `${side}Thigh`, b: `${side}Shank` });
    links.push({ a: `${side}Shank`, b: `${side}Foot` });
  }
  return { bones, links };
}

const STANDING: readonly [SkeletonSlot, number, number, number][] = [
  ["root", 0, 0, 0],
  ["hips", 0, 0.95, 0],
  ["spine", 0, 1.1, 0],
  ["chest", 0, 1.35, 0],
  ["head", 0, 1.7, 0],
  ["upperArm.l", 0.2, 1.4, 0],
  ["lowerArm.l", 0.2, 1.15, 0],
  ["hand.l", 0.2, 0.9, 0],
  ["upperArm.r", -0.2, 1.4, 0],
  ["lowerArm.r", -0.2, 1.15, 0],
  ["hand.r", -0.2, 0.9, 0],
  ["upperLeg.l", 0.12, 0.9, 0],
  ["lowerLeg.l", 0.12, 0.5, 0],
  ["foot.l", 0.12, 0.08, 0],
  ["toes.l", 0.12, 0.04, 0.15],
  ["upperLeg.r", -0.12, 0.9, 0],
  ["lowerLeg.r", -0.12, 0.5, 0],
  ["foot.r", -0.12, 0.08, 0],
  ["toes.r", -0.12, 0.04, 0.15],
];

/**
 * The ragdoll a game gets when a standing humanoid dies: `ragdollConfigFromPoses` on a full standard rig in a standing
 * pose, `stature` m tall, with the engine's stock `HUMANOID_RAGDOLL_BODIES`.
 * @capability stock-humanoid-ragdoll the engine's default humanoid death ragdoll, standing, for measuring falls
 */
export function stockHumanoidRagdoll(stature = 1.8): RagdollConfig {
  const scale = stature / 1.8;
  const poses: RagdollPose[] = STANDING.map(([slot, x, y, z]) => ({ slot, position: [x * scale, y * scale, z * scale], orientation: [0, 0, 0, 1] }));
  const slots: Partial<Record<SkeletonSlot, string>> = {};
  for (const slot of SKELETON_SLOTS) slots[slot] = slot;
  return ragdollConfigFromPoses({ scheme: "standard", slots, missing: [], unmapped: [] }, poses, { scale });
}

/** Settings for {@link measureRagdollFall}. */
export interface RagdollFallOptions {
  /** `PhysicsWorld` settings the game uses (gravity is set to Earth's for the comparison). */
  world?: Partial<Omit<PhysicsWorldConfig, "capacity" | "bounds" | "gravity">>;
  /** Ragdoll to drop (default {@link stockHumanoidRagdoll}). The `head` bone and the `pelvis` (or `hips`) bone are read. */
  ragdoll?: RagdollConfig;
  /** Starting rotation rate backwards about the feet, rad/s (default 0.3). */
  push?: number;
  /** Height the lowest bone starts above the floor, m (default 0). */
  dropHeight?: number;
  /** Frame step the game advances the world by, s (default 1/60). */
  frame?: number;
}

/**
 * Topple or drop a game ragdoll in a `PhysicsWorld` and measure it like {@link simulateFall}: head and pelvis impact
 * speed and time, peak head and pelvis force from each bone's momentum change, foot force from the whole body's
 * momentum change (split over two feet), and HIC15 from the head's acceleration. Sampled once per frame, as a game sees it.
 * @capability ragdoll-fall-metrics measure a game ragdoll's fall: impact speeds, forces and head injury criterion
 */
export function measureRagdollFall(options: RagdollFallOptions = {}): FallReport {
  const frame = options.frame ?? 1 / 60;
  const world = new PhysicsWorld({ capacity: 64, bounds: { min: [-20, 0, -20], max: [20, 20, 20] }, sleepThresholdSteps: 1e9, ...options.world, gravity: -9.81 });
  const config = options.ragdoll ?? stockHumanoidRagdoll();
  const drop = options.dropHeight ?? 0;
  const lowest = Math.min(...config.bones.map((b) => b.position[1] - b.halfExtents[1]));
  const bones = config.bones.map((b) => ({ ...b, position: [b.position[0], b.position[1] - lowest + drop + 0.001, b.position[2]] as const }));
  const rag = createRagdoll(world, { ...config, bones });
  const push = options.push ?? 0.3;
  if (drop === 0) {
    // Rigid rotation backwards (−z) about the feet: each bone moves at ω × its height.
    for (const b of bones) {
      const id = rag.bones[b.name];
      if (id !== undefined) world.velZ[id] = -push * b.position[1];
    }
  }
  const id = (name: string) => rag.bones[name];
  const head = id("head");
  const pelvisName = rag.bones["pelvis"] === undefined ? "hips" : "pelvis";
  const pelvis = id(pelvisName);
  const massOf = (bone: number) => {
    const im = world.invMass[bone] ?? 0;
    return im > 0 ? 1 / im : 0;
  };
  const total = Object.values(rag.bones).reduce((sum, bone) => sum + massOf(bone), 0);
  const report: FallReport = { pelvisTime: Number.NaN, headTime: Number.NaN, pelvisImpactSpeed: Number.NaN, headImpactSpeed: Number.NaN, peakPelvisForce: 0, peakHeadForce: 0, peakFootForce: 0, hic15: 0, peakFemurForce: Number.NaN };
  const halfHeight = (name: string) => config.bones.find((b) => b.name === name)?.halfExtents[1] ?? 0;
  const velocity = (bone: number): [number, number, number] => [world.velX[bone] ?? 0, world.velY[bone] ?? 0, world.velZ[bone] ?? 0];
  let lastHead = head === undefined ? [0, 0, 0] : velocity(head);
  let lastPelvis = pelvis === undefined ? [0, 0, 0] : velocity(pelvis);
  let lastMomentum = 0;
  const headAccel: number[] = [];
  let footDown = Number.NaN;
  for (let step = 0; step * frame < 3; step++) {
    const time = step * frame;
    world.step(frame);
    let momentum = 0;
    for (const bone of Object.values(rag.bones)) momentum += massOf(bone) * (world.velY[bone] ?? 0);
    const ground = (momentum - lastMomentum) / frame + total * 9.81;
    lastMomentum = momentum;
    if (head !== undefined) {
      const v = velocity(head);
      const dv = Math.hypot(v[0] - (lastHead[0] ?? 0), v[1] - (lastHead[1] ?? 0), v[2] - (lastHead[2] ?? 0)) / frame;
      headAccel.push(dv / 9.81);
      const touching = (world.posY[head] ?? 0) - halfHeight("head") < 0.05;
      if (touching) {
        if (Number.isNaN(report.headTime)) {
          report.headTime = time;
          report.headImpactSpeed = Math.hypot(lastHead[0] ?? 0, lastHead[1] ?? 0, lastHead[2] ?? 0);
        }
        report.peakHeadForce = Math.max(report.peakHeadForce, massOf(head) * dv);
      }
      lastHead = v;
    }
    if (pelvis !== undefined) {
      const v = velocity(pelvis);
      const touching = (world.posY[pelvis] ?? 0) - halfHeight(pelvisName) < 0.05;
      if (touching) {
        if (Number.isNaN(report.pelvisTime)) {
          report.pelvisTime = time;
          report.pelvisImpactSpeed = -(lastPelvis[1] ?? 0);
        }
        report.peakPelvisForce = Math.max(report.peakPelvisForce, massOf(pelvis) * Math.hypot(v[0] - (lastPelvis[0] ?? 0), v[1] - (lastPelvis[1] ?? 0), v[2] - (lastPelvis[2] ?? 0)) / frame);
      }
      lastPelvis = v;
    }
    if (drop > 0) {
      if (Number.isNaN(footDown) && ground > 0.5 * total * 9.81) footDown = time;
      if (!Number.isNaN(footDown)) report.peakFootForce = Math.max(report.peakFootForce, ground / 2);
      if (time > footDown + 0.4) break;
    }
  }
  let hic = 0;
  const span = Math.max(1, Math.round(0.015 / frame));
  for (let i = 0; i < headAccel.length; i++) {
    let sum = 0;
    for (let j = i; j < Math.min(headAccel.length, i + span); j++) {
      sum += (headAccel[j] ?? 0) * frame;
      const t = (j - i + 1) * frame;
      hic = Math.max(hic, t * (sum / t) ** 2.5);
    }
  }
  report.hic15 = hic;
  return report;
}

/** One row of {@link compareRagdollFall}: the game ragdoll, the reference human, and the injury limit when one applies. */
export interface RagdollFallRow {
  scenario: string;
  metric: keyof FallReport;
  label: string;
  unit: string;
  game: number;
  reference: number;
  /** Injury threshold for a mid-size adult man, or `NaN`. */
  limit: number;
}

/**
 * Injury assessment reference values for a mid-size adult man: HIC15 700 and femur axial force 10 kN (US FMVSS 208,
 * 49 CFR 571.208), and a proximal femur breaking at about 7 kN when struck on the hip in a fall (A. C. Courtney et al.,
 * *J. Bone Joint Surg.* 77-A, 1995: young donors' femora, twice the strength of older ones).
 */
export const INJURY_LIMITS = { hic15: 700, femurAxial: 10000, hipFracture: 7000 };

/**
 * Fall a game ragdoll and the reference human the same three ways: a limp backward fall from standing, and drops from
 * 0.3 m and 1 m onto the feet. Each row pairs the game number with the human's and the injury limit.
 * @capability ragdoll-fall-compare score a game ragdoll's falls and landings against a simulated real person and injury thresholds
 */
export function compareRagdollFall(options: Omit<RagdollFallOptions, "push" | "dropHeight"> = {}): RagdollFallRow[] {
  const rows: RagdollFallRow[] = [];
  const fall = measureRagdollFall(options);
  const human = simulateFall({ tone: "limp" });
  const add = (scenario: string, metric: keyof FallReport, label: string, unit: string, game: FallReport, reference: FallReport, limit = Number.NaN) =>
    rows.push({ scenario, metric, label, unit, game: game[metric], reference: reference[metric], limit });
  add("Backward fall", "pelvisTime", "Time to hit the floor (pelvis)", "s", fall, human);
  add("Backward fall", "pelvisImpactSpeed", "Pelvis impact speed", "m/s", fall, human);
  add("Backward fall", "peakPelvisForce", "Peak pelvis force", "N", fall, human, INJURY_LIMITS.hipFracture);
  add("Backward fall", "headImpactSpeed", "Head impact speed", "m/s", fall, human);
  add("Backward fall", "hic15", "Head injury criterion (HIC15)", "", fall, human, INJURY_LIMITS.hic15);
  for (const height of [0.3, 1]) {
    const game = measureRagdollFall({ ...options, dropHeight: height });
    const reference = simulateFall({ tone: "landing", dropHeight: height });
    add(`Drop ${height} m`, "peakFootForce", "Peak force under one foot", "N", game, reference);
  }
  return rows;
}

/**
 * Markdown table of {@link compareRagdollFall} rows.
 * @capability ragdoll-fall-table markdown table of a ragdoll's falls against the human reference and injury limits
 */
export function formatRagdollFall(rows: readonly RagdollFallRow[]): string {
  const fmt = (v: number) => (Number.isNaN(v) ? "—" : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
  const lines = ["| Scenario | Metric | Game ragdoll | Human | Injury limit |", "| --- | --- | --- | --- | --- |"];
  for (const r of rows) lines.push(`| ${r.scenario} | ${r.label}${r.unit === "" ? "" : ` (${r.unit})`} | ${fmt(r.game)} | ${fmt(r.reference)} | ${fmt(r.limit)} |`);
  return lines.join("\n");
}
