/**
 * The engine's one humanoid skeleton standard, and the path any other CC0 rig takes onto it.
 *
 * The standard is the **KayKit character rig**: one armature shared by every rigged character in
 * `kaykit-adventurers` (Barbarian, Knight, Mage, Rogue, Rogue_Hooded) and `kaykit-skeletons`
 * (Skeleton_Mage/Minion/Rogue/Warrior). Because they share it, all nine characters play the same
 * clip set and one authored graph, foot-IK rig, attachment slot or ragdoll layout serves all of
 * them. There is no second standard to keep in sync.
 *
 * A rig on a different scheme (Quaternius aliens, Mixamo exports) is not rewritten: its bones are
 * *mapped* slot by slot onto the standard's names, and what it does not have is reported rather
 * than guessed. A rig missing every leg slot can still be driven on its spine and head; a rig
 * missing a slot never silently borrows a neighbour's bone.
 */

export type SkeletonSlot =
  | "root"
  | "hips"
  | "spine"
  | "chest"
  | "head"
  | "upperArm.l"
  | "upperArm.r"
  | "lowerArm.l"
  | "lowerArm.r"
  | "hand.l"
  | "hand.r"
  | "handSlot.l"
  | "handSlot.r"
  | "upperLeg.l"
  | "upperLeg.r"
  | "lowerLeg.l"
  | "lowerLeg.r"
  | "foot.l"
  | "foot.r"
  | "toes.l"
  | "toes.r";

export const SKELETON_SLOTS: readonly SkeletonSlot[] = [
  "root",
  "hips",
  "spine",
  "chest",
  "head",
  "upperArm.l",
  "upperArm.r",
  "lowerArm.l",
  "lowerArm.r",
  "hand.l",
  "hand.r",
  "handSlot.l",
  "handSlot.r",
  "upperLeg.l",
  "upperLeg.r",
  "lowerLeg.l",
  "lowerLeg.r",
  "foot.l",
  "foot.r",
  "toes.l",
  "toes.r",
];

export const SKELETON_PARENT: Readonly<Partial<Record<SkeletonSlot, SkeletonSlot>>> = {
  hips: "root",
  spine: "hips",
  chest: "spine",
  head: "chest",
  "upperArm.l": "chest",
  "upperArm.r": "chest",
  "lowerArm.l": "upperArm.l",
  "lowerArm.r": "upperArm.r",
  "hand.l": "lowerArm.l",
  "hand.r": "lowerArm.r",
  "handSlot.l": "hand.l",
  "handSlot.r": "hand.r",
  "upperLeg.l": "hips",
  "upperLeg.r": "hips",
  "lowerLeg.l": "upperLeg.l",
  "lowerLeg.r": "upperLeg.r",
  "foot.l": "lowerLeg.l",
  "foot.r": "lowerLeg.r",
  "toes.l": "foot.l",
  "toes.r": "foot.r",
};

export interface SkeletonStandard {
  id: string;
  label: string;
  slots: Readonly<Partial<Record<SkeletonSlot, string>>>;
}

/** @capability skeleton-standard the shared humanoid bone standard every rigged character maps onto */
export const SKELETON_STANDARD: SkeletonStandard = {
  id: "kaykit-humanoid",
  label: "KayKit character rig (adventurers + skeletons)",
  slots: {
    root: "root",
    hips: "hips",
    spine: "spine",
    chest: "chest",
    head: "head",
    "upperArm.l": "upperarm.l",
    "upperArm.r": "upperarm.r",
    "lowerArm.l": "lowerarm.l",
    "lowerArm.r": "lowerarm.r",
    "hand.l": "hand.l",
    "hand.r": "hand.r",
    "handSlot.l": "handslot.l",
    "handSlot.r": "handslot.r",
    "upperLeg.l": "upperleg.l",
    "upperLeg.r": "upperleg.r",
    "lowerLeg.l": "lowerleg.l",
    "lowerLeg.r": "lowerleg.r",
    "foot.l": "foot.l",
    "foot.r": "foot.r",
    "toes.l": "toes.l",
    "toes.r": "toes.r",
  },
};

export interface RigScheme {
  id: string;
  label: string;
  source: string;
  slots: Readonly<Partial<Record<SkeletonSlot, readonly string[]>>>;
}

const NAME_PREFIXES = ["mixamorig", "armature"];

