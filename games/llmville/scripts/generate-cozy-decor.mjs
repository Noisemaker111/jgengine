import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Box3, CatmullRomCurve3, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, TubeGeometry, Vector3 } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { WORLD_MODEL_NATIVE_EXTENTS } from "../packages/game/src/scene/worldModelNativeExtents.ts";

globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
};

const palette = { cream: "#f4ecdd", wood: "#b07a4e", teal: "#5fc2a8", coral: "#e8836b", ink: "#243a32", amber: "#e0a95c" };
const material = (color, glow = false) => new MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, emissive: glow ? color : "#000000", emissiveIntensity: glow ? 1.2 : 0 });
function part(group, geometry, color, position, scale = [1, 1, 1], glow = false) {
  const mesh = new Mesh(geometry, material(color, glow));
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  group.add(mesh);
  return mesh;
}
function box(group, size, color, position) {
  return part(group, new RoundedBoxGeometry(...size, 2, Math.min(0.07, ...size.map((value) => value / 4))), color, position);
}
function curve(group, points, color, radius = 0.018, glow = false) {
  return part(group, new TubeGeometry(new CatmullRomCurve3(points.map((point) => new Vector3(...point))), 20, radius, 6, false), color, [0, 0, 0], [1, 1, 1], glow);
}
function plant(fiber) {
  const group = new Group();
  part(group, new CylinderGeometry(0.24, 0.19, 0.38, 20), fiber ? palette.ink : palette.coral, [0, 0.19, 0]);
  part(group, new CylinderGeometry(0.21, 0.21, 0.03, 20), "#493529", [0, 0.37, 0]);
  if (fiber) {
    for (let i = 0; i < 15; i++) {
      const angle = i * 2.399;
      const x = Math.cos(angle) * (0.16 + i % 3 * 0.07);
      const z = Math.sin(angle) * (0.16 + i % 3 * 0.07);
      const height = 0.95 + (i % 5) * 0.13;
      const color = [palette.teal, palette.amber, palette.coral][i % 3];
      curve(group, [[0, 0.38, 0], [x * 0.4, height * 0.75, z * 0.4], [x, height, z]], color, 0.009, true);
      part(group, new SphereGeometry(0.035, 10, 8), color, [x, height, z], [1, 1, 1], true);
    }
  } else {
    curve(group, [[0, 0.35, 0], [0.04, 0.95, 0], [-0.03, 1.75, 0.01]], "#507951", 0.025);
    for (let i = 0; i < 11; i++) {
      const angle = i * 2.399;
      const x = Math.cos(angle) * 0.23;
      const z = Math.sin(angle) * 0.23;
      const y = 0.65 + i * 0.1;
      curve(group, [[0, y - 0.12, 0], [x / 2, y, z / 2], [x, y + 0.03, z]], "#547e4a", 0.012);
      const leaf = part(group, new SphereGeometry(1, 12, 8), i % 2 ? "#6f9d5b" : "#3d7657", [x, y + 0.06, z], [0.12, 0.23, 0.035]);
      leaf.rotation.set(0.3, -angle, 0.45);
    }
  }
  return group;
}
function display(kind) {
  const group = new Group();
  box(group, [1.25, 0.9, 0.09], palette.wood, [0, 0.9, 0]);
  box(group, [1.13, 0.78, 0.035], kind === "banner" ? palette.teal : palette.ink, [0, 0.9, 0.06]);
  part(group, new CylinderGeometry(0.035, 0.035, 0.52, 12), palette.wood, [-0.43, 0.27, 0]);
  part(group, new CylinderGeometry(0.035, 0.035, 0.52, 12), palette.wood, [0.43, 0.27, 0]);
  box(group, [1.1, 0.08, 0.35], palette.wood, [0, 0.04, 0]);
  if (kind === "cables") {
    for (let i = 0; i < 5; i++) {
      const y = 0.65 + i * 0.12;
      curve(group, [[-0.46, y, 0.12], [-0.2, y + 0.15, 0.14], [0.2, y - 0.12, 0.14], [0.46, y, 0.12]], [palette.coral, palette.amber, palette.teal, "#8db6de", palette.cream][i], 0.022);
      for (const x of [-0.49, 0.49]) box(group, [0.055, 0.06, 0.04], palette.cream, [x, y, 0.11]);
    }
  } else if (kind === "banner") {
    for (let i = 0; i < 6; i++) {
      const height = [0.22, 0.4, 0.31, 0.48, 0.28, 0.35][i];
      box(group, [0.12, height, 0.035], palette.cream, [-0.43 + i * 0.17, 0.59 + height / 2, 0.1]);
    }
    part(group, new SphereGeometry(0.09, 16, 12), palette.amber, [0.35, 1.15, 0.09], [1, 1, 0.25]);
    for (let i = 0; i < 7; i++) curve(group, [[-0.48 + i * 0.16, 0.49, 0], [-0.48 + i * 0.16, 0.38, 0.01]], palette.cream, 0.017);
  } else {
    part(group, new CylinderGeometry(0.08, 0.08, 0.32, 16), palette.cream, [0, 0.91, 0.13]);
    part(group, new ConeGeometry(0.08, 0.15, 16), palette.coral, [0, 1.14, 0.13]);
    part(group, new ConeGeometry(0.055, 0.15, 12), palette.amber, [0, 0.69, 0.13]).rotation.z = Math.PI;
    part(group, new SphereGeometry(0.038, 12, 8), palette.teal, [0, 0.95, 0.21]);
    for (const x of [-0.12, 0.12]) box(group, [0.12, 0.1, 0.03], palette.coral, [x, 0.8, 0.12]);
    for (const [x, y] of [[-0.35, 1.12], [0.34, 0.77], [-0.27, 0.7], [0.3, 1.2]]) part(group, new SphereGeometry(0.025, 8, 6), palette.amber, [x, y, 0.11], [1, 1, 0.3]);
  }
  return group;
}

