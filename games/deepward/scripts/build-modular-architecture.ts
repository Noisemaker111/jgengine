/** Original Deepward modular architecture: wall bays, columns, a gantry span and pipe runs.
 * Run once from the repo root with `bun games/deepward/scripts/build-modular-architecture.ts`.
 * Models are floor-origin, metres, +Y up, +Z facing; placement is the editor's (`author-architecture.ts`).
 */
// The assets package owns the glTF writer; games carry no copy of it.
const { Document, NodeIO } = await import("../../../packages/assets/node_modules/@gltf-transform/core");
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const OUT = new URL("../public/models/imported/deepward/architecture/", import.meta.url);
mkdirSync(OUT, { recursive: true });

import { Mesh, PALETTE, type V3 } from "./architectureKit";

async function write(name: string, mesh: Mesh): Promise<{ id: string; file: string; url: string; sha256: string; bytes: number; bounds: { min: V3; max: V3 }; dims: V3 }> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene(name);
  const node = doc.createNode(name);
  const gltfMesh = doc.createMesh(name);
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const [material, part] of mesh.parts) {
    const def = PALETTE[material]!;
    const mat = doc.createMaterial(material).setBaseColorFactor([...def.color, 1]).setMetallicFactor(def.metal).setRoughnessFactor(def.rough);
    if (def.emissive) mat.setEmissiveFactor(def.emissive);
    const position = doc.createAccessor().setType("VEC3").setArray(new Float32Array(part.positions)).setBuffer(buffer);
    const normal = doc.createAccessor().setType("VEC3").setArray(new Float32Array(part.normals)).setBuffer(buffer);
    const index = doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(part.indices)).setBuffer(buffer);
    gltfMesh.addPrimitive(doc.createPrimitive().setAttribute("POSITION", position).setAttribute("NORMAL", normal).setIndices(index).setMaterial(mat));
    for (let i = 0; i < part.positions.length; i += 3) for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, part.positions[i + k]!);
      max[k] = Math.max(max[k]!, part.positions[i + k]!);
    }
  }
  node.setMesh(gltfMesh);
  scene.addChild(node);
  const bytes = await new NodeIO().writeBinary(doc);
  const file = `${name}.glb`;
  writeFileSync(new URL(file, OUT), bytes);
  return { id: `deepward/architecture/${name}`, file, url: `/models/imported/deepward/architecture/${file}`, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, bounds: { min, max }, dims: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

/** One 3 m wall bay, interior face on z = 0, 0.22 m deep behind it: kick plate, brass stripe, recessed service panel, seam ribs and rivet rows. */
function wallBay(height: number): Mesh {
  const m = new Mesh(), w = 3, d = 0.22;
  m.box("slate", [0, height / 2, -d / 2], [w, height, d]);
  m.box("steel", [0, 0.16, 0.025], [w, 0.32, 0.05]);
  m.box("brass", [0, 0.46, 0.02], [w, 0.065, 0.04]);
  for (const x of [-w / 2 + 0.035, w / 2 - 0.035]) m.box("iron", [x, height / 2, 0.02], [0.07, height, 0.04]);
  const panelH = Math.min(1.9, height - 1.4);
  m.box("iron", [0, 1.15 + panelH / 2, 0.012], [2.5, panelH, 0.024]);
  for (const side of [-1, 1]) m.box("steel", [side * 1.25, 1.15 + panelH / 2, 0.035], [0.06, panelH + 0.06, 0.05]);
  for (const y of [1.15, 1.15 + panelH]) m.box("steel", [0, y, 0.035], [2.56, 0.06, 0.05]);
  m.box("steel", [0, height - 0.12, 0.03], [w, 0.24, 0.06]);
  for (const x of [-1.42, 1.42]) for (let y = 0.7; y < height - 0.3; y += 0.62) m.cylinder("brass", [x, y, 0.045], 0.022, 0.02, 2, 6);
  return m;
}
/** An I-section column on a base plate with a capital and a lit collar. */
function column(height: number, glow: "cyan" | "red"): Mesh {
  const m = new Mesh();
  m.box("iron", [0, 0.07, 0], [0.7, 0.14, 0.7]);
  m.box("steel", [0, height / 2, 0], [0.12, height, 0.5]);
  for (const z of [-0.25, 0.25]) m.box("steel", [0, height / 2, z], [0.46, height - 0.3, 0.07]);
  m.box("iron", [0, 0.36, 0], [0.5, 0.44, 0.52]);
  m.box(glow, [0, 1.25, 0], [0.54, 0.04, 0.56]);
  m.box("brass", [0, 1.4, 0], [0.52, 0.06, 0.54]);
  m.box("iron", [0, height - 0.12, 0], [0.74, 0.24, 0.74]);
  for (const x of [-0.28, 0.28]) for (const z of [-0.28, 0.28]) m.cylinder("brass", [x, 0.17, z], 0.03, 0.06, 1, 6);
  return m;
}
/** A slim I-section rib for the return spine: flange pair, web, brass collar. */
function rib(height: number): Mesh {
  const m = new Mesh();
  m.box("iron", [0, 0.06, 0], [0.3, 0.12, 0.28]);
  m.box("steel", [0, height / 2, 0], [0.06, height, 0.22]);
  for (const x of [-0.09, 0.09]) m.box("steel", [x, height / 2, 0], [0.04, height - 0.2, 0.22]);
  m.box("brass", [0, 1.1, 0], [0.26, 0.05, 0.24]);
  m.box("iron", [0, height - 0.06, 0], [0.3, 0.12, 0.28]);
  return m;
}
/** A 5.5 m gantry span: top chord, lower chord, diagonals, and an amber hoist stop at each end. */
function gantry(): Mesh {
  const m = new Mesh(), len = 5.5, h = 0.5;
  for (const y of [0.04, h - 0.04]) m.box("steel", [0, y, 0], [len, 0.08, 0.26]);
  m.box("steel", [0, h / 2, 0], [len, 0.04, 0.05]);
  const panels = 11;
  for (let i = 0; i < panels; i++) {
    const x0 = -len / 2 + (i / panels) * len, x1 = -len / 2 + ((i + 1) / panels) * len;
    m.box("iron", [(x0 + x1) / 2, h / 2, 0], [(x1 - x0) * 0.9, 0.035, 0.05]);
    m.box("steel", [x0, h / 2, 0], [0.05, h, 0.12]);
  }
  for (const side of [-1, 1]) m.box("amber", [side * (len / 2 - 0.1), h / 2, 0], [0.2, h, 0.3]);
  return m;
}
/** A 4 m pipe run on the Z axis at radius 0.2 with flange rings, a brass collar and a hanger; scale uniformly with the instance. */
function pipeRun(): Mesh {
  const m = new Mesh(), r = 0.2, len = 4;
  m.cylinder("steel", [0, 0, 0], r, len, 2, 14);
  for (const z of [-len / 2 + 0.1, 0, len / 2 - 0.1]) m.cylinder("iron", [0, 0, z], r * 1.32, 0.12, 2, 14);
  m.cylinder("brass", [0, 0, len / 4], r * 1.12, 0.1, 2, 14);
  m.cylinder("brass", [0, 0, -len / 4], r * 1.12, 0.1, 2, 14);
  m.box("iron", [0, r * 1.6, 0], [0.06, r * 1.2, 0.1]);
  return m;
}
/** A 4 m vertical pipe stand, the same pipe turned upright. */
function pipeStand(): Mesh {
  const m = new Mesh(), r = 0.2, len = 4;
  m.cylinder("steel", [0, len / 2, 0], r, len, 1, 14);
  for (const y of [0.1, len / 2, len - 0.1]) m.cylinder("iron", [0, y, 0], r * 1.32, 0.12, 1, 14);
  m.cylinder("brass", [0, len * 0.75, 0], r * 1.12, 0.1, 1, 14);
  m.cylinder("brass", [0, len * 0.25, 0], r * 1.12, 0.1, 1, 14);
  return m;
}

const models = [];
for (const [name, h] of [["wall-bay-3p9", 3.9], ["wall-bay-4p2", 4.2], ["wall-bay-4p4", 4.4], ["wall-bay-6", 6]] as const) models.push(await write(name, wallBay(h)));
models.push(await write("rib-3p9", rib(3.9)), await write("column-3p9", column(3.9, "cyan")), await write("column-6", column(6, "red")));
models.push(await write("gantry-span", gantry()), await write("pipe-run", pipeRun()), await write("pipe-stand", pipeStand()));
const manifest = {
  schema: 1,
  author: "Deepward project contributors",
  license: "CC0-1.0",
  original: true,
  source: "scripts/build-modular-architecture.ts",
  units: "metres",
  pivot: "floor centre [0,0,0]; wall bays pivot on their interior face",
  facing: "+Z",
  up: "+Y",
  models,
};
writeFileSync(new URL("asset-manifest.json", OUT), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(new URL("LICENSE.txt", OUT), readFileSync(new URL("../public/models/imported/deepward/LICENSE.txt", import.meta.url)));
console.log(models.map((model) => `${model.id} ${model.bytes}B ${model.dims.map((v) => v.toFixed(2)).join("x")}`).join("\n"));
