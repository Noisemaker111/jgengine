import type { ModelConfig, ModelPart } from "@jgengine/core/game/playableGame";
import { pickModel } from "@jgengine/shell/render/resolveModel";

import { assets, CHASSIS, PANEL_MAPS, SCRAP_METAL_MAPS } from "../assets";
import { MACHINE } from "../palette";
import type { EnemyDef } from "../entities/enemies/catalog";

const SCIFI = "quaternius-modular-scifi";
const SPACE = "kaykit-space-base";

/**
 * Ferralon's loaders are machines, and no CC0 pack here ships a rigged mech — so they are
 * kit-bashed from sci-fi hardware and walked by the engine's rig-less part driver
 * (`ModelPart.role` → `PartMotionRig`) instead of a skeleton.
 *
 * Piece choice is aspect ratio, not looks: `targetHeight` scales uniformly, so a flat floor plate
 * used as a limb becomes a metres-wide slab. Limbs are the tall square `Column_*` (5 m tall, ~1 m
 * square); torso and head are the cubic crates and cargo pods. Dimensions come from
 * `packages/assets/src/generated/<pack>.json`.
 */
const PIECES = {
  torso: { model: `${SCIFI}/Prop_Crate4`, fallbackModel: `${SPACE}/cargo_A_stacked` },
  leg: { model: `${SCIFI}/Column_Round`, fallbackModel: `${SCIFI}/Column_Simple` },
  arm: { model: `${SCIFI}/Column_Round`, fallbackModel: `${SCIFI}/Column_Simple` },
  head: { model: `${SPACE}/cargo_A`, fallbackModel: `${SCIFI}/Prop_Crate3` },
  pad: { model: `${SCIFI}/Prop_Crate3`, fallbackModel: `${SPACE}/cargo_A` },
} as const;

/**
 * Proportions as fractions of the chassis's total height. A part's `position[1]` is the pivot the
 * limb swings around, and each part model hangs from it via a negative `y` — the shell ground-snaps
 * a model's lowest vertex to its group origin, so a leg authored at `y: 0` would pivot at the foot.
 */
const HIP = 0.46;
const SHOULDER = 0.8;
const NECK = 0.83;
const HEAD_HEIGHT = 0.15;
const ARM_LENGTH = 0.44;
const LEG_SPREAD = 0.12;
const ARM_SPREAD = 0.27;
const PAD_SIZE = 0.16;

function limb(url: ModelConfig, length: number, finish: ModelConfig["material"]): ModelConfig {
  return { ...url, targetHeight: length, y: -length, material: finish };
}

/**
 * Build a walking robot from modular sci-fi pieces, sized to `height` metres and tagged for the
 * procedural part driver. Returns `null` when a piece is missing from the catalog so the caller can
 * fall back to a rigged silhouette rather than render a partial machine.
 */
export function robotChassis(def: EnemyDef, height: number): ModelConfig | null {
  const resolved = {
    torso: pickModel(assets, PIECES.torso),
    leg: pickModel(assets, PIECES.leg),
    arm: pickModel(assets, PIECES.arm),
    head: pickModel(assets, PIECES.head),
    pad: pickModel(assets, PIECES.pad),
  };
  if (Object.values(resolved).some((piece) => piece === undefined)) return null;

  const style = CHASSIS[def.id] ?? CHASSIS.loader!;
  // Every piece takes the same map set: the kit's own baked crate/column albedo is near-black and
  // reads as a hole outdoors, and mismatched surfaces make a kit-bash look like scattered props
  // rather than one machine.
  const maps = def.badass ? PANEL_MAPS : SCRAP_METAL_MAPS;
  const plate: ModelConfig["material"] = {
    color: style.plate,
    metalness: 0.5,
    roughness: 0.45,
    maps,
  };
  // Hydraulics read as darker unpainted metal against the plate, which is what separates a limb
  // from the torso at range.
  const joint: ModelConfig["material"] = { color: MACHINE.joint, metalness: 0.45, roughness: 0.55, maps };
  // The head is a single small pod, so a whole-model emissive is the optic rather than a body-wide
  // glow — the reason the single-mesh casts in `models.ts` deliberately carry none.
  const optic: ModelConfig["material"] = {
    color: MACHINE.steel,
    metalness: 0.7,
    roughness: 0.3,
    emissive: style.optic,
    emissiveIntensity: def.badass ? 2.2 : 1.4,
  };

  const legLength = HIP * height;
  const armLength = ARM_LENGTH * height;
  const parts: ModelPart[] = [
    { model: limb(resolved.leg!, legLength, joint), position: [-LEG_SPREAD * height, legLength, 0], role: "leg.l" },
    { model: limb(resolved.leg!, legLength, joint), position: [LEG_SPREAD * height, legLength, 0], role: "leg.r" },
    {
      model: limb(resolved.arm!, armLength, joint),
      position: [-ARM_SPREAD * height, SHOULDER * height, 0],
      role: "arm.l",
    },
    {
      model: limb(resolved.arm!, armLength, joint),
      position: [ARM_SPREAD * height, SHOULDER * height, 0],
      role: "arm.r",
    },
    {
      model: { ...resolved.head!, targetHeight: HEAD_HEIGHT * height, material: optic },
      position: [0, NECK * height, 0],
      role: "head",
    },
    {
      model: { ...resolved.pad!, targetHeight: PAD_SIZE * height, material: plate },
      position: [-ARM_SPREAD * height, SHOULDER * height - PAD_SIZE * height * 0.5, 0],
    },
    {
      model: { ...resolved.pad!, targetHeight: PAD_SIZE * height, material: plate },
      position: [ARM_SPREAD * height, SHOULDER * height - PAD_SIZE * height * 0.5, 0],
    },
  ];

  return {
    ...resolved.torso!,
    targetHeight: (NECK - HIP) * height,
    y: HIP * height,
    material: plate,
    parts,
    partMotion: {
      strideHz: def.walkSpeed > 2.8 ? 1.3 : 1.05,
      swingRad: 0.5,
      bobAmp: 0.025 * height,
      swayRad: 0.025,
      walkSpeed: def.walkSpeed,
      flinchRad: 0.18,
    },
  };
}