function furniture(kind) {
  const group = new Group();
  if (kind === "rug" || kind === "mat") {
    box(group, [1, 0.03, 1.5], kind === "rug" ? palette.coral : palette.teal, [0, 0.015, 0]);
    for (let i = 0; i < 6; i++) box(group, [0.9, 0.006, 0.025], palette.cream, [0, 0.033, -0.58 + i * 0.23]);
    if (kind === "mat") part(group, new CylinderGeometry(0.1, 0.1, 1, 16), palette.teal, [0, 0.12, 0.6]).rotation.z = Math.PI / 2;
  } else if (kind === "chair") {
    box(group, [0.62, 0.09, 0.58], palette.coral, [0, 0.5, 0]);
    box(group, [0.62, 0.43, 0.08], palette.coral, [0, 0.95, 0.25]);
    for (const x of [-0.25, 0.25]) {
      curve(group, [[x, 0.03, -0.28], [x, 0.5, 0.15], [x, 1.12, 0.28]], palette.ink, 0.035);
      curve(group, [[x, 0.03, 0.3], [x, 0.5, -0.22]], palette.ink, 0.035);
    }
  } else if (kind === "fridge") {
    box(group, [0.65, 1, 0.6], palette.teal, [0, 0.5, 0]);
    box(group, [0.61, 0.91, 0.035], palette.cream, [0, 0.52, 0.32]);
    box(group, [0.035, 0.3, 0.06], palette.wood, [0.21, 0.61, 0.36]);
    for (const [x, y, color] of [[-0.12, 0.74, palette.coral], [0.07, 0.83, palette.amber]]) box(group, [0.11, 0.11, 0.01], color, [x, y, 0.35]);
  } else if (kind === "crate") {
    box(group, [0.64, 0.06, 0.48], palette.wood, [0, 0.03, 0]);
    for (const z of [-0.24, 0.24]) for (const y of [0.14, 0.3]) box(group, [0.7, 0.07, 0.035], palette.wood, [0, y, z]);
    for (const x of [-0.33, 0.33]) box(group, [0.04, 0.36, 0.5], palette.wood, [x, 0.18, 0]);
    for (let i = 0; i < 6; i++) {
      const x = -0.2 + i % 3 * 0.2;
      const z = i < 3 ? -0.1 : 0.1;
      part(group, new CylinderGeometry(0.07, 0.07, 0.36, 12), i % 2 ? palette.teal : palette.coral, [x, 0.24, z]);
      part(group, new CylinderGeometry(0.065, 0.065, 0.012, 12), palette.cream, [x, 0.426, z]);
    }
  } else if (kind === "table" || kind === "monitor") {
    if (kind === "table") part(group, new CylinderGeometry(0.45, 0.44, 0.08, 24), palette.wood, [0, 0.58, 0]);
    else box(group, [0.9, 0.07, 0.4], palette.wood, [0, 0.22, 0]);
    const height = kind === "table" ? 0.55 : 0.2;
    for (const x of [-0.3, 0.3]) for (const z of [-0.15, 0.15]) part(group, new CylinderGeometry(0.025, 0.04, height, 10), palette.ink, [x, height / 2, z]);
  } else if (kind === "plushie") {
    box(group, [0.55, 0.65, 0.38], palette.teal, [0, 0.42, 0]);
    for (const x of [-0.13, 0.13]) {
      part(group, new SphereGeometry(0.055, 12, 8), palette.ink, [x, 0.54, 0.2], [1, 1.25, 0.5]);
      part(group, new SphereGeometry(0.12, 12, 8), palette.cream, [x, 0.1, 0.09], [1, 0.7, 1.3]);
    }
    curve(group, [[-0.07, 0.38, 0.21], [0, 0.35, 0.22], [0.07, 0.38, 0.21]], palette.ink, 0.012);
    for (const x of [-0.35, 0.35]) part(group, new SphereGeometry(0.1, 12, 8), palette.teal, [x, 0.35, 0]);
  } else if (kind === "clock") {
    part(group, new CylinderGeometry(0.45, 0.45, 0.07, 40), palette.wood, [0, 0.45, 0]).rotation.x = Math.PI / 2;
    part(group, new CylinderGeometry(0.4, 0.4, 0.012, 40), palette.cream, [0, 0.45, 0.043]).rotation.x = Math.PI / 2;
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      const mark = box(group, [0.018, 0.055, 0.008], palette.ink, [Math.sin(angle) * 0.34, 0.45 + Math.cos(angle) * 0.34, 0.055]);
      mark.rotation.z = -angle;
    }
    curve(group, [[0, 0.45, 0.06], [-0.17, 0.59, 0.06]], palette.ink, 0.018);
    curve(group, [[0, 0.45, 0.065], [0.23, 0.56, 0.065]], palette.coral, 0.012);
  } else if (kind === "lamp") {
    part(group, new CylinderGeometry(0.24, 0.26, 0.06, 24), palette.wood, [0, 0.03, 0]);
    curve(group, [[0, 0.06, 0], [-0.12, 0.65, 0], [0.2, 0.95, 0]], palette.ink, 0.035);
    part(group, new CylinderGeometry(0.12, 0.28, 0.27, 24), palette.coral, [0.2, 0.85, 0]);
    part(group, new SphereGeometry(0.1, 16, 12), palette.amber, [0.2, 0.73, 0], [1, 0.4, 1], true);
  } else if (kind === "bin") {
    part(group, new CylinderGeometry(0.3, 0.24, 0.5, 20, 1, true), palette.wood, [0, 0.25, 0]);
    part(group, new CylinderGeometry(0.24, 0.24, 0.035, 20), palette.ink, [0, 0.025, 0]);
    for (let i = 0; i < 4; i++) part(group, new TorusGeometry(0.19, 0.018, 6, 20), [palette.coral, palette.teal, palette.amber, palette.cream][i], [0, 0.37 + i * 0.05, 0]).rotation.x = Math.PI / 2;
  } else if (kind === "trophies") {
    for (const x of [-0.43, 0.43]) box(group, [0.06, 1.25, 0.3], palette.wood, [x, 0.625, 0]);
    for (const y of [0.1, 0.65, 1.2]) box(group, [0.9, 0.05, 0.32], palette.wood, [0, y, 0]);
    for (const [x, y] of [[-0.2, 0.13], [0.2, 0.13], [0, 0.68]]) {
      box(group, [0.2, 0.05, 0.2], palette.ink, [x, y, 0]);
      part(group, new CylinderGeometry(0.025, 0.025, 0.15, 10), palette.amber, [x, y + 0.09, 0]);
      part(group, new SphereGeometry(0.12, 16, 12), palette.amber, [x, y + 0.24, 0], [1, 0.8, 1]);
    }
  }
  return group;
}

