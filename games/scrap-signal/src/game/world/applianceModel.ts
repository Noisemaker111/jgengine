import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from "three";
import type { BufferGeometry, Material, Object3D } from "three";

/**
 * The rogue appliances, built from primitives: every hostile in Maple Hollow is a household machine
 * that took a bad firmware update. No model pack ships a Roomba, a smart fridge or a garage door
 * with a grudge, so each one is composed here in bright appliance plastic and enamel, with the one
 * shared tell that it is hostile: glowing red LED eyes.
 *
 * Frame: the machine faces +Z (the engine's yaw-0 heading), y is up from the ground at 0, and a
 * build is about one metre tall before the caller scales it to the enemy's size.
 */
export type ApplianceLook =
  | "roomba"
  | "sprinkler"
  | "fridge"
  | "drone"
  | "mower"
  | "garage"
  | "speaker"
  | "ridingMower"
  | "compactor"
  | "hoa"
  | "router"
  | "blowerKing";

export interface ApplianceBuild {
  root: Group;
  /** Natural height of the build in metres, before scaling. */
  height: number;
  /** Per-frame motion: spinning brushes, rotors, blinking LEDs. */
  animate(t: number, moving: boolean): void;
  dispose(): void;
}

type Vec3 = readonly [number, number, number];

interface Parts {
  root: Group;
  mat(key: string, params: ConstructorParameters<typeof MeshStandardMaterial>[0]): MeshStandardMaterial;
  add(geometry: BufferGeometry, material: Material, at: Vec3, rotation?: Vec3, parent?: Object3D): Mesh;
  group(at: Vec3, parent?: Object3D): Group;
  dispose(): void;
}

function parts(): Parts {
  const root = new Group();
  const geometries: BufferGeometry[] = [];
  const materials = new Map<string, MeshStandardMaterial>();
  return {
    root,
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
      mesh.castShadow = true;
      (parent ?? root).add(mesh);
      return mesh;
    },
    group(at, parent) {
      const group = new Group();
      group.position.set(at[0], at[1], at[2]);
      (parent ?? root).add(group);
      return group;
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials.values()) material.dispose();
    },
  };
}

const enamel = (color: string, roughness = 0.4): ConstructorParameters<typeof MeshStandardMaterial>[0] => ({ color, roughness, metalness: 0.1, emissive: color, emissiveIntensity: 0.08 });
const chrome = (color = "#d4d9de"): ConstructorParameters<typeof MeshStandardMaterial>[0] => ({ color, roughness: 0.25, metalness: 0.7, emissive: "#555b61", emissiveIntensity: 0.2 });
const rubber = (color = "#25272b"): ConstructorParameters<typeof MeshStandardMaterial>[0] => ({ color, roughness: 0.9, metalness: 0 });
const led = (color: string, intensity = 2.4): ConstructorParameters<typeof MeshStandardMaterial>[0] => ({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.3 });

const EYE_HOSTILE = "#ff3b30";
const EYE_ELITE = "#ffb000";

export interface ApplianceStyle {
  /** Main body colour (a local breed's plate), or the look's own default. */
  body?: string;
  elite: boolean;
}

/** Two glowing LED eyes at `y` on the +Z face, `gap` apart: the hostile tell every machine shares. */
function eyes(p: Parts, at: Vec3, gap: number, size: number, elite: boolean, parent?: Object3D): void {
  const material = p.mat("eye", led(elite ? EYE_ELITE : EYE_HOSTILE, 3));
  for (const sign of [-1, 1]) p.add(new SphereGeometry(size, 10, 8), material, [at[0] + sign * gap, at[1], at[2]], undefined, parent);
  // A scowl: one angled brow bar per eye, so they read as angry from range.
  const brow = p.mat("brow", rubber("#141518"));
  for (const sign of [-1, 1]) p.add(new BoxGeometry(size * 2.6, size * 0.6, size * 0.6), brow, [at[0] + sign * gap, at[1] + size * 1.5, at[2]], [0, 0, sign * 0.45], parent);
}

