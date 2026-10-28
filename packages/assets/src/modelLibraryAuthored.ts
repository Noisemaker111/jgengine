import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Document, NodeIO, type Material, type Mesh, type Node } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRMaterialsEmissiveStrength } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, reorder } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";

import { libraryModelDir, type ModelLibraryEntry } from "./catalogs/modelLibrary";

/**
 * Models the engine builds from code for shapes no licensed scan covers. They are original work
 * under the engine's own license, made of real-world-sized parts with physically plausible
 * materials, and written as one meshopt-compressed GLB. Each builder is deterministic, so a pull
 * on any machine writes the same bytes.
 */

type Vec3 = readonly [number, number, number];

interface Finish {
  color: string;
  metalness: number;
  roughness: number;
  emissive?: string;
  emissiveStrength?: number;
}

function linear(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [channel((value >> 16) & 255), channel((value >> 8) & 255), channel(value & 255)];
}

class Builder {
  readonly document = new Document();
  private readonly buffer = this.document.createBuffer();
  private readonly materials = new Map<string, Material>();
  private readonly emissive = this.document.createExtension(KHRMaterialsEmissiveStrength);
  readonly root: Node;

  constructor(name: string) {
    this.root = this.document.createNode(name);
    this.document.createScene(name).addChild(this.root);
  }

  material(name: string, finish: Finish): Material {
    const existing = this.materials.get(name);
    if (existing !== undefined) return existing;
    const material = this.document
      .createMaterial(name)
      .setBaseColorFactor([...linear(finish.color), 1])
      .setMetallicFactor(finish.metalness)
      .setRoughnessFactor(finish.roughness);
    if (finish.emissive !== undefined) {
      material.setEmissiveFactor(linear(finish.emissive));
      if ((finish.emissiveStrength ?? 1) !== 1) {
        material.setExtension("KHR_materials_emissive_strength", this.emissive.createEmissiveStrength().setEmissiveStrength(finish.emissiveStrength!));
      }
    }
    this.materials.set(name, material);
    return material;
  }