const assets = [
  ["office_plant_large", "office-plant-large", plant(false)],
  ["fiber_optic_tree", "fiber-optic-tree", plant(true)],
  ["llmville_banner", "llmville-banner", display("banner")],
  ["ethernet_art_display", "cable-art-panel", display("cables")],
  ["motivational_poster", "motivational-poster", display("rocket")],
  ...[
    ["cable_tidy_bin", "bin"], ["folding_chair", "chair"], ["rug_corner", "rug"],
    ["yoga_mat_corner", "mat"], ["snack_fridge", "fridge"], ["energy_drink_crate", "crate"],
    ["side_table", "table"], ["monitor_stand", "monitor"], ["trophy_shelf", "trophies"],
    ["server_plushie", "plushie"], ["wall_clock", "clock"], ["desk_lamp", "lamp"],
  ].map(([id, kind]) => [id, id.replaceAll("_", "-"), furniture(kind), true]),
];
const extentsPath = new URL("../packages/game/src/scene/worldModelNativeExtents.ts", import.meta.url);
let extentsSource = await readFile(extentsPath, "utf8");
for (const [id, filename, group, useNaturalBounds] of assets) {
  const bounds = new Box3().setFromObject(group);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const target = useNaturalBounds ? { width: size.x, height: size.y, depth: size.z, center: [-size.x / 2, size.y / 2, size.z / 2], minY: 0 } : WORLD_MODEL_NATIVE_EXTENTS[id];
  if (!target) throw new Error(`Missing placement extents for ${id}`);
  group.scale.set(target.width / size.x, target.height / size.y, target.depth / size.z);
  group.position.set(target.center[0] - center.x * group.scale.x, target.center[1] - center.y * group.scale.y, target.center[2] - center.z * group.scale.z);
  group.name = id;
  const binary = await new GLTFExporter().parseAsync(group, { binary: true });
  await writeFile(fileURLToPath(new URL(`../public/models/decor/${filename}.glb`, import.meta.url)), Buffer.from(binary));
  if (useNaturalBounds) extentsSource = extentsSource.replace(new RegExp(`  ${id}: \\{[^\\n]+\\},`), `  ${id}: ${JSON.stringify(target)},`);
  console.log(`Created ${filename}.glb`);
}
await writeFile(extentsPath, extentsSource);
