import {
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
} from "three";
import type { BufferGeometry, Material } from "three";

import type { GunDef, GunFamily, Rarity } from "../handroll/guns";
import { personalityOf, type PersonalityId } from "../handroll/personality";
import { ELEMENT_COLORS } from "../palette";

/**
 * A Junk Drawer weapon, built in front of the camera from its parts: the household **body** it is
 * made of, the **mod** strapped onto it, a pair of googly eyes that say which **personality** lives
 * in it, and wear that says its **condition**. Everything is three.js primitives in bright painted
 * plastic and chrome, so the part list on the card is the thing in your hands.
 *
 * Frame: the muzzle points down local -Z, the grip sits at +Z, y is up. Units are metres at
 * viewmodel scale (a body is 0.25-0.45 long).
 */
export interface JunkBuild {
  group: Group;
  /** Local Z of the muzzle tip, for the flash and its light. */
  muzzleZ: number;
  /** Local Y of the muzzle. */
  muzzleY: number;
  dispose(): void;
}

type Vec3 = readonly [number, number, number];

interface Kit {
  group: Group;
  mat(key: string, params: ConstructorParameters<typeof MeshStandardMaterial>[0]): MeshStandardMaterial;
  add(geometry: BufferGeometry, material: Material, at: Vec3, rotation?: Vec3, parent?: Group): Mesh;
}

function kit(): Kit & { dispose(): void } {
  const group = new Group();
  const geometries: BufferGeometry[] = [];
  const materials = new Map<string, MeshStandardMaterial>();
  return {
    group,
    mat(key, params) {
      let material = materials.get(key);
      if (material === undefined) {
        material = new MeshStandardMaterial(params);
        materials.set(key, material);
      }
      return material;
    },
    add(geometry, material, at, rotation, parent) {
      geometries.push(geometry);
      const mesh = new Mesh(geometry, material);
      mesh.position.set(at[0], at[1], at[2]);
      if (rotation !== undefined) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
      (parent ?? group).add(mesh);
      return mesh;
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials.values()) material.dispose();
    },
  };
}

/** Painted plastic with a little self-light, so a part in the camera's shade keeps its colour. */
function paint(color: string, roughness = 0.45): ConstructorParameters<typeof MeshStandardMaterial>[0] {
  return { color, roughness, metalness: 0.05, emissive: color, emissiveIntensity: 0.18 };
}
function chrome(color = "#d9dee4"): ConstructorParameters<typeof MeshStandardMaterial>[0] {
  return { color, roughness: 0.22, metalness: 0.75, emissive: "#6b7280", emissiveIntensity: 0.25 };
}
function rubber(color = "#26282c"): ConstructorParameters<typeof MeshStandardMaterial>[0] {
  return { color, roughness: 0.9, metalness: 0, emissive: "#101114", emissiveIntensity: 0.3 };
}

const X: Vec3 = [0, 0, Math.PI / 2];
const Z: Vec3 = [Math.PI / 2, 0, 0];

/** Where the body ends: the muzzle and the top surface the mod and the eyes sit on. */
interface BodyFrame {
  muzzleZ: number;
  muzzleY: number;
  /** Top of the main housing, and its half-width, for eyes and top mods. */
  topY: number;
  halfW: number;
  /** Z span of the housing, front (negative) to back. */
  front: number;
  back: number;
}

function grip(k: Kit, z: number, y: number, color: string): void {
  k.add(new BoxGeometry(0.036, 0.1, 0.045), k.mat(`grip${color}`, rubber(color)), [0, y - 0.05, z], [0.3, 0, 0]);
  k.add(new TorusGeometry(0.022, 0.004, 6, 12, Math.PI), k.mat("guard", chrome("#9aa3ad")), [0, y - 0.015, z - 0.04], [0, Math.PI / 2, Math.PI]);
}

