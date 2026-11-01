/** Original Deepward fauna: the hand, the courier and the Overrun's tank-crawler as rigged, animated GLBs.
 * Run once from the repo root with `bun games/deepward/scripts/build-fauna.ts`.
 * Low and wide silhouettes, one lit optic, `idle`, `walk` and `windup` clips; floor-origin, +Z facing, +Y up.
 */
// The assets package owns the glTF writer; games carry no copy of it.
const { Document, NodeIO } = await import("../../../packages/assets/node_modules/@gltf-transform/core");
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hex, Mesh, PALETTE, type V3 } from "./architectureKit";

const OUT = new URL("../public/models/imported/deepward/fauna/", import.meta.url);
mkdirSync(OUT, { recursive: true });
PALETTE["flesh"] = { color: hex("#cdb9a2"), metal: 0, rough: 0.7 };
PALETTE["knuckle"] = { color: hex("#8a7662"), metal: 0.1, rough: 0.6 };
PALETTE["gauntMetal"] = { color: hex("#5a5f63"), metal: 0.7, rough: 0.45 };
PALETTE["plate"] = { color: hex("#3b4a50"), metal: 0.6, rough: 0.5 };
PALETTE["hull"] = { color: hex("#4a3c33"), metal: 0.6, rough: 0.55 };
PALETTE["tread"] = { color: hex("#2b2522"), metal: 0.1, rough: 0.9 };
PALETTE["optic"] = { color: hex("#eab379"), metal: 0, rough: 0.4, emissive: hex("#eab379") };

interface Joint { name: string; parent: number; at: V3 }
type Track = { joint: number; path: "rotation" | "translation"; keys: Array<[number, number[]]> };
const quat = (axis: 0 | 1 | 2, angle: number): number[] => { const q = [0, 0, 0, Math.cos(angle / 2)]; q[axis] = Math.sin(angle / 2); return q; };
/** A looping sway of one joint around an axis, sampled at nine keys. */
const sway = (joint: number, axis: 0 | 1 | 2, amp: number, phase: number, period: number, bias = 0): Track => ({
  joint, path: "rotation", keys: Array.from({ length: 9 }, (_, k) => [(k / 8) * period, quat(axis, bias + amp * Math.sin((k / 8) * Math.PI * 2 + phase))]),
});
const hold = (joint: number, axis: 0 | 1 | 2, angle: number, period: number): Track => ({ joint, path: "rotation", keys: [[0, quat(axis, 0)], [period, quat(axis, angle)]] });
const bob = (joint: number, base: V3, amp: number, period: number): Track => ({
  joint, path: "translation", keys: Array.from({ length: 9 }, (_, k) => [(k / 8) * period, [base[0], base[1] + amp * Math.sin((k / 8) * Math.PI * 2), base[2]]]),
});