  private mesh(name: string, positions: number[], normals: number[], indices: number[], material: Material): Mesh {
    const doc = this.document;
    const primitive = doc
      .createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(this.buffer))
      .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(normals)).setBuffer(this.buffer))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(indices)).setBuffer(this.buffer))
      .setMaterial(material);
    return doc.createMesh(name).addPrimitive(primitive);
  }

  /** An axis-aligned box of `size` metres whose centre sits at `at` in `parent`'s space. */
  box(parent: Node, name: string, size: Vec3, at: Vec3, material: Material): Node {
    const [w, h, d] = size.map((v) => v / 2) as [number, number, number];
    const faces: Array<[Vec3, Vec3, Vec3]> = [
      [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
      [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
      [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
      [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    ];
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    for (const [n, u, v] of faces) {
      const base = positions.length / 3;
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        positions.push(
          (n[0] + u[0] * su + v[0] * sv) * w,
          (n[1] + u[1] * su + v[1] * sv) * h,
          (n[2] + u[2] * su + v[2] * sv) * d,
        );
        normals.push(...n);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const node = this.document.createNode(name).setTranslation([...at]).setMesh(this.mesh(name, positions, normals, indices, material));
    parent.addChild(node);
    return node;
  }

  /** A capped cylinder along its local Y axis, `height` tall and centred on `at`. */
  cylinder(parent: Node, name: string, radius: number, height: number, at: Vec3, material: Material, segments = 24, rotation?: Vec3): Node {
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const half = height / 2;
    for (let i = 0; i <= segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      const x = Math.cos(a);
      const z = Math.sin(a);
      positions.push(x * radius, -half, z * radius, x * radius, half, z * radius);
      normals.push(x, 0, z, x, 0, z);
    }
    for (let i = 0; i < segments; i += 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    for (const [y, ny] of [[half, 1], [-half, -1]] as const) {
      const centre = positions.length / 3;
      positions.push(0, y, 0);
      normals.push(0, ny, 0);
      for (let i = 0; i <= segments; i += 1) {
        const a = (i / segments) * Math.PI * 2;
        positions.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
        normals.push(0, ny, 0);
      }
      for (let i = 0; i < segments; i += 1) {
        if (ny > 0) indices.push(centre, centre + i + 2, centre + i + 1);
        else indices.push(centre, centre + i + 1, centre + i + 2);
      }
    }
    const node = this.document.createNode(name).setTranslation([...at]).setMesh(this.mesh(name, positions, normals, indices, material));
    if (rotation !== undefined) node.setRotation(eulerQuat(rotation));
    parent.addChild(node);
    return node;
  }

  /** A capped cone frustum along its local Y axis, `radiusBottom` below and `radiusTop` above, centred on `at`. */
  frustum(parent: Node, name: string, radiusBottom: number, radiusTop: number, height: number, at: Vec3, material: Material, rotation?: Vec3, segments = 16): Node {
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const half = height / 2;
    const slope = Math.hypot(height, radiusBottom - radiusTop);
    for (let i = 0; i <= segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      const x = Math.cos(a);
      const z = Math.sin(a);
      const nx = (x * height) / slope;
      const ny = (radiusBottom - radiusTop) / slope;
      const nz = (z * height) / slope;
      positions.push(x * radiusBottom, -half, z * radiusBottom, x * radiusTop, half, z * radiusTop);
      normals.push(nx, ny, nz, nx, ny, nz);
    }
    for (let i = 0; i < segments; i += 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    for (const [y, ny, radius] of [[half, 1, radiusTop], [-half, -1, radiusBottom]] as const) {
      if (radius <= 0) continue;
      const centre = positions.length / 3;
      positions.push(0, y, 0);
      normals.push(0, ny, 0);
      for (let i = 0; i <= segments; i += 1) {
        const a = (i / segments) * Math.PI * 2;
        positions.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
        normals.push(0, ny, 0);
      }
      for (let i = 0; i < segments; i += 1) {
        if (ny > 0) indices.push(centre, centre + i + 2, centre + i + 1);
        else indices.push(centre, centre + i + 1, centre + i + 2);
      }
    }
    const node = this.document.createNode(name).setTranslation([...at]).setMesh(this.mesh(name, positions, normals, indices, material));
    if (rotation !== undefined) node.setRotation(eulerQuat(rotation));
    parent.addChild(node);
    return node;
  }

  group(parent: Node, name: string, at: Vec3, rotation?: Vec3): Node {
    const node = this.document.createNode(name).setTranslation([...at]);
    if (rotation !== undefined) node.setRotation(eulerQuat(rotation));
    parent.addChild(node);
    return node;
  }
}

/** XYZ Euler angles in radians to a glTF quaternion. */
function eulerQuat([x, y, z]: Vec3): [number, number, number, number] {
  const cx = Math.cos(x / 2);
  const sx = Math.sin(x / 2);
  const cy = Math.cos(y / 2);
  const sy = Math.sin(y / 2);
  const cz = Math.cos(z / 2);
  const sz = Math.sin(z / 2);
  return [sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz, cx * cy * sz + sx * sy * cz, cx * cy * cz - sx * sy * sz];
}

/**
 * A 42U data-centre rack (600 x 2000 x 1070 mm) with 2U servers, drive bays and status LEDs.
 * The front faces +Z.
 */
function serverRack(): Builder {
  const b = new Builder("server_rack");
  const steel = b.material("rack_steel", { color: "#1b1d21", metalness: 0.7, roughness: 0.42 });
  const face = b.material("server_face", { color: "#2c3036", metalness: 0.75, roughness: 0.35 });
  const bay = b.material("drive_bay", { color: "#4a4f57", metalness: 0.6, roughness: 0.4 });
  const vent = b.material("vent_black", { color: "#08090b", metalness: 0.2, roughness: 0.8 });
  const green = b.material("led_green", { color: "#0d2a14", metalness: 0, roughness: 0.3, emissive: "#3dff7c", emissiveStrength: 4 });
  const blue = b.material("led_blue", { color: "#0b1a2c", metalness: 0, roughness: 0.3, emissive: "#4fb6ff", emissiveStrength: 4 });
  const amber = b.material("led_amber", { color: "#2c1d06", metalness: 0, roughness: 0.3, emissive: "#ffb43a", emissiveStrength: 3 });
  const width = 0.6;
  const height = 2.0;
  const depth = 1.07;
  const r = b.root;
  b.box(r, "base", [width, 0.08, depth], [0, 0.04, 0], steel);
  b.box(r, "top", [width, 0.05, depth], [0, height - 0.025, 0], steel);
  b.box(r, "side_left", [0.02, height - 0.13, depth], [-width / 2 + 0.01, height / 2 + 0.015, 0], steel);
  b.box(r, "side_right", [0.02, height - 0.13, depth], [width / 2 - 0.01, height / 2 + 0.015, 0], steel);
  b.box(r, "back", [width - 0.04, height - 0.13, 0.015], [0, height / 2 + 0.015, -depth / 2 + 0.0075], vent);
  for (const x of [-1, 1]) b.box(r, `rail_${x < 0 ? "l" : "r"}`, [0.03, height - 0.13, 0.02], [x * (width / 2 - 0.035), height / 2 + 0.015, depth / 2 - 0.03], steel);
  const unit = 0.04445;
  const front = depth / 2 - 0.035;
  let y = 0.08 + unit;
  let index = 0;
  while (y + unit * 2 < height - 0.12) {
    const u = index % 7 === 6 ? 1 : 2;
    const h = unit * u - 0.002;
    const server = b.group(r, `server_${index}`, [0, y + h / 2, front]);
    b.box(server, "chassis", [width - 0.1, h, 0.72], [0, 0, -0.36], vent);
    b.box(server, "face", [width - 0.08, h, 0.012], [0, 0, 0.006], face);
    if (u === 2) {
      for (let k = 0; k < 8; k += 1) b.box(server, `bay_${k}`, [0.052, h * 0.7, 0.008], [-0.2 + k * 0.057, 0, 0.016], bay);
      b.box(server, "led_power", [0.008, 0.008, 0.004], [0.25, h * 0.25, 0.014], blue);
      b.box(server, "led_status", [0.008, 0.008, 0.004], [0.25, -h * 0.25, 0.014], index % 5 === 3 ? amber : green);
    } else {
      b.box(server, "vent", [width - 0.16, h * 0.5, 0.004], [0, 0, 0.014], vent);
      b.box(server, "led_link", [0.006, 0.006, 0.004], [0.24, 0, 0.014], green);
    }
    y += unit * u;
    index += 1;
  }
  return b;
}

/** A floor-mounted six-axis industrial robot arm (about 2.1 m at rest), orange with steel joints. */
function robotArm(): Builder {
  const b = new Builder("robot_arm");
  const paint = b.material("robot_paint", { color: "#e2661b", metalness: 0.15, roughness: 0.38 });
  const steel = b.material("robot_steel", { color: "#5a5f66", metalness: 0.85, roughness: 0.32 });
  const dark = b.material("robot_dark", { color: "#1a1b1e", metalness: 0.4, roughness: 0.55 });
  const r = b.root;
  b.box(r, "plinth", [0.9, 0.08, 0.9], [0, 0.04, 0], dark);
  b.cylinder(r, "base", 0.34, 0.32, [0, 0.24, 0], paint, 32);
  const turret = b.group(r, "joint1", [0, 0.4, 0]);
  b.cylinder(turret, "turret", 0.27, 0.22, [0, 0.11, 0], paint, 32);
  b.box(turret, "shoulder_block", [0.36, 0.34, 0.42], [0, 0.38, 0], paint);
  const shoulder = b.group(turret, "joint2", [0, 0.4, 0], [0, 0, 0.35]);
  b.cylinder(shoulder, "shoulder_axle", 0.16, 0.5, [0, 0, 0], steel, 28, [Math.PI / 2, 0, 0]);
  b.box(shoulder, "upper_arm", [0.2, 0.9, 0.26], [0, 0.45, 0], paint);
  const elbow = b.group(shoulder, "joint3", [0, 0.9, 0], [0, 0, -1.25]);
  b.cylinder(elbow, "elbow_axle", 0.13, 0.42, [0, 0, 0], steel, 28, [Math.PI / 2, 0, 0]);
  b.box(elbow, "elbow_housing", [0.26, 0.26, 0.3], [0, 0.06, 0], paint);
  b.cylinder(elbow, "forearm", 0.085, 0.78, [0, 0.5, 0], paint, 24);
  const wrist = b.group(elbow, "joint5", [0, 0.92, 0], [0, 0, 0.6]);
  b.cylinder(wrist, "wrist", 0.075, 0.16, [0, 0, 0], steel, 24, [Math.PI / 2, 0, 0]);
  b.cylinder(wrist, "flange", 0.06, 0.08, [0, 0.1, 0], steel, 24);
  b.box(wrist, "gripper_body", [0.14, 0.06, 0.08], [0, 0.17, 0], dark);
  b.box(wrist, "finger_l", [0.02, 0.1, 0.05], [-0.05, 0.25, 0], steel);
  b.box(wrist, "finger_r", [0.02, 0.1, 0.05], [0.05, 0.25, 0], steel);
  return b;
}

const WOOD: Finish = { color: "#6e4b2c", metalness: 0, roughness: 0.82 };
const FLINT: Finish = { color: "#6f6b66", metalness: 0, roughness: 0.62 };
const FIBRE: Finish = { color: "#8c7146", metalness: 0, roughness: 0.95 };

/*
 * Hand tools share one frame: the grip sits at the origin, the haft runs up local +Y and the
 * working end (pick point, hatchet edge) faces +Z, so a hand socket holds every one the same way.
 */

/** A primitive stone pick: a flint head lashed across a 60 cm wooden haft. */
function stonePick(): Builder {
  const b = new Builder("stone_pick");
  const wood = b.material("haft_wood", WOOD);
  const flint = b.material("flint", FLINT);
  const fibre = b.material("lashing", FIBRE);
  const r = b.root;
  b.cylinder(r, "haft", 0.016, 0.6, [0, 0.2, 0], wood, 12);
  b.box(r, "head", [0.06, 0.07, 0.08], [0, 0.46, 0], flint);
  b.frustum(r, "point_front", 0.032, 0, 0.16, [0, 0.46, 0.12], flint, [Math.PI / 2, 0, 0], 8);
  b.frustum(r, "point_back", 0.03, 0, 0.12, [0, 0.46, -0.1], flint, [-Math.PI / 2, 0, 0], 8);
  b.cylinder(r, "lashing", 0.022, 0.07, [0, 0.4, 0], fibre, 12);
  return b;
}

/** A primitive stone hatchet: a knapped flint blade lashed to a 60 cm wooden haft. */
function stoneHatchet(): Builder {
  const b = new Builder("stone_hatchet");
  const wood = b.material("haft_wood", WOOD);
  const flint = b.material("flint", FLINT);
  const fibre = b.material("lashing", FIBRE);
  const r = b.root;
  b.cylinder(r, "haft", 0.016, 0.6, [0, 0.2, 0], wood, 12);
  b.box(r, "blade", [0.036, 0.11, 0.12], [0, 0.45, 0.07], flint);
  b.box(r, "edge", [0.012, 0.14, 0.04], [0, 0.45, 0.15], flint);
  b.cylinder(r, "lashing", 0.022, 0.08, [0, 0.45, 0], fibre, 12);
  return b;
}

/** A heavy wooden club, 70 cm, thickening to a knob. */
function woodenClub(): Builder {
  const b = new Builder("wooden_club");
  const wood = b.material("club_wood", WOOD);
  const fibre = b.material("grip_wrap", FIBRE);
  const r = b.root;
  b.cylinder(r, "grip", 0.02, 0.2, [0, 0, 0], fibre, 12);
  b.frustum(r, "shaft", 0.022, 0.05, 0.42, [0, 0.31, 0], wood, undefined, 12);
  b.frustum(r, "knob", 0.05, 0.03, 0.08, [0, 0.56, 0], wood, undefined, 12);
  return b;
}

/** A 1.8 m wooden spear with a lashed flint point, gripped a third of the way up. */
function spear(): Builder {
  const b = new Builder("spear");
  const wood = b.material("shaft_wood", WOOD);
  const flint = b.material("flint", FLINT);
  const fibre = b.material("lashing", FIBRE);
  const r = b.root;
  b.cylinder(r, "shaft", 0.014, 1.8, [0, 0.3, 0], wood, 10);
  b.frustum(r, "point", 0.026, 0, 0.18, [0, 1.29, 0], flint, undefined, 8);
  b.cylinder(r, "lashing", 0.019, 0.07, [0, 1.19, 0], fibre, 10);
  return b;
}

/** A hand torch: a 55 cm stick with a pitch-soaked wrap and a glowing flame. */
function torch(): Builder {
  const b = new Builder("torch");
  const wood = b.material("torch_wood", WOOD);
  const wrap = b.material("pitch_wrap", { color: "#2a2018", metalness: 0, roughness: 0.9 });
  const flame = b.material("flame", { color: "#ff7a1a", metalness: 0, roughness: 1, emissive: "#ff8a2a", emissiveStrength: 6 });
  const r = b.root;
  b.cylinder(r, "stick", 0.018, 0.55, [0, 0.17, 0], wood, 10);
  b.frustum(r, "wrap", 0.03, 0.038, 0.11, [0, 0.47, 0], wrap, undefined, 10);
  b.frustum(r, "flame", 0.034, 0, 0.16, [0, 0.6, 0], flame, undefined, 8);
  return b;
}

/** Every engine-authored builder, by the `builder` an entry names. */
export const AUTHORED_BUILDERS: Readonly<Record<string, () => Builder>> = {
  "server-rack": serverRack,
  "robot-arm": robotArm,
  "stone-pick": stonePick,
  "stone-hatchet": stoneHatchet,
  "wooden-club": woodenClub,
  spear,
  torch,
};

/** What an authored pull wrote. */
export interface BuiltAuthoredModel {
  name: string;
  file: string;
  bytes: number;
  triangles: number;
}

/**
 * Build an authored entry and write `<modelsRoot>/library/<name>/model.glb`. Nothing is downloaded.
 * @capability model-library-authored build an engine-authored library model (server rack, robot arm) without a download
 */
export async function buildAuthoredModel(entry: ModelLibraryEntry, modelsRoot: string): Promise<BuiltAuthoredModel> {
  if (entry.origin.provider !== "authored") throw new Error(`${entry.name} is not an authored model`);
  const make = AUTHORED_BUILDERS[entry.origin.builder];
  if (make === undefined) throw new Error(`no authored builder "${entry.origin.builder}"`);
  const { document } = make();
  await MeshoptEncoder.ready;
  await document.transform(dedup(), prune(), reorder({ encoder: MeshoptEncoder }), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) triangles += (primitive.getIndices()?.getCount() ?? 0) / 3;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  const dir = join(modelsRoot, ...libraryModelDir(entry.name).split("/"));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "model.glb");
  const bytes = await io.writeBinary(document);
  writeFileSync(file, bytes);
  return { name: entry.name, file, bytes: bytes.byteLength, triangles };
}
