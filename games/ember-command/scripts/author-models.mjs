/** Original Ember Command miniatures. Rebuild with `bun run art:author`.
 * Uses Three.js GLTFExporter: https://threejs.org/docs/pages/GLTFExporter.html
 * No downloaded meshes or textures are embedded in these assets.
 */
import { mkdir, writeFile } from "node:fs/promises";
import * as T from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// GLTFExporter needs this browser bridge when run in Node/Bun without a DOM.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((buffer) => { this.result = buffer; this.onloadend?.(); }); }
};
const out = new URL("../src/game/art/", import.meta.url);
await mkdir(out, { recursive: true });
const palette = {
  stone: "#918979", dark: "#484f52", mortar: "#625f57", wood: "#69503b",
  bronze: "#c48d48", roof: "#547f7b", blue: "#338bc0", red: "#bd4531",
  cloth: "#ece0b6", steel: "#c4d6d6", skin: "#c99672", gold: "#f1bf50",
  black: "#242e36", leaf: "#3e654b", moss: "#738352",
};
const materials = Object.fromEntries(Object.entries(palette).map(([id, color]) => [id,
  new T.MeshStandardMaterial({ color, roughness: id === "steel" ? .35 : .86,
    metalness: ["steel", "bronze", "gold"].includes(id) ? .55 : 0, flatShading: true })]));