async function write(name: string, joints: Joint[], mesh: Mesh, clips: Record<string, Track[]>): Promise<Record<string, unknown>> {
  const doc = new Document(), buffer = doc.createBuffer(), scene = doc.createScene(name);
  const nodes = joints.map((joint) => doc.createNode(joint.name));
  const world = (i: number): V3 => joints[i]!.at; // type-escape: authoring script indexes its own fixed tables
  joints.forEach((joint, i) => {
    const parent = joint.parent < 0 ? [0, 0, 0] : world(joint.parent);
    nodes[i]!.setTranslation([joint.at[0] - parent[0], joint.at[1] - parent[1], joint.at[2] - parent[2]]); // type-escape: authoring script indexes its own fixed tables
    if (joint.parent < 0) scene.addChild(nodes[i]!); else nodes[joint.parent]!.addChild(nodes[i]!); // type-escape: authoring script indexes its own fixed tables
  });
  const ibm = new Float32Array(joints.length * 16);
  joints.forEach((joint, i) => ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -joint.at[0], -joint.at[1], -joint.at[2], 1], i * 16));
  const skin = doc.createSkin(name).setInverseBindMatrices(doc.createAccessor().setType("MAT4").setArray(ibm).setBuffer(buffer)).setSkeleton(nodes[0]!); // type-escape: authoring script indexes its own fixed tables
  nodes.forEach((node) => skin.addJoint(node));
  const gltfMesh = doc.createMesh(name);
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const [material, part] of mesh.parts) {
    const def = PALETTE[material]!; // type-escape: authoring script indexes its own fixed tables
    const mat = doc.createMaterial(material).setBaseColorFactor([...def.color, 1]).setMetallicFactor(def.metal).setRoughnessFactor(def.rough);
    if (def.emissive) mat.setEmissiveFactor(def.emissive);
    const count = part.positions.length / 3, jointIds = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
    for (let v = 0; v < count; v++) { jointIds[v * 4] = part.joints[v] ?? 0; weights[v * 4] = 1; }
    const acc = (type: "VEC3" | "VEC4" | "SCALAR", array: Float32Array | Uint16Array | Uint32Array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
    gltfMesh.addPrimitive(doc.createPrimitive()
      .setAttribute("POSITION", acc("VEC3", new Float32Array(part.positions))).setAttribute("NORMAL", acc("VEC3", new Float32Array(part.normals)))
      .setAttribute("JOINTS_0", acc("VEC4", jointIds)).setAttribute("WEIGHTS_0", acc("VEC4", weights))
      .setIndices(acc("SCALAR", new Uint32Array(part.indices))).setMaterial(mat));
    for (let i = 0; i < part.positions.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, part.positions[i + k]!); max[k] = Math.max(max[k]!, part.positions[i + k]!); } // type-escape: authoring script indexes its own fixed tables
  }
  scene.addChild(doc.createNode(`${name}-skin`).setMesh(gltfMesh).setSkin(skin));
  for (const [clip, tracks] of Object.entries(clips)) {
    const animation = doc.createAnimation(clip);
    for (const track of tracks) {
      const times = new Float32Array(track.keys.map(([t]) => t)), values = new Float32Array(track.keys.flatMap(([, v]) => v));
      const sampler = doc.createAnimationSampler().setInterpolation("LINEAR")
        .setInput(doc.createAccessor().setType("SCALAR").setArray(times).setBuffer(buffer))
        .setOutput(doc.createAccessor().setType(track.path === "rotation" ? "VEC4" : "VEC3").setArray(values).setBuffer(buffer));
      animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(nodes[track.joint]!).setTargetPath(track.path).setSampler(sampler)); // type-escape: authoring script indexes its own fixed tables
    }
  }
  const bytes = await new NodeIO().writeBinary(doc), file = `${name}.glb`;
  writeFileSync(new URL(file, OUT), bytes);
  return { id: `deepward/fauna/${name}`, file, url: `/models/imported/deepward/fauna/${file}`, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, clips: Object.keys(clips), bounds: { min, max }, dims: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

/** The hand: a flat palm that walks on five two-jointed fingers; the thumb leads. */
async function hand(): Promise<Record<string, unknown>> {
  const joints: Joint[] = [{ name: "root", parent: -1, at: [0, 0.12, 0] }], m = new Mesh();
  m.joint = 0;
  m.box("flesh", [0, 0.14, 0], [0.44, 0.1, 0.46]).box("knuckle", [0, 0.2, 0.04], [0.3, 0.04, 0.26]);
  m.cylinder("optic", [0, 0.2, 0.2], 0.025, 0.03, 1, 8);
  const fingers = [-0.2, -0.1, 0, 0.1, 0.2];
  const legs: number[][] = [];
  fingers.forEach((x, i) => {
    const base = joints.length, tip = base + 1, reach = i === 2 ? 0.34 : 0.28, fan = (x / 0.2) * 0.35;
    joints.push({ name: `finger${i}`, parent: 0, at: [x, 0.12, 0.2] }, { name: `finger${i}Tip`, parent: base, at: [x + Math.sin(fan) * reach * 0.5, 0.1, 0.2 + reach * 0.5] });
    m.joint = base; m.cylinder("flesh", [x + Math.sin(fan) * reach * 0.25, 0.11, 0.2 + reach * 0.25], 0.032, reach * 0.5, 2, 6);
    m.joint = tip; m.cylinder("knuckle", [x + Math.sin(fan) * reach * 0.75, 0.07, 0.2 + reach * 0.75], 0.026, reach * 0.5, 2, 6);
    legs.push([base, tip]);
  });
  const walk = [...legs.flatMap(([base, tip], i) => [sway(base!, 0, 0.5, (i % 2) * Math.PI, 0.8), sway(tip!, 0, 0.35, (i % 2) * Math.PI + 1, 0.8)]), bob(0, joints[0]!.at, 0.015, 0.4)]; // type-escape: authoring script indexes its own fixed tables
  return write("hand", joints, m, {
    idle: [bob(0, joints[0]!.at, 0.01, 2), ...legs.map(([base], i) => sway(base!, 0, 0.06, i, 2))], // type-escape: authoring script indexes its own fixed tables
    walk,
    windup: [hold(0, 0, -0.5, 0.7), ...legs.map(([base]) => hold(base!, 0, 0.4, 0.7))], // type-escape: authoring script indexes its own fixed tables
  });
}

/** Builds a low four- or six-legged body: torso, a head with one lit optic and gaunt two-segment legs. */
async function quadruped(name: string, o: { length: number; width: number; height: number; legs: number; leg: number; thick: number; body: string; limb: string; optics: number }): Promise<Record<string, unknown>> {
  const top = o.leg + o.height / 2, joints: Joint[] = [{ name: "root", parent: -1, at: [0, o.leg, 0] }, { name: "head", parent: 0, at: [0, top, o.length / 2] }], m = new Mesh();
  m.joint = 0;
  m.box(o.body, [0, top, 0], [o.width, o.height, o.length]).box("plate", [0, top + o.height / 2 + 0.03, -o.length * 0.1], [o.width * 0.8, 0.06, o.length * 0.6]);
  m.joint = 1;
  m.box(o.body, [0, top, o.length / 2 + o.length * 0.12], [o.width * 0.6, o.height * 0.8, o.length * 0.28]);
  for (let i = 0; i < o.optics; i++) m.cylinder("optic", [(i - (o.optics - 1) / 2) * o.width * 0.22, top + o.height * 0.12, o.length / 2 + o.length * 0.26], o.thick * 0.5, 0.04, 2, 8);
  const pairs = o.legs / 2, limbs: number[][] = [];
  for (let row = 0; row < pairs; row++) for (const side of [-1, 1]) {
    const z = pairs === 1 ? 0 : -o.length / 2 + (o.length * (row + 0.5)) / pairs, x = side * (o.width / 2 + o.thick * 0.5);
    const hip = joints.length, foot = hip + 1;
    joints.push({ name: `leg${row}${side > 0 ? "R" : "L"}`, parent: 0, at: [x, top - o.height * 0.2, z] }, { name: `shin${row}${side > 0 ? "R" : "L"}`, parent: hip, at: [x + side * o.leg * 0.35, o.leg * 0.5, z] });
    m.joint = hip; m.cylinder(o.limb, [x + side * o.leg * 0.18, (top - o.height * 0.2 + o.leg * 0.5) / 2, z], o.thick, o.leg * 0.62, 1, 6);
    m.joint = foot; m.cylinder(o.limb, [x + side * o.leg * 0.35, o.leg * 0.25, z], o.thick * 0.8, o.leg * 0.55, 1, 6).box("tread", [x + side * o.leg * 0.35, 0.04, z], [o.thick * 3, 0.08, o.thick * 3.5]);
    limbs.push([hip, foot, (row + (side > 0 ? 1 : 0)) % 2]);
  }
  const period = o.length > 2 ? 1.6 : 0.7;
  return write(name, joints, m, {
    idle: [bob(0, joints[0]!.at, 0.015 * o.height, 2.4), sway(1, 0, 0.05, 0, 3)], // type-escape: authoring script indexes its own fixed tables
    walk: [bob(0, joints[0]!.at, 0.03 * o.height, period / 2), ...limbs.flatMap(([hip, foot, phase]) => [sway(hip!, 0, 0.45, phase! * Math.PI, period), sway(foot!, 0, 0.3, phase! * Math.PI + 1.2, period)]), sway(1, 1, 0.08, 0, period)], // type-escape: authoring script indexes its own fixed tables
    windup: [hold(1, 0, -0.45, 0.7), hold(0, 0, -0.18, 0.7), ...limbs.filter((_, i) => i < 2).map(([hip]) => hold(hip!, 0, -0.9, 0.7))], // type-escape: authoring script indexes its own fixed tables
  });
}

const models = [
  await hand(),
  await quadruped("courier", { length: 1.1, width: 0.5, height: 0.34, legs: 4, leg: 0.62, thick: 0.045, body: "gauntMetal", limb: "gauntMetal", optics: 1 }),
  await quadruped("tank-crawler", { length: 3.6, width: 2.4, height: 1.1, legs: 6, leg: 0.9, thick: 0.18, body: "hull", limb: "plate", optics: 3 }),
];
writeFileSync(new URL("asset-manifest.json", OUT), JSON.stringify({ schema: 1, author: "Deepward project contributors", license: "CC0-1.0", original: true, source: "scripts/build-fauna.ts", units: "metres", pivot: "floor centre [0,0,0]", facing: "+Z", up: "+Y", models }, null, 2) + "\n");
writeFileSync(new URL("LICENSE.txt", OUT), readFileSync(new URL("../public/models/imported/deepward/LICENSE.txt", import.meta.url)));
console.log(models.map((model) => `${model["id"]} ${model["bytes"]}B ${(model["dims"] as number[]).map((v) => v.toFixed(2)).join("x")}`).join("\n")); // type-escape: authoring script indexes its own fixed tables