export function buildAppliance(look: ApplianceLook, style: ApplianceStyle): ApplianceBuild {
  const p = parts();
  const spinners: Object3D[] = [];
  const bobbers: Object3D[] = [];
  const blinkers: MeshStandardMaterial[] = [];
  let height = 1;
  switch (look) {
    case "roomba": {
      // A robot vacuum disc with a side brush and a bumper; it scoots in swarms.
      const body = p.mat("body", enamel(style.body ?? "#2f3238", 0.35));
      p.add(new CylinderGeometry(0.5, 0.52, 0.18, 28), body, [0, 0.13, 0]);
      p.add(new CylinderGeometry(0.42, 0.42, 0.02, 28), p.mat("lid", chrome("#9aa2ab")), [0, 0.23, 0]);
      p.add(new TorusGeometry(0.5, 0.035, 8, 28, Math.PI), p.mat("bumper", rubber("#15161a")), [0, 0.1, 0], [Math.PI / 2, 0, 0]);
      const brush = p.group([0.38, 0.05, 0.32]);
      for (let index = 0; index < 3; index += 1) p.add(new BoxGeometry(0.22, 0.01, 0.02), p.mat("bristle", enamel("#ff5a2e")), [0, 0, 0], [0, (index * Math.PI) / 3, 0], brush);
      spinners.push(brush);
      eyes(p, [0, 0.2, 0.47], 0.12, 0.045, style.elite);
      if (style.elite) p.add(new BoxGeometry(0.06, 0.04, 0.5), p.mat("blade", chrome()), [0.3, 0.26, 0.2], [0, 0.4, 0]);
      height = 0.32;
      break;
    }
    case "sprinkler": {
      // An irrigation sprinkler head on a stubby tripod: it sprays pressurised water bolts.
      const body = p.mat("body", enamel(style.body ?? "#2e9e4f"));
      for (let index = 0; index < 3; index += 1) {
        const angle = (index * Math.PI * 2) / 3;
        p.add(new CylinderGeometry(0.04, 0.05, 0.7, 8), p.mat("leg", rubber("#2a2c30")), [Math.sin(angle) * 0.25, 0.32, Math.cos(angle) * 0.25], [Math.cos(angle) * 0.35, 0, -Math.sin(angle) * 0.35]);
      }
      p.add(new CylinderGeometry(0.22, 0.26, 0.5, 18), body, [0, 0.9, 0]);
      const head = p.group([0, 1.2, 0]);
      p.add(new CylinderGeometry(0.16, 0.2, 0.18, 16), p.mat("head", enamel("#1d6f37")), [0, 0, 0], undefined, head);
      p.add(new CylinderGeometry(0.04, 0.05, 0.4, 10), p.mat("nozzle", chrome("#c7ccd2")), [0, 0.05, 0.25], [Math.PI / 2 - 0.3, 0, 0], head);
      eyes(p, [0, 0.95, 0.24], 0.09, 0.045, style.elite);
      height = 1.35;
      break;
    }
    case "fridge": {
      // A smart fridge on caster legs, door screen glowing, ice-cube cannon in the dispenser.
      const body = p.mat("body", enamel(style.body ?? "#e8ebee", 0.3));
      p.add(new BoxGeometry(0.9, 1.8, 0.75), body, [0, 1.0, 0]);
      p.add(new BoxGeometry(0.02, 1.7, 0.02), p.mat("seam", rubber("#9aa1a8")), [0.0, 1.0, 0.38]);
      p.add(new BoxGeometry(0.3, 0.45, 0.02), p.mat("screen", led("#5bd9ff", 1.1)), [-0.2, 1.35, 0.38]);
      p.add(new BoxGeometry(0.22, 0.3, 0.06), p.mat("dispenser", rubber("#30343a")), [0.22, 1.05, 0.39]);
      for (const x of [-0.12, 0.12]) p.add(new BoxGeometry(0.04, 0.5, 0.06), p.mat("handle", chrome()), [x, 1.3, 0.42]);
      for (const [x, z] of [[-0.35, -0.3], [0.35, -0.3], [-0.35, 0.3], [0.35, 0.3]] as const) p.add(new CylinderGeometry(0.06, 0.06, 0.1, 10), p.mat("caster", rubber()), [x, 0.05, z], [0, 0, Math.PI / 2]);
      eyes(p, [-0.2, 1.42, 0.4], 0.07, 0.05, style.elite);
      height = 1.9;
      break;
    }
    case "drone": {
      // A quadcopter: a body pod, four arms, four spinning rotors, a delivery claw.
      const lift = p.group([0, 1.1, 0]);
      bobbers.push(lift);
      const body = p.mat("body", enamel(style.body ?? "#f2f2ee"));
      p.add(new BoxGeometry(0.42, 0.16, 0.42), body, [0, 0, 0], undefined, lift);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        p.add(new BoxGeometry(0.42, 0.04, 0.05), p.mat("arm", rubber("#2b2e33")), [x * 0.2, 0.04, z * 0.2], [0, (x * z > 0 ? -1 : 1) * Math.PI / 4, 0], lift);
        const rotor = p.group([x * 0.36, 0.1, z * 0.36], lift);
        p.add(new BoxGeometry(0.34, 0.01, 0.05), p.mat("rotor", rubber("#111214")), [0, 0, 0], undefined, rotor);
        spinners.push(rotor);
      }
      p.add(new BoxGeometry(0.18, 0.18, 0.18), p.mat("parcel", enamel("#c9a26b", 0.8)), [0, -0.22, 0], undefined, lift);
      eyes(p, [0, 0.0, 0.22], 0.08, 0.035, style.elite, lift);
      height = 1.4;
      break;
    }
    case "mower": {
      // A push mower: red deck on wheels, engine dome, the handle sweeping back.
      const body = p.mat("body", enamel(style.body ?? "#d7262e"));
      p.add(new BoxGeometry(0.7, 0.18, 0.8), body, [0, 0.22, 0]);
      p.add(new CylinderGeometry(0.2, 0.24, 0.2, 16), p.mat("engine", rubber("#2b2e33")), [0, 0.42, -0.05]);
      for (const [x, z] of [[-0.38, -0.3], [0.38, -0.3], [-0.38, 0.3], [0.38, 0.3]] as const) p.add(new CylinderGeometry(0.11, 0.11, 0.07, 14), p.mat("wheel", rubber()), [x, 0.11, z], [0, 0, Math.PI / 2]);
      p.add(new CylinderGeometry(0.025, 0.025, 0.9, 8), p.mat("bar", chrome()), [0.25, 0.65, -0.55], [-0.85, 0, 0]);
      p.add(new CylinderGeometry(0.025, 0.025, 0.9, 8), p.mat("bar", chrome()), [-0.25, 0.65, -0.55], [-0.85, 0, 0]);
      p.add(new CylinderGeometry(0.025, 0.025, 0.55, 8), p.mat("bar", chrome()), [0, 1.0, -0.86], [0, 0, Math.PI / 2]);
      const blade = p.group([0, 0.12, 0]);
      p.add(new BoxGeometry(0.62, 0.015, 0.06), p.mat("blade", chrome("#e6e9ec")), [0, 0, 0], undefined, blade);
      spinners.push(blade);
      p.add(new BoxGeometry(0.5, 0.06, 0.04), p.mat("teeth", chrome("#eef0f2")), [0, 0.16, 0.41]);
      eyes(p, [0, 0.32, 0.41], 0.14, 0.05, style.elite);
      height = 1.05;
      break;
    }
    case "garage": {
      // A garage door that walked off its tracks: ribbed panels, a motor head, and a crushing lip.
      const body = p.mat("body", enamel(style.body ?? "#f0ede4", 0.5));
      const panels = p.group([0, 0, 0]);
      for (let index = 0; index < 4; index += 1) p.add(new BoxGeometry(1.4, 0.36, 0.12), body, [0, 0.25 + index * 0.38, 0], undefined, panels);
      for (let index = 0; index < 4; index += 1) p.add(new BoxGeometry(1.42, 0.03, 0.14), p.mat("rib", rubber("#b5b0a3")), [0, 0.07 + index * 0.38, 0], undefined, panels);
      p.add(new BoxGeometry(0.5, 0.25, 0.4), p.mat("motor", rubber("#3a3d42")), [0, 1.75, -0.1]);
      p.add(new BoxGeometry(0.12, 0.12, 0.02), p.mat("motorLed", led("#3dff6e", 1.6)), [0.15, 1.75, 0.11]);
      for (const x of [-0.68, 0.68]) p.add(new BoxGeometry(0.06, 1.7, 0.08), p.mat("rail", chrome("#9aa2ab")), [x, 0.9, -0.08]);
      p.add(new BoxGeometry(1.44, 0.08, 0.2), p.mat("lip", rubber("#1b1c1f")), [0, 0.04, 0]);
      eyes(p, [0, 1.25, 0.08], 0.2, 0.07, style.elite);
      bobbers.push(panels);
      height = 1.9;
      break;
    }
    case "speaker": {
      // A smart speaker: a fabric cylinder with a light ring that pulses when it "speaks".
      const body = p.mat("body", enamel(style.body ?? "#3a4150", 0.85));
      p.add(new CylinderGeometry(0.35, 0.38, 1.3, 24), body, [0, 0.75, 0]);
      const ring = p.mat("ring", led("#38c8ff", 2));
      blinkers.push(ring);
      p.add(new TorusGeometry(0.33, 0.035, 8, 28), ring, [0, 1.42, 0], [Math.PI / 2, 0, 0]);
      p.add(new CylinderGeometry(0.33, 0.33, 0.04, 24), p.mat("top", rubber("#1d2027")), [0, 1.41, 0]);
      for (const y of [0.45, 0.8]) p.add(new CylinderGeometry(0.2, 0.2, 0.03, 20), p.mat("cone", rubber("#14161b")), [0, y, 0.36], [Math.PI / 2, 0, 0]);
      eyes(p, [0, 1.15, 0.36], 0.11, 0.05, style.elite);
      height = 1.45;
      break;
    }
    case "ridingMower": {
      // Big Mulch: a riding mower with an empty seat, a grass bag, and a deck full of teeth.
      const body = p.mat("body", enamel(style.body ?? "#2f8f3a"));
      p.add(new BoxGeometry(1.1, 0.5, 1.6), body, [0, 0.6, 0]);
      p.add(new BoxGeometry(1.3, 0.2, 1.2), p.mat("deck", rubber("#2b2e33")), [0, 0.3, 0.3]);
      p.add(new BoxGeometry(0.6, 0.12, 0.5), p.mat("seat", rubber("#ffd84a")), [0, 1.0, -0.35]);
      p.add(new BoxGeometry(0.6, 0.5, 0.1), p.mat("seat", rubber("#ffd84a")), [0, 1.25, -0.6]);
      p.add(new CylinderGeometry(0.04, 0.04, 0.6, 8), p.mat("column", chrome()), [0, 1.05, 0.35], [-0.5, 0, 0]);
      p.add(new TorusGeometry(0.2, 0.03, 8, 20), p.mat("wheelTop", rubber()), [0, 1.32, 0.48], [-1.1, 0, 0]);
      for (const [x, z, r] of [[-0.65, -0.55, 0.36], [0.65, -0.55, 0.36], [-0.6, 0.6, 0.22], [0.6, 0.6, 0.22]] as const) p.add(new CylinderGeometry(r, r, 0.22, 16), p.mat("tyre", rubber()), [x, r, z], [0, 0, Math.PI / 2]);
      p.add(new BoxGeometry(0.9, 0.7, 0.6), p.mat("bag", enamel("#4a6b2e", 0.9)), [0, 0.8, -1.05]);
      const blade = p.group([0, 0.22, 0.3]);
      p.add(new BoxGeometry(1.1, 0.02, 0.08), p.mat("blade", chrome("#eef0f2")), [0, 0, 0], undefined, blade);
      spinners.push(blade);
      p.add(new BoxGeometry(0.9, 0.1, 0.05), p.mat("teeth", chrome("#eef0f2")), [0, 0.42, 0.93]);
      eyes(p, [0, 0.72, 0.81], 0.28, 0.08, true);
      height = 1.6;
      break;
    }
    case "compactor": {
      // The Compactor: a trash compactor on treads with a chomping steel jaw.
      const body = p.mat("body", enamel(style.body ?? "#7c8a96", 0.4));
      p.add(new BoxGeometry(1.2, 1.3, 1.1), body, [0, 0.95, 0]);
      for (const x of [-0.65, 0.65]) p.add(new BoxGeometry(0.25, 0.35, 1.3), p.mat("tread", rubber()), [x, 0.18, 0]);
      const jaw = p.group([0, 0.55, 0.56]);
      p.add(new BoxGeometry(1.1, 0.25, 0.25), p.mat("jaw", chrome("#b8c0c8")), [0, 0, 0], undefined, jaw);
      for (let index = 0; index < 6; index += 1) p.add(new ConeGeometry(0.06, 0.16, 6), p.mat("tooth", chrome("#eef0f2")), [-0.45 + index * 0.18, 0.18, 0.05], undefined, jaw);
      bobbers.push(jaw);
      p.add(new BoxGeometry(0.4, 0.1, 0.02), p.mat("panel", led("#ff9a2e", 1.2)), [0, 1.45, 0.56]);
      eyes(p, [0, 1.2, 0.57], 0.25, 0.08, true);
      height = 1.65;
      break;
    }
    case "hoa": {
      // The HOA President: a tall smart display on a stand, clipboard arm, tiny gavel.
      const body = p.mat("body", enamel(style.body ?? "#1f2a44", 0.35));
      p.add(new CylinderGeometry(0.08, 0.25, 1.2, 12), p.mat("stand", chrome("#9aa2ab")), [0, 0.6, 0]);
      p.add(new BoxGeometry(1.0, 0.75, 0.12), body, [0, 1.55, 0]);
      const screen = p.mat("screen", led("#ffd84a", 1.2));
      blinkers.push(screen);
      p.add(new BoxGeometry(0.88, 0.62, 0.02), screen, [0, 1.55, 0.07]);
      p.add(new BoxGeometry(0.3, 0.4, 0.03), p.mat("clipboard", enamel("#c9a26b", 0.8)), [0.65, 1.1, 0.2], [0.2, -0.3, 0.1]);
      p.add(new BoxGeometry(0.22, 0.28, 0.005), p.mat("paper", enamel("#ffffff", 0.9)), [0.65, 1.1, 0.22], [0.2, -0.3, 0.1]);
      p.add(new CylinderGeometry(0.07, 0.07, 0.18, 10), p.mat("gavel", enamel("#6b3a1e", 0.7)), [-0.62, 1.2, 0.2], [0, 0, Math.PI / 2]);
      eyes(p, [0, 1.6, 0.09], 0.18, 0.07, true);
      height = 1.95;
      break;
    }
    case "router": {
      // Mother Router: a vast wireless router, antennas raised, status LEDs racing.
      const body = p.mat("body", enamel(style.body ?? "#14161c", 0.3));
      p.add(new BoxGeometry(2.0, 0.55, 1.3), body, [0, 0.55, 0]);
      p.add(new BoxGeometry(1.9, 0.04, 1.2), p.mat("vent", rubber("#2d313a")), [0, 0.84, 0]);
      for (let index = 0; index < 6; index += 1) {
        const x = -0.85 + index * 0.34;
        const antenna = p.group([x, 0.85, -0.45]);
        p.add(new CylinderGeometry(0.05, 0.07, 1.4, 8), p.mat("antenna", rubber("#1d2027")), [0, 0.7, 0], undefined, antenna);
        antenna.rotation.z = (index - 2.5) * 0.12;
        bobbers.push(antenna);
      }
      for (let index = 0; index < 8; index += 1) {
        const material = p.mat(`status${index}`, led(index % 3 === 0 ? "#3dff6e" : index % 3 === 1 ? "#38c8ff" : "#ff3b30", 2));
        blinkers.push(material);
        p.add(new SphereGeometry(0.04, 8, 6), material, [-0.7 + index * 0.2, 0.42, 0.66]);
      }
      eyes(p, [0, 0.66, 0.66], 0.35, 0.1, true);
      height = 2.3;
      break;
    }
    case "blowerKing": {
      // The Leaf Blower King: a giant backpack blower on two stomping legs, a crown, a leaf cape.
      const body = p.mat("body", enamel(style.body ?? "#ff7a1c"));
      for (const x of [-0.25, 0.25]) p.add(new CylinderGeometry(0.1, 0.13, 0.9, 10), p.mat("leg", rubber("#2b2e33")), [x, 0.45, 0]);
      p.add(new BoxGeometry(0.9, 0.8, 0.7), body, [0, 1.3, 0]);
      p.add(new CylinderGeometry(0.28, 0.28, 0.75, 18), p.mat("engine", rubber("#2b2e33")), [0, 1.3, -0.1], [0, 0, Math.PI / 2]);
      const tube = p.group([0.5, 1.2, 0.2]);
      p.add(new CylinderGeometry(0.12, 0.17, 1.2, 14), p.mat("tube", enamel("#f2efe6", 0.4)), [0, 0, 0.5], [Math.PI / 2 - 0.15, 0, 0], tube);
      bobbers.push(tube);
      const crown = p.mat("crown", { color: "#ffcc33", roughness: 0.2, metalness: 0.9, emissive: "#ffb000", emissiveIntensity: 0.6 });
      p.add(new CylinderGeometry(0.3, 0.3, 0.14, 16, 1, true), crown, [0, 1.8, 0]);
      for (let index = 0; index < 6; index += 1) {
        const angle = (index * Math.PI * 2) / 6;
        p.add(new ConeGeometry(0.06, 0.18, 6), crown, [Math.sin(angle) * 0.28, 1.95, Math.cos(angle) * 0.28]);
      }
      const leaf = p.mat("leaf", enamel("#c2410c", 0.8));
      for (let index = 0; index < 7; index += 1) p.add(new BoxGeometry(0.22, 0.02, 0.16), leaf, [-0.35 + index * 0.12, 1.2 - (index % 2) * 0.3, -0.42], [0.4, index, 0.3]);
      eyes(p, [0, 1.45, 0.36], 0.2, 0.08, true);
      height = 2.0;
      break;
    }
  }

  return {
    root: p.root,
    height,
    animate(t, moving) {
      for (const [index, spinner] of spinners.entries()) spinner.rotation.y = t * (look === "drone" ? 40 : moving ? 18 : 6) + index;
      for (const [index, bobber] of bobbers.entries()) {
        if (look === "drone") bobber.position.y = 1.1 + Math.sin(t * 3 + index) * 0.06;
        else if (look === "compactor") bobber.position.y = 0.55 + Math.abs(Math.sin(t * 4)) * 0.12;
        else if (look === "router") bobber.rotation.x = Math.sin(t * 2 + index) * 0.08;
        else if (look === "blowerKing") bobber.rotation.y = Math.sin(t * 1.5) * 0.2;
        else if (look === "garage") bobber.position.y = moving ? Math.abs(Math.sin(t * 6)) * 0.05 : 0;
      }
      for (const [index, blinker] of blinkers.entries()) blinker.emissiveIntensity = 1.2 + Math.max(0, Math.sin(t * 5 + index * 1.7)) * 2;
      if (look === "roomba" || look === "mower" || look === "ridingMower") p.root.position.y = moving ? Math.abs(Math.sin(t * 14)) * 0.015 : 0;
    },
    dispose: p.dispose,
  };
}