/** @capability skeleton-standard map a rig on the standard scheme onto the standard's slots */
export const KAYKIT_SCHEME: RigScheme = {
  id: "kaykit-humanoid",
  label: "KayKit character rig",
  source: "KayKit Adventurers / Skeletons (CC0)",
  slots: Object.fromEntries(
    SKELETON_SLOTS.filter((slot) => SKELETON_STANDARD.slots[slot] !== undefined).map((slot) => {
      const authored = SKELETON_STANDARD.slots[slot]!;
      return [slot, [authored, runtimeBoneName(authored)]];
    }),
  ) as Partial<Record<SkeletonSlot, readonly string[]>>,
};

export const MIXAMO_SCHEME: RigScheme = {
  id: "mixamo",
  label: "Mixamo humanoid",
  source: "Mixamo auto-rig exports (per-asset licence)",
  slots: {
    root: ["Hips"],
    hips: ["Hips"],
    spine: ["Spine"],
    chest: ["Spine2", "Spine1"],
    head: ["Head"],
    "upperArm.l": ["LeftArm"],
    "upperArm.r": ["RightArm"],
    "lowerArm.l": ["LeftForeArm"],
    "lowerArm.r": ["RightForeArm"],
    "hand.l": ["LeftHand"],
    "hand.r": ["RightHand"],
    "upperLeg.l": ["LeftUpLeg"],
    "upperLeg.r": ["RightUpLeg"],
    "lowerLeg.l": ["LeftLeg"],
    "lowerLeg.r": ["RightLeg"],
    "foot.l": ["LeftFoot"],
    "foot.r": ["RightFoot"],
    "toes.l": ["LeftToeBase"],
    "toes.r": ["RightToeBase"],
  },
};

/**
 * Quaternius sci-fi aliens: a `Root` plus a `Spine_1..Spine_6` chain, a `Neck` and a `Head`. The
 * pack ships no arms and no legs, so those slots stay empty and the alien can only be driven on
 * its spine and head. That is the honest mapping: the pack's own clip set is `Alien_Idle` alone.
 */
export const QUATERNIUS_ALIEN_SCHEME: RigScheme = {
  id: "quaternius-alien",
  label: "Quaternius sci-fi alien",
  source: "Quaternius Modular Sci-Fi (CC0)",
  slots: {
    root: ["Root"],
    hips: ["Spine_1"],
    spine: ["Spine_3", "Spine_2"],
    chest: ["Spine_5", "Spine_4"],
    head: ["Head"],
  },
};

export const QUATERNIUS_HUMANOID_SCHEME: RigScheme = {
  id: "quaternius-humanoid",
  label: "Quaternius humanoid",
  source: "Quaternius Ultimate Modular Men / Women, Toon Shooter (CC0)",
  slots: {
    root: ["Root"],
    hips: ["Hips"],
    spine: ["Abdomen"],
    chest: ["Chest", "Torso"],
    head: ["Head"],
    "upperArm.l": ["UpperArm.L"],
    "upperArm.r": ["UpperArm.R"],
    "lowerArm.l": ["LowerArm.L"],
    "lowerArm.r": ["LowerArm.R"],
    "hand.l": ["Wrist.L"],
    "hand.r": ["Wrist.R"],
    "upperLeg.l": ["UpperLeg.L"],
    "upperLeg.r": ["UpperLeg.R"],
    "lowerLeg.l": ["LowerLeg.L"],
    "lowerLeg.r": ["LowerLeg.R"],
    "foot.l": ["Foot.L"],
    "foot.r": ["Foot.R"],
  },
};

export const BIPED_SCHEME: RigScheme = {
  id: "biped",
  label: "3ds Max Biped (Microsoft Rocketbox)",
  source: "Microsoft Rocketbox (MIT)",
  slots: {
    root: ["Bip01"],
    hips: ["Bip01 Pelvis"],
    spine: ["Bip01 Spine1", "Bip01 Spine"],
    chest: ["Bip01 Spine2", "Bip01 Spine1"],
    head: ["Bip01 Head"],
    "upperArm.l": ["Bip01 L UpperArm"],
    "upperArm.r": ["Bip01 R UpperArm"],
    "lowerArm.l": ["Bip01 L Forearm"],
    "lowerArm.r": ["Bip01 R Forearm"],
    "hand.l": ["Bip01 L Hand"],
    "hand.r": ["Bip01 R Hand"],
    "upperLeg.l": ["Bip01 L Thigh"],
    "upperLeg.r": ["Bip01 R Thigh"],
    "lowerLeg.l": ["Bip01 L Calf"],
    "lowerLeg.r": ["Bip01 R Calf"],
    "foot.l": ["Bip01 L Foot"],
    "foot.r": ["Bip01 R Foot"],
    "toes.l": ["Bip01 L Toe0"],
    "toes.r": ["Bip01 R Toe0"],
  },
};