function buildBody(k: Kit, family: GunFamily): BodyFrame {
  switch (family) {
    case "pistol": {
      // A desk staple gun: a chunky chrome-and-red housing with the squeeze lever over the top.
      const red = k.mat("red", paint("#e0412f"));
      k.add(new BoxGeometry(0.06, 0.075, 0.22), red, [0, 0, 0]);
      k.add(new BoxGeometry(0.064, 0.02, 0.2), k.mat("chrome", chrome()), [0, 0.046, -0.005]);
      k.add(new BoxGeometry(0.03, 0.025, 0.16), k.mat("lever", chrome("#b8c0c8")), [0, 0.075, 0.02], [-0.18, 0, 0]);
      k.add(new BoxGeometry(0.05, 0.03, 0.03), k.mat("nose", rubber()), [0, -0.02, -0.12]);
      grip(k, 0.07, -0.035, "#202226");
      return { muzzleZ: -0.14, muzzleY: -0.02, topY: 0.056, halfW: 0.03, front: -0.11, back: 0.11 };
    }
    case "smg": {
      // A framing nail gun: contractor-yellow body, round motor housing, a long angled nail strip.
      const yellow = k.mat("yellow", paint("#f4c21b"));
      k.add(new BoxGeometry(0.065, 0.09, 0.2), yellow, [0, 0, 0]);
      k.add(new CylinderGeometry(0.05, 0.05, 0.07, 16), k.mat("black", rubber("#1d1f22")), [0, 0.02, 0.07], X);
      k.add(new CylinderGeometry(0.014, 0.018, 0.12, 10), k.mat("barrel", chrome("#8c949c")), [0, -0.005, -0.15], Z);
      k.add(new BoxGeometry(0.03, 0.03, 0.22), k.mat("strip", chrome("#c7ccd2")), [0, -0.07, -0.03], [0.32, 0, 0]);
      grip(k, 0.06, -0.045, "#1d1f22");
      return { muzzleZ: -0.215, muzzleY: -0.005, topY: 0.045, halfW: 0.033, front: -0.1, back: 0.1 };
    }
    case "shotgun": {
      // A backpack-style leaf blower: orange engine block, a pull cord, and a long flaring tube.
      const orange = k.mat("orange", paint("#ff7a1c"));
      k.add(new BoxGeometry(0.11, 0.1, 0.13), orange, [0, 0, 0.05]);
      k.add(new CylinderGeometry(0.035, 0.035, 0.115, 14), k.mat("engine", rubber("#2a2c30")), [0, -0.02, 0.05], X);
      k.add(new CylinderGeometry(0.03, 0.04, 0.3, 16), k.mat("tube", paint("#f2efe6", 0.35)), [0, 0.01, -0.16], Z);
      k.add(new CylinderGeometry(0.05, 0.03, 0.05, 16), orange, [0, 0.01, -0.33], Z);
      k.add(new SphereGeometry(0.008, 8, 6), k.mat("cordknob", paint("#e23c2e")), [0.06, 0.04, 0.09]);
      k.add(new CylinderGeometry(0.0025, 0.0025, 0.05, 6), k.mat("cord", rubber("#e6e2d4")), [0.058, 0.04, 0.065], Z);
      grip(k, 0.1, -0.05, "#2a2c30");
      return { muzzleZ: -0.36, muzzleY: 0.01, topY: 0.05, halfW: 0.055, front: -0.02, back: 0.12 };
    }
    case "rifle": {
      // A garden hose: a coil of green hose on the side, feeding a brass pistol-grip nozzle.
      const green = k.mat("hose", paint("#3fae49", 0.5));
      for (let index = 0; index < 3; index += 1) {
        k.add(new TorusGeometry(0.06, 0.012, 8, 24), green, [0.045 + index * 0.012, -0.01, 0.06], [0, Math.PI / 2, 0]);
      }
      k.add(new BoxGeometry(0.045, 0.07, 0.16), k.mat("brass", chrome("#d4a64a")), [0, 0, -0.02]);
      k.add(new CylinderGeometry(0.016, 0.022, 0.18, 12), k.mat("brass", chrome("#d4a64a")), [0, 0.012, -0.18], Z);
      k.add(new CylinderGeometry(0.026, 0.026, 0.02, 12), k.mat("nozzleRing", paint("#3fae49")), [0, 0.012, -0.27], Z);
      k.add(new BoxGeometry(0.012, 0.06, 0.012), k.mat("trigger", chrome("#9aa3ad")), [0, -0.05, -0.04], [0.5, 0, 0]);
      grip(k, 0.05, -0.035, "#2f7a35");
      return { muzzleZ: -0.28, muzzleY: 0.012, topY: 0.035, halfW: 0.023, front: -0.1, back: 0.06 };
    }
    case "sniper": {
      // A countertop microwave on a stock: white box, dark glass door, keypad, a dish for a muzzle.
      const white = k.mat("white", paint("#f3f1ea", 0.4));
      k.add(new BoxGeometry(0.12, 0.09, 0.2), white, [0, 0.02, 0]);
      k.add(new BoxGeometry(0.002, 0.06, 0.12), k.mat("glass", { color: "#1b2733", roughness: 0.1, metalness: 0.3, emissive: "#ffcf6a", emissiveIntensity: 0.25 }), [0.061, 0.02, -0.02]);
      k.add(new BoxGeometry(0.002, 0.06, 0.04), k.mat("keypad", paint("#2b2f35")), [0.061, 0.02, 0.07]);
      k.add(new CylinderGeometry(0.035, 0.012, 0.03, 16), k.mat("dish", chrome()), [0, 0.02, -0.115], Z);
      k.add(new BoxGeometry(0.02, 0.025, 0.08), k.mat("sight", rubber()), [0, 0.078, 0]);
      k.add(new CircleGeometry(0.009, 12), k.mat("lens", { color: "#5bd9ff", emissive: "#5bd9ff", emissiveIntensity: 2 }), [0, 0.078, -0.041], [0, Math.PI, 0]);
      grip(k, 0.13, -0.025, "#2b2f35");
      return { muzzleZ: -0.13, muzzleY: 0.02, topY: 0.065, halfW: 0.06, front: -0.1, back: 0.1 };
    }
    case "launcher": {
      // A two-slot chrome toaster: slots on top, toast peeking out, the lever on the side.
      const shell = k.mat("toaster", chrome("#e6e9ec"));
      k.add(new BoxGeometry(0.12, 0.11, 0.18), shell, [0, 0.01, 0]);
      for (const x of [-0.025, 0.025]) {
        k.add(new BoxGeometry(0.018, 0.004, 0.13), k.mat("slot", rubber("#111214")), [x, 0.067, 0]);
        k.add(new BoxGeometry(0.014, 0.04, 0.11), k.mat("toast", paint("#c98a3d", 0.8)), [x, 0.075, 0]);
      }
      k.add(new BoxGeometry(0.012, 0.012, 0.03), k.mat("leverT", rubber()), [0.066, 0.02, 0.04]);
      k.add(new CylinderGeometry(0.035, 0.04, 0.05, 16), k.mat("toastTube", rubber("#2a2c30")), [0, 0.01, -0.115], Z);
      grip(k, 0.1, -0.045, "#2a2c30");
      return { muzzleZ: -0.14, muzzleY: 0.01, topY: 0.066, halfW: 0.06, front: -0.09, back: 0.09 };
    }
    case "vacuum": {
      // A canister vacuum: red drum, a clear dust bin, a wand ending in a floor head.
      const red = k.mat("vacRed", paint("#d8263f"));
      k.add(new CylinderGeometry(0.06, 0.06, 0.15, 18), red, [0, 0, 0.06], Z);
      k.add(new CylinderGeometry(0.045, 0.045, 0.06, 16), k.mat("bin", { color: "#bfe7ff", roughness: 0.1, metalness: 0, transparent: true, opacity: 0.55, emissive: "#9fd0ff", emissiveIntensity: 0.2 }), [0, 0.07, 0.06]);
      k.add(new CylinderGeometry(0.016, 0.016, 0.24, 12), k.mat("wand", chrome()), [0, -0.01, -0.13], Z);
      k.add(new BoxGeometry(0.11, 0.025, 0.04), k.mat("head", rubber("#30333a")), [0, -0.02, -0.26]);
      grip(k, 0.12, -0.04, "#30333a");
      return { muzzleZ: -0.28, muzzleY: -0.02, topY: 0.06, halfW: 0.06, front: -0.015, back: 0.135 };
    }
    case "extinguisher": {
      // A red fire extinguisher laid along the arm, with a black hose and a flared horn.
      const red = k.mat("extRed", paint("#e3242b"));
      k.add(new CylinderGeometry(0.045, 0.045, 0.24, 18), red, [0, 0, 0.02], Z);
      k.add(new SphereGeometry(0.045, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), red, [0, 0, -0.1], [-Math.PI / 2, 0, 0]);
      k.add(new CircleGeometry(0.014, 14), k.mat("gauge", { color: "#f7f7f2", emissive: "#a6ff7a", emissiveIntensity: 0.35 }), [0.046, 0.02, 0.05], [0, Math.PI / 2, 0]);
      k.add(new CylinderGeometry(0.008, 0.008, 0.12, 8), k.mat("hoseB", rubber()), [0.03, 0.04, -0.12], Z);
      k.add(new ConeGeometry(0.03, 0.07, 14, 1, true), k.mat("horn", rubber("#15161a")), [0.03, 0.04, -0.21], [-Math.PI / 2, 0, 0]);
      grip(k, 0.12, -0.04, "#15161a");
      return { muzzleZ: -0.245, muzzleY: 0.04, topY: 0.045, halfW: 0.045, front: -0.1, back: 0.14 };
    }
  }
}