/** Which body each enemy (by its base look id) is built as. */
export const APPLIANCE_BY_ENEMY: Readonly<Record<string, ApplianceLook>> = {
  husk: "roomba",
  elite_husk: "roomba",
  marauder: "sprinkler",
  nomad: "fridge",
  ripper_pup: "drone",
  ripper: "drone",
  elite_ripper: "drone",
  bruiser_brat: "mower",
  bruiser: "mower",
  crawler: "garage",
  crawler_soldier: "garage",
  loader: "speaker",
  loader_war: "speaker",
  elite_loader: "speaker",
  old_tusk: "ridingMower",
  wreck_maw: "compactor",
  foreman_maw: "hoa",
  foundry_heart: "router",
  captain_rusk: "blowerKing",
};

/** Default body colour per base enemy, so a soundbar does not read as a smart speaker. */
export const APPLIANCE_COLOR: Readonly<Record<string, string>> = {
  husk: "#2f3238",
  elite_husk: "#b8c0c8",
  marauder: "#2e9e4f",
  nomad: "#e8ebee",
  ripper_pup: "#f2f2ee",
  ripper: "#ffd84a",
  elite_ripper: "#7c3aed",
  bruiser_brat: "#d7262e",
  bruiser: "#2563eb",
  crawler: "#f0ede4",
  crawler_soldier: "#c9b48a",
  loader: "#3a4150",
  loader_war: "#1b1d22",
  elite_loader: "#4b2a63",
};