export const RIG_SCHEMES: Readonly<Record<string, RigScheme>> = {
  [KAYKIT_SCHEME.id]: KAYKIT_SCHEME,
  [MIXAMO_SCHEME.id]: MIXAMO_SCHEME,
  [BIPED_SCHEME.id]: BIPED_SCHEME,
  [QUATERNIUS_ALIEN_SCHEME.id]: QUATERNIUS_ALIEN_SCHEME,
  [QUATERNIUS_HUMANOID_SCHEME.id]: QUATERNIUS_HUMANOID_SCHEME,
};

/** Slots a rig needs before the engine poses it as a full humanoid body: limbs, spine and head. */
export const HUMANOID_BODY_SLOTS: readonly SkeletonSlot[] = [
  "hips",
  "spine",
  "chest",
  "head",
  "upperArm.l",
  "upperArm.r",
  "lowerArm.l",
  "lowerArm.r",
  "hand.l",
  "hand.r",
  "upperLeg.l",
  "upperLeg.r",
  "lowerLeg.l",
  "lowerLeg.r",
  "foot.l",
  "foot.r",
];

/**
 * The scheme that fills the most standard slots on this rig, mapped; `null` when no scheme fills
 * every {@link HUMANOID_BODY_SLOTS} slot, so a quadruped or a partial rig is never posed as a person.
 *
 * @capability skeleton-standard detect which humanoid naming scheme a loaded rig uses
 */
export function detectHumanoidRig(bones: readonly string[]): SkeletonMap | null {
  let best: SkeletonMap | null = null;
  for (const scheme of Object.values(RIG_SCHEMES)) {
    const map = mapRigToStandard(bones, scheme);
    if (!HUMANOID_BODY_SLOTS.every((slot) => map.slots[slot] !== undefined)) continue;
    if (best === null || Object.keys(map.slots).length > Object.keys(best.slots).length) best = map;
  }
  return best;
}

/**
 * The runtime name GLTFLoader gives an authored bone name: three's `PropertyBinding.sanitizeNodeName`
 * strips `[ ] . : /`, so the authored `upperleg.l` loads as `upperlegl`.
 *
 * @capability skeleton-standard convert an authored bone name to its loaded runtime name
 */
export function runtimeBoneName(authored: string): string {
  return authored.replace(/[[\].:/]/g, "");
}

function matchKey(name: string): string {
  let key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const prefix of NAME_PREFIXES) {
    if (key.startsWith(prefix) && key.length > prefix.length) key = key.slice(prefix.length);
  }
  return key;
}

export interface SkeletonMap {
  scheme: string;
  slots: Partial<Record<SkeletonSlot, string>>;
  missing: SkeletonSlot[];
  unmapped: string[];
}

/**
 * Maps a rig's bone names onto {@link SKELETON_STANDARD} through one {@link RigScheme}. Each slot
 * takes the first candidate that resolves; a candidate list is tried in order, so a scheme can name
 * a preferred bone and fall back. Bones that fill no slot come back in `unmapped`, and slots the rig
 * cannot fill in `missing` — the caller decides whether a partial map is usable.
 *
 * @capability skeleton-standard map any CC0 rig's bones onto the shared humanoid slots
 */
export function mapRigToStandard(bones: readonly string[], scheme: RigScheme | string = KAYKIT_SCHEME): SkeletonMap {
  const resolved = typeof scheme === "string" ? RIG_SCHEMES[scheme] : scheme;
  if (resolved === undefined) throw new Error(`unknown rig scheme "${String(scheme)}"; known: ${Object.keys(RIG_SCHEMES).join(", ")}`);
  const byKey = new Map<string, string>();
  for (const bone of bones) {
    const key = matchKey(bone);
    if (key.length > 0 && !byKey.has(key)) byKey.set(key, bone);
  }
  const slots: Partial<Record<SkeletonSlot, string>> = {};
  const missing: SkeletonSlot[] = [];
  const used = new Set<string>();
  for (const slot of SKELETON_SLOTS) {
    const candidates = resolved.slots[slot];
    if (candidates === undefined) {
      missing.push(slot);
      continue;
    }
    let found: string | undefined;
    for (const candidate of candidates) {
      const bone = byKey.get(matchKey(candidate));
      if (bone !== undefined) {
        found = bone;
        break;
      }
    }
    if (found === undefined) missing.push(slot);
    else {
      slots[slot] = found;
      used.add(found);
    }
  }
  return { scheme: resolved.id, slots, missing, unmapped: bones.filter((bone) => !used.has(bone)) };
}