/** The mod, strapped to the body where it reads from the camera: the right flank and the top. */
function buildMod(k: Kit, mod: string, frame: BodyFrame): void {
  const side = frame.halfW + 0.012;
  const midZ = (frame.front + frame.back) / 2;
  switch (mod) {
    case "Duct Tape": {
      const tape = k.mat("tape", { color: "#b9bdc2", roughness: 0.55, metalness: 0.35, emissive: "#5f6368", emissiveIntensity: 0.25 });
      for (const z of [frame.front * 0.6, midZ, frame.back * 0.6]) {
        k.add(new TorusGeometry(Math.max(0.035, frame.halfW + 0.006), 0.008, 6, 20), tape, [0, 0, z]);
      }
      return;
    }
    case "Extension Cord": {
      const orange = k.mat("cord", paint("#ff8a00"));
      k.add(new TorusGeometry(0.032, 0.008, 8, 20), orange, [side + 0.01, -0.02, midZ], [0, Math.PI / 2, 0]);
      k.add(new TorusGeometry(0.026, 0.008, 8, 20), orange, [side + 0.018, -0.02, midZ], [0, Math.PI / 2, 0]);
      k.add(new CylinderGeometry(0.005, 0.005, Math.abs(frame.muzzleZ - midZ), 6), orange, [side * 0.6, -0.03, (frame.muzzleZ + midZ) / 2], Z);
      k.add(new BoxGeometry(0.02, 0.016, 0.022), k.mat("plug", paint("#ff8a00")), [side * 0.6, -0.03, frame.muzzleZ + 0.02]);
      return;
    }
    case "Batteries": {
      const body = k.mat("cell", paint("#16181c", 0.4));
      const cap = k.mat("cellCap", chrome("#d4a64a"));
      for (let index = 0; index < 3; index += 1) {
        const z = midZ - 0.035 + index * 0.035;
        k.add(new CylinderGeometry(0.011, 0.011, 0.06, 12), body, [side, 0.005, z]);
        k.add(new CylinderGeometry(0.011, 0.011, 0.012, 12), cap, [side, 0.04, z]);
        k.add(new BoxGeometry(0.004, 0.012, 0.01), k.mat("cellBand", paint("#ffd400")), [side + 0.009, 0.01, z]);
      }
      return;
    }
    case "Glitter": {
      k.add(new CylinderGeometry(0.022, 0.022, 0.05, 14), k.mat("jar", { color: "#ff5ad1", roughness: 0.15, metalness: 0.4, emissive: "#ff5ad1", emissiveIntensity: 0.9 }), [0, frame.topY + 0.028, midZ]);
      k.add(new CylinderGeometry(0.024, 0.024, 0.01, 14), k.mat("lid", chrome("#f0d6ff")), [0, frame.topY + 0.058, midZ]);
      const sparkle = k.mat("sparkle", { color: "#fff6a8", emissive: "#fff6a8", emissiveIntensity: 2.2 });
      for (let index = 0; index < 7; index += 1) {
        const angle = index * 2.4;
        k.add(new OctahedronGeometry(0.005), sparkle, [Math.cos(angle) * (frame.halfW + 0.02), frame.topY - 0.01 + (index % 3) * 0.02, midZ + Math.sin(angle) * 0.08]);
      }
      return;
    }
    case "Cinder Block": {
      const block = k.mat("block", { color: "#9a9a96", roughness: 0.95, metalness: 0, emissive: "#3e3e3c", emissiveIntensity: 0.25 });
      k.add(new BoxGeometry(0.07, 0.04, 0.09), block, [0, -0.07, midZ]);
      for (const z of [midZ - 0.022, midZ + 0.022]) k.add(new BoxGeometry(0.072, 0.024, 0.026), k.mat("hole", rubber("#4b4b49")), [0, -0.07, z]);
      return;
    }
    case "Rubber Bands": {
      const colors = ["#ff4d6d", "#4dd2ff", "#ffd84a", "#7aff6b"];
      colors.forEach((color, index) => {
        k.add(new TorusGeometry(Math.max(0.03, frame.halfW + 0.003), 0.0035, 6, 20), k.mat(`band${index}`, paint(color, 0.6)), [0, 0, frame.front * 0.8 + index * 0.02], [0, 0, index * 0.5]);
      });
      return;
    }
    case "Firecrackers": {
      const red = k.mat("cracker", paint("#d91f26"));
      const fuse = k.mat("fuse", { color: "#ffd27a", emissive: "#ff9a2e", emissiveIntensity: 1.6 });
      for (let index = 0; index < 4; index += 1) {
        const x = (index % 2) * 0.016 - 0.008;
        const z = midZ + Math.floor(index / 2) * 0.016 - 0.008;
        k.add(new CylinderGeometry(0.007, 0.007, 0.05, 8), red, [x, frame.topY + 0.025, z]);
        k.add(new CylinderGeometry(0.0015, 0.0015, 0.015, 4), fuse, [x, frame.topY + 0.057, z]);
      }
      k.add(new TorusGeometry(0.02, 0.003, 6, 14), k.mat("crackerBand", paint("#ffd400")), [0, frame.topY + 0.02, midZ], [Math.PI / 2, 0, 0]);
      return;
    }
    case "Laundry Basket": {
      const blue = k.mat("basket", paint("#3b82f6", 0.6));
      const y = frame.topY + 0.03;
      for (const x of [-0.035, 0.035]) k.add(new BoxGeometry(0.004, 0.05, 0.09), blue, [x, y, midZ]);
      for (const z of [midZ - 0.045, midZ + 0.045]) k.add(new BoxGeometry(0.074, 0.05, 0.004), blue, [0, y, z]);
      k.add(new BoxGeometry(0.074, 0.004, 0.09), blue, [0, y - 0.025, midZ]);
      k.add(new SphereGeometry(0.02, 10, 8), k.mat("sock", paint("#f5f0e6", 0.9)), [0.01, y + 0.005, midZ]);
      return;
    }
    default:
      return;
  }
}

