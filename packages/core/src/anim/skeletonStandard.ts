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

/**
 * One canonical bone on the standard. Names are the authored names in the KayKit armature; the
 * loaded runtime name drops `.` (see {@link runtimeBoneName}), so `upperleg.l` is `upperlegl` in
 * the scene graph and both spellings resolve through `resolveRigNode`.
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

/** Every standard slot, in parent-before-child order. */
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

/** The parent slot of each slot that has one; `root` has none. */
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

/** A named skeleton standard: its id and the authored bone name for each slot it defines. */
export interface SkeletonStandard {
  id: string;
  label: string;
  slots: Readonly<Partial<Record<SkeletonSlot, string>>>;
}

/**
 * The one humanoid skeleton standard. Bone names are the authored KayKit names; the loaded
 * hierarchy spells them without `.` and `resolveRigNode` accepts either.
 *
 * @capability skeleton-standard the shared humanoid bone standard every rigged character maps onto
 */
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

/**
 * A source naming scheme and the bone names on it that fill each standard slot. A slot lists every
 * accepted spelling; matching is case- and punctuation-insensitive, so `mixamorigLeftUpLeg` and
 * `LeftUpLeg` are the same candidate.
 */
export interface RigScheme {
  id: string;
  label: string;
  /** Where the scheme comes from, for credits and diagnostics. */
  source: string;
  slots: Readonly<Partial<Record<SkeletonSlot, readonly string[]>>>;
}

/** Prefixes stripped from a bone name before matching: exporter scopes, not rig vocabulary. */
const NAME_PREFIXES = ["mixamorig", "armature"];

/**
 * The standard itself, as a scheme: a KayKit rig already is the standard, so its own names are the
 * candidates. Both authored (`upperleg.l`) and runtime (`upperlegl`) spellings are accepted.
 *
 * @capability skeleton-standard map a rig on the standard scheme onto the standard's slots
 */
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

/**
 * Mixamo exports (`mixamorig*` names, or the same names without the prefix). Mixamo has a neck and
 * a shoulder per side, which the standard folds into `chest` and `upperArm`; its toe is
 * `ToeBase`, which is the standard's `toes`. Mixamo's topmost bone is `Hips`, so `root` and `hips`
 * both resolve to it — a rig on this scheme has no bone above the pelvis.
 */
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

/** Every scheme the engine ships a mapping for, keyed by {@link RigScheme.id}. */
export const RIG_SCHEMES: Readonly<Record<string, RigScheme>> = {
  [KAYKIT_SCHEME.id]: KAYKIT_SCHEME,
  [MIXAMO_SCHEME.id]: MIXAMO_SCHEME,
  [QUATERNIUS_ALIEN_SCHEME.id]: QUATERNIUS_ALIEN_SCHEME,
};

/**
 * The runtime name GLTFLoader gives an authored bone name: three's `PropertyBinding.sanitizeNodeName`
 * strips `[ ] . : /`, so the authored `upperleg.l` loads as `upperlegl`.
 *
 * @capability skeleton-standard convert an authored bone name to its loaded runtime name
 */
export function runtimeBoneName(authored: string): string {
  return authored.replace(/[[\].:/]/g, "");
}

/** Lowercase alphanumerics of a bone name, with exporter scope prefixes removed. */
function matchKey(name: string): string {
  let key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const prefix of NAME_PREFIXES) {
    if (key.startsWith(prefix) && key.length > prefix.length) key = key.slice(prefix.length);
  }
  return key;
}

/** The result of mapping a rig's bones onto {@link SKELETON_STANDARD}. */
export interface SkeletonMap {
  /** Scheme the map was built from. */
  scheme: string;
  /** Standard slot → the bone name on this rig that fills it. */
  slots: Partial<Record<SkeletonSlot, string>>;
  /** Slots the standard defines that this rig has no bone for. */
  missing: SkeletonSlot[];
  /** Bones on the rig that fill no standard slot (helpers, props, IK targets). */
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

/** A standard slot and the rest-pose length of the bone chain that reaches it. */
export interface SlotLength {
  slot: SkeletonSlot;
  /** Distance from the slot's bone to its parent bone, in the rig's own units. */
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

/** Track-name property suffixes three writes on an `AnimationClip`. */
const TRACK_PROPERTIES = ["quaternion", "position", "scale", "morphTargetInfluences"] as const;

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