export interface SlotLength {
  slot: SkeletonSlot;
  length: number;
}

/**
 * Per-slot length ratios that stretch a source rig's bone chain onto the standard's proportions, so
 * a retargeted clip moves both rigs the same distance rather than the same angle. Slots with no
 * counterpart on either side are omitted; a source length of zero is skipped instead of dividing.
 *
 * @capability skeleton-standard scale a retargeted clip to the target rig's bone proportions
 */
export function retargetBoneScales(
  source: readonly SlotLength[],
  target: readonly SlotLength[],
): Partial<Record<SkeletonSlot, number>> {
  const targetBySlot = new Map(target.map((entry) => [entry.slot, entry.length]));
  const scales: Partial<Record<SkeletonSlot, number>> = {};
  for (const entry of source) {
    const to = targetBySlot.get(entry.slot);
    if (to === undefined || entry.length <= 0 || to <= 0) continue;
    scales[entry.slot] = to / entry.length;
  }
  return scales;
}

const TRACK_PROPERTIES = ["quaternion", "position", "scale", "morphTargetInfluences"] as const;

/** @capability skeleton-standard build a layer mask from the standard's own slots */
export function standardBoneMask(slots: readonly SkeletonSlot[]): string[] {
  const out = new Set<string>();
  for (const slot of slots) {
    const bone = SKELETON_STANDARD.slots[slot];
    if (bone === undefined) continue;
    const sided = slot.endsWith(".l") || slot.endsWith(".r");
    out.add(sided ? slot.slice(0, -2).toLowerCase() : runtimeBoneName(bone));
  }
  return [...out];
}

export const UPPER_BODY_SLOTS: readonly SkeletonSlot[] = [
  "spine",
  "chest",
  "head",
  "upperArm.l",
  "upperArm.r",
  "lowerArm.l",
  "lowerArm.r",
  "hand.l",
  "hand.r",
  "handSlot.l",
  "handSlot.r",
];

export const LOWER_BODY_SLOTS: readonly SkeletonSlot[] = [
  "hips",
  "upperLeg.l",
  "upperLeg.r",
  "lowerLeg.l",
  "lowerLeg.r",
  "foot.l",
  "foot.r",
  "toes.l",
  "toes.r",
];

export const UPPER_BODY_MASK: readonly string[] = standardBoneMask(UPPER_BODY_SLOTS);

export const LOWER_BODY_MASK: readonly string[] = standardBoneMask(LOWER_BODY_SLOTS);

/**
 * Renames a clip's tracks from a rig's own bone names onto the standard's, so one authored clip
 * plays on a mapped rig. The emitted node is the **runtime** bone name (see {@link runtimeBoneName}),
 * which is what both the loaded scene graph and the loaded clips spell. A track whose node fills no
 * slot is dropped (`null` in the result) rather than left pointing at a bone the rig does not have;
 * a track whose property is not one of the four three writes is dropped too, since renaming it
 * would not make it resolvable.
 *
 * @capability skeleton-standard rename an animation clip's tracks onto a mapped rig
 */
export function retargetTracks(tracks: readonly string[], map: SkeletonMap): (string | null)[] {
  const bySlot = new Map<string, SkeletonSlot>();
  for (const slot of SKELETON_SLOTS) {
    const bone = map.slots[slot];
    if (bone !== undefined) bySlot.set(matchKey(bone), slot);
  }
  return tracks.map((track) => {
    const split = track.lastIndexOf(".");
    if (split <= 0) return null;
    const slot = bySlot.get(matchKey(track.slice(0, split)));
    const property = track.slice(split + 1);
    if (slot === undefined || !(TRACK_PROPERTIES as readonly string[]).includes(property)) return null;
    const target = SKELETON_STANDARD.slots[slot];
    return target === undefined ? null : `${runtimeBoneName(target)}.${property}`;
  });
}