const BROW_TILT: Record<PersonalityId, number> = {
  grumpy: 0.5,
  cheerful: -0.25,
  paranoid: -0.1,
  dramatic: -0.45,
  philosophical: 0.05,
  clingy: -0.35,
  competitive: 0.3,
};

const PUPIL_SHIFT: Record<PersonalityId, readonly [number, number]> = {
  grumpy: [0, -0.002],
  cheerful: [0, 0.002],
  paranoid: [0.004, 0],
  dramatic: [0, 0.004],
  philosophical: [0, 0.004],
  clingy: [-0.002, 0.001],
  competitive: [0, 0],
};

/** Googly eyes on the back of the housing, facing the wielder: the personality, looking at you. */
function buildEyes(k: Kit, personality: PersonalityId, frame: BodyFrame, tint: string): void {
  const white = k.mat("eyeWhite", { color: "#ffffff", roughness: 0.25, emissive: "#ffffff", emissiveIntensity: 0.35 });
  const pupil = k.mat("pupil", { color: "#0b0b0d", roughness: 0.4 });
  const brow = k.mat("brow", paint(tint, 0.6));
  const r = 0.014;
  const z = frame.back - 0.02;
  const y = frame.topY + r * 0.7;
  const [px, py] = PUPIL_SHIFT[personality];
  for (const sign of [-1, 1]) {
    const x = sign * Math.min(frame.halfW * 0.55, 0.022);
    k.add(new SphereGeometry(r, 14, 10), white, [x, y, z]);
    k.add(new SphereGeometry(r * 0.48, 10, 8), pupil, [x + px * (personality === "paranoid" ? 1 : sign), y + py, z + r * 0.62]);
    k.add(new BoxGeometry(r * 1.6, 0.004, 0.006), brow, [x, y + r * 1.2, z + r * 0.3], [0, 0, -sign * BROW_TILT[personality]]);
  }
}