materials.fire = new T.MeshStandardMaterial({ color: "#ffc35e", emissive: "#ff8c2e", emissiveIntensity: 1.2 });
function mesh(g, geometry, mat, p = [0, 0, 0], r = [0, 0, 0]) {
  const m = new T.Mesh(geometry, materials[mat]); m.position.set(...p); m.rotation.set(...r); g.add(m); return m;
}
function box(g, size, mat, p, r) { return mesh(g, new T.BoxGeometry(...size), mat, p, r); }
function cyl(g, top, bottom, h, mat, p, sides = 8, r) { return mesh(g, new T.CylinderGeometry(top, bottom, h, sides), mat, p, r); }
function cone(g, rad, h, mat, p, sides = 4, r) { return mesh(g, new T.ConeGeometry(rad, h, sides), mat, p, r); }
function group(name, p = [0, 0, 0]) { const g = new T.Group(); g.name = name; g.position.set(...p); return g; }
function banner(g, x, y, z, side) {
  cyl(g, .055, .07, 2, "bronze", [x, y + 1, z]);
  box(g, [.85, .95, .055], side, [x + .43, y + 1.4, z]);
  box(g, [.12, .66, .07], "cloth", [x + .43, y + 1.4, z]);
  cone(g, .12, .25, "gold", [x, y + 2.13, z], 4);
}
function window(g, x, y, z, wide = .32) {
  box(g, [wide + .14, .78, .12], "bronze", [x, y, z]);
  box(g, [wide, .62, .14], "black", [x, y, z + .03]);
  box(g, [.035, .58, .16], "gold", [x, y, z + .04]);
}
function keep(enemy = false) {
  const g = group(enemy ? "Marauder_Warcamp" : "Ember_Bastion");
  const side = enemy ? "red" : "blue";
  cyl(g, 4.8, 5.1, .42, "mortar", [0, .21, 0], 8);
  box(g, [5.4, 2.9, 4.3], "stone", [0, 1.85, 0]);
  box(g, [5.7, .3, 4.6], "dark", [0, 3.35, 0]);
  // Broad roof and a steep central copper lantern make the friendly silhouette.
  cone(g, 4.05, 2.35, enemy ? "red" : "roof", [0, 4.65, 0], 4, [0, Math.PI / 4, 0]);
  for (const x of [-2.7, 2.7]) {
    for (const z of [-2.1, 2.1]) {
      cyl(g, .95, 1.12, enemy ? 4.1 : 3.7, "stone", [x, 2.2, z], 8);
      cyl(g, 1.1, 1.02, .35, "bronze", [x, 4.1, z], 8);
      if (enemy) cone(g, 1.22, 2.5, "red", [x, 5.45, z], 8);
      else {
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3;
          box(g, [.4, .55, .42], "stone", [x + Math.cos(a) * .8, 4.5, z + Math.sin(a) * .8]);
        }
        cone(g, .85, 1.1, "roof", [x, 4.95, z], 8);
      }
    }
  }
  for (const x of [-1.7, 1.7]) window(g, x, 2.4, 2.19);
  box(g, [1.5, 2.4, .25], "dark", [0, 1.6, 2.22]);
  box(g, [1.05, 1.8, .28], "wood", [0, 1.3, 2.37]);
  for (const x of [-.4, 0, .4]) box(g, [.055, 1.9, .1], "bronze", [x, 1.3, 2.57]);
  for (const y of [.6, 1.2, 1.8]) box(g, [1.15, .075, .1], "bronze", [0, y, 2.58]);
  for (let i = 0; i < 3; i++) box(g, [2 + i * .3, .18, .5], "stone", [0, .09 + i * .18, 3.45 - i * .4]);
  banner(g, -.55, 5.35, -.4, side);
  if (enemy) for (const x of [-3.4, -2.3, -1.2, 1.2, 2.3, 3.4]) {
    cyl(g, .15, .24, 2, "wood", [x, 1, -3], 5);
    cone(g, .22, .7, "steel", [x, 2.25, -3], 5);
  }
  return g;
}
function hall(type) {
  const g = group(type);
  if (type === "guard_tower") {
    cyl(g, 1.05, 1.65, 4.8, "stone", [0, 2.4, 0], 8);
    cyl(g, 1.8, 1.55, .65, "wood", [0, 4.8, 0], 8);
    cone(g, 2.1, 1.6, "roof", [0, 6.2, 0], 8);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; cyl(g, .1, .12, 1.4, "wood", [Math.cos(a) * 1.45, 5.35, Math.sin(a) * 1.45]); }
    window(g, 0, 3.2, 1.22, .35); banner(g, .4, 6.7, 0, "blue");
  } else {
    const farm = type === "farm";
    box(g, [farm ? 4 : 5.5, .3, 4.2], "stone", [0, .15, 0]);
    box(g, [farm ? 3.4 : 5, 2.4, 3.4], farm ? "cloth" : "stone", [0, 1.5, 0]);
    cone(g, farm ? 3.1 : 3.9, 2.3, farm ? "bronze" : "roof", [0, 3.65, 0], 4, [0, Math.PI / 4, 0]);
    for (const x of [-1.4, 1.4]) box(g, [.18, 2.4, .16], "wood", [x, 1.5, 1.76]);
    box(g, [.85, 1.9, .14], "wood", [0, 1.22, 1.8]);
    window(g, -1, 1.8, 1.78); window(g, 1, 1.8, 1.78);
    if (farm) {
      for (let i = 0; i < 5; i++) box(g, [.28, .13, 3.7], "moss", [2.2 + i * .45, .18, 0]);
      for (const z of [-1.7, 1.7]) box(g, [2.7, .2, .2], "wood", [3.1, .75, z]);
    } else {
      banner(g, -2.4, 2.5, 1, "blue");
      for (const x of [2.8, 3.4]) { cyl(g, .08, .08, 2, "wood", [x, 1, .3]); cone(g, .2, .5, "steel", [x, 2.2, .3], 4); }
    }
  }
  return g;
}
function warrior(type) {
  const g = group(type);
  const enemy = ["grunt", "reaver"].includes(type), hero = type === "hero", worker = type === "peasant", rifle = type === "rifleman";
  const side = enemy ? "red" : hero ? "bronze" : worker ? "wood" : "blue";
  cyl(g, .39, .28, .72, side, [0, 1.2, 0], 6);
  box(g, [.54, .1, .48], "bronze", [0, .91, 0]);
  mesh(g, new T.IcosahedronGeometry(.3, 0), "skin", [0, 1.9, 0]);
  if (!worker) {
    cyl(g, .32, .37, .25, "steel", [0, 2.05, 0], 6);
    box(g, [.5, .11, .07], "black", [0, 1.98, .29]);
    box(g, [.08, .38, .1], "steel", [0, 1.89, .3]);
    if (hero || enemy) cone(g, .2, .6, side, [0, 2.46, 0], 4);
    if (hero) {
      box(g, [.63, .95, .11], "blue", [0, 1.35, -.33], [-.2, 0, 0]);
      cyl(g, .12, .1, .13, "gold", [0, 1.39, .3], 6, [Math.PI / 2, 0, 0]);
    }
  } else cone(g, .43, .35, "cloth", [0, 2.12, 0], 8);
  for (const [name, x] of [["LegL", -.2], ["LegR", .2]]) {
    const limb = group(name, [x, .87, 0]); g.add(limb);
    box(limb, [.24, .58, .28], "black", [0, -.28, 0]);
    box(limb, [.28, .24, .43], "wood", [0, -.65, .09]);
  }
  for (const [name, x] of [["ArmL", -.48], ["ArmR", .48]]) {
    const limb = group(name, [x, 1.48, 0]); g.add(limb);
    mesh(limb, new T.IcosahedronGeometry(.27, 0), worker ? "cloth" : "steel");
    box(limb, [.22, .55, .24], side, [0, -.31, 0]);
    mesh(limb, new T.IcosahedronGeometry(.15, 0), "skin", [0, -.58, 0]);
    if (name === "ArmL" && !worker && !rifle) {
      const shield = mesh(limb, new T.CylinderGeometry(.42, .42, .12, 6), side, [-.15, -.25, .15], [Math.PI / 2, 0, 0]);
      box(limb, [.07, .6, .15], "bronze", [-.15, -.25, .25]);
      shield.name = "Shield";
    }
    if (name === "ArmR") {
      if (rifle) {
        box(limb, [.18, .25, .8], "wood", [0, -.48, .4]);
        cyl(limb, .07, .08, 1.15, "steel", [0, -.42, .93], 6, [Math.PI / 2, 0, 0]);
      } else {
        box(limb, [.09, .8, .09], "wood", [0, -.1, .2]);
        if (worker || type === "reaver") box(limb, [.66, .3, .13], "steel", [.17, .4, .2]);
        else {
          cone(limb, .14, .9, "steel", [0, .68, .2], 4);
          box(limb, [.43, .08, .13], "bronze", [0, .22, .2]);
        }
      }
    }
  }
  const q = (a) => new T.Quaternion().setFromEuler(new T.Euler(a, 0, 0)).toArray();
  const tracks = ["LegL", "LegR", "ArmL", "ArmR"].map((name, i) => new T.QuaternionKeyframeTrack(`${name}.quaternion`, [0, .25, .5, .75, 1], [0, 1, 0, -1, 0].flatMap((v) => q(v * .45 * (i % 2 ? -1 : 1)))));
  g.animations = [new T.AnimationClip("Walking_A", 1, tracks),
    new T.AnimationClip("Idle", 2, [new T.QuaternionKeyframeTrack("ArmR.quaternion", [0, 1, 2], [...q(0), ...q(.04), ...q(0)])])];
  return g;
}
function prop(type) {
  const g = group(type);
  if (type.startsWith("banner")) banner(g, -.4, 0, 0, type === "banner_blue" ? "blue" : "red");
  if (type === "torch") {
    cyl(g, .14, .2, 1.5, "dark", [0, .75, 0]);
    cyl(g, .4, .2, .3, "bronze", [0, 1.55, 0]);
    for (let i = 0; i < 3; i++) cone(g, .14, .6 + i * .13, "fire", [(i - 1) * .16, 1.9, 0], 5);
  }
  if (type === "barrel") {
    cyl(g, .4, .4, 1, "wood", [0, .5, 0], 10);
    for (const y of [.1, .45, .9]) cyl(g, .43, .43, .08, "dark", [0, y, 0], 10);
  }
  if (type === "goldmine") {
    for (let i = 0; i < 5; i++) {
      const rock = mesh(g, new T.IcosahedronGeometry(.9, 0), "dark", [Math.sin(i * 2) * 1.2, .55 + i * .13, Math.cos(i * 2) * .9]); rock.scale.set(1, .85, 1);
      cone(g, .19, .8, "gold", [Math.sin(i * 2) * 1.1, 1.15 + i * .13, Math.cos(i * 2) * .7], 5, [.25, i, .3]);
    }
    box(g, [1.1, 1.3, .2], "black", [0, .65, 1.1]);
    for (const x of [-.65, .65]) box(g, [.2, 1.55, .3], "wood", [x, .8, 1.25]);
    box(g, [1.5, .25, .3], "wood", [0, 1.6, 1.25]);
  }
  if (type === "woods") {
    for (const [x, z, h] of [[0, 0, 4.2], [-1, -.7, 3.5], [.9, .5, 3.9]]) {
      cyl(g, .13, .28, h * .8, "wood", [x, h * .4, z], 6);
      for (let i = 0; i < 3; i++) cone(g, 1.3 - i * .2, 2, i % 2 ? "moss" : "leaf", [x, h * .55 + i * .65, z], 7);
    }
    for (let i = 0; i < 3; i++) cyl(g, .22, .22, 1.5, "wood", [-.8 + i * .45, .25, 1.4], 6, [Math.PI / 2, 0, 0]);
  }
  return g;
}
// Batch same-material static pieces, leaving animated joint groups intact.
function batch(g) {
  for (const child of [...g.children]) if (child.isGroup) batch(child);
  const byMat = new Map();
  for (const child of [...g.children]) if (child.isMesh) {
    child.updateMatrix();
    const geo = (child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone()).applyMatrix4(child.matrix);
    const list = byMat.get(child.material) ?? []; list.push(geo); byMat.set(child.material, list); g.remove(child);
  }
  for (const [mat, geometries] of byMat) { const m = new T.Mesh(mergeGeometries(geometries), mat); g.add(m); }
}
const models = {
  keep_player: keep(), keep_enemy: keep(true),
  ...Object.fromEntries(["barracks", "farm", "guard_tower"].map((id) => [id, hall(id)])),
  ...Object.fromEntries(["peasant", "footman", "rifleman", "hero", "grunt", "reaver"].map((id) => [id, warrior(id)])),
  ...Object.fromEntries(["banner_blue", "banner_red", "torch", "barrel", "goldmine", "woods"].map((id) => [id, prop(id)])),
};
const imports = [], entries = [];
let totalBytes = 0;
for (const [id, model] of Object.entries(models)) {
  batch(model);
  const data = await new GLTFExporter().parseAsync(model, { binary: true, animations: model.animations });
  await writeFile(new URL(`${id}.glb`, out), Buffer.from(data));
  totalBytes += data.byteLength;
  imports.push(`import ${id} from "./art/${id}.glb?url";`);
  entries.push(`  ${id},`);
}
await writeFile(new URL("../src/game/authoredModels.ts", import.meta.url),
  `// Generated by scripts/author-models.mjs. Original geometry; do not hand-edit.\n${imports.join("\n")}\nexport const authoredModels = {\n${entries.join("\n")}\n};\n`);
console.log(`Authored ${Object.keys(models).length} Ember Command models (${totalBytes} bytes).`);