const WEAR: Record<Rarity, { scuffs: number; trim: string | null }> = {
  common: { scuffs: 4, trim: null },
  uncommon: { scuffs: 2, trim: null },
  rare: { scuffs: 0, trim: "#2f8cff" },
  epic: { scuffs: 0, trim: "#b24bf3" },
  legendary: { scuffs: 0, trim: "#ffcc33" },
};

/** Condition on the outside: rust scuffs on busted junk, a lit trim line on the good stuff. */
function buildWear(k: Kit, rarity: Rarity, frame: BodyFrame, seed: number): void {
  const wear = WEAR[rarity];
  const rust = k.mat("rust", { color: "#8a4a2a", roughness: 1, metalness: 0, emissive: "#3a1d10", emissiveIntensity: 0.2 });
  for (let index = 0; index < wear.scuffs; index += 1) {
    const t = ((seed * (index + 3)) % 97) / 97;
    k.add(new BoxGeometry(0.003, 0.012 + t * 0.01, 0.018 + t * 0.02), rust, [-(frame.halfW + 0.001), -0.01 + t * 0.03, frame.front + (frame.back - frame.front) * ((index + 0.5) / wear.scuffs)]);
  }
  if (wear.trim !== null) {
    const glow = k.mat("trim", { color: wear.trim, emissive: wear.trim, emissiveIntensity: rarity === "legendary" ? 2 : 1.2, roughness: 0.3 });
    k.add(new BoxGeometry(0.004, 0.006, (frame.back - frame.front) * 0.8), glow, [frame.halfW + 0.003, -0.025, (frame.front + frame.back) / 2]);
    k.add(new BoxGeometry(0.004, 0.006, (frame.back - frame.front) * 0.8), glow, [-(frame.halfW + 0.003), -0.025, (frame.front + frame.back) / 2]);
  }
}

function idSeed(id: string): number {
  let hash = 7;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) % 100_003;
  return hash;
}

/** Build one weapon's mesh tree. Every geometry and material is handed back for disposal. */
export function buildJunkWeapon(gun: GunDef): JunkBuild {
  const k = kit();
  const frame = buildBody(k, gun.family);
  buildMod(k, gun.manufacturer, frame);
  const personality = personalityOf(gun);
  buildEyes(k, personality.id, frame, personality.color);
  buildWear(k, gun.rarity, frame, idSeed(gun.id));
  if (gun.element !== "none") {
    const glow = ELEMENT_COLORS[gun.element];
    k.add(new SphereGeometry(0.012, 10, 8), k.mat("element", { color: glow, emissive: glow, emissiveIntensity: 2.2, roughness: 0.3 }), [0, frame.muzzleY, frame.muzzleZ + 0.01]);
  }
  return { group: k.group, muzzleZ: frame.muzzleZ, muzzleY: frame.muzzleY, dispose: k.dispose };
}
