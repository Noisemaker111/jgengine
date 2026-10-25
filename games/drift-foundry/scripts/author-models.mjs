// Original Drift Foundry geometry. Regenerate with node scripts/author-models.mjs.
// Flat-shaded steel, exposed running gear and a welded asymmetrical salvage silhouette.
import { BoxGeometry, CylinderGeometry, TorusGeometry, Vector3, Quaternion, Matrix4, Color } from 'three';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../src/game/art/', import.meta.url));
mkdirSync(output, { recursive: true });
const palette = ['#16282e', '#cc5936', '#edc565', '#758d96', '#eee0c4', '#20242a', '#5de0ce', '#ff4934'];
function author(name, build) {
  const groups = palette.map(() => ({ positions: [], normals: [] }));
  const add = (geo, color, position = [0, 0, 0], rotation = [0, 0, 0]) => {
    geo.rotateX(rotation[0]); geo.rotateY(rotation[1]); geo.rotateZ(rotation[2]); geo.translate(...position);
    const triangles = geo.index ? geo.toNonIndexed() : geo;
    groups[color].positions.push(...triangles.attributes.position.array);
    groups[color].normals.push(...triangles.attributes.normal.array);
    geo.dispose(); if (triangles !== geo) triangles.dispose();
  };
  const box = (size, pos, color, rot) => add(new BoxGeometry(...size), color, pos, rot);
  const cylinder = (r, h, pos, color, rot = [0, 0, 0], top = r) => add(new CylinderGeometry(top, r, h, 12, 1), color, pos, rot);
  const tube = (a, b, r, color) => {
    const from = new Vector3(...a), to = new Vector3(...b), delta = to.clone().sub(from);
    const geo = new CylinderGeometry(r, r, delta.length(), 8);
    geo.applyMatrix4(new Matrix4().compose(from.add(to).multiplyScalar(.5), new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize()), new Vector3(1, 1, 1)));
    add(geo, color);
  };
  const ring = (r, thickness, pos, color, rot) => add(new TorusGeometry(r, thickness, 6, 18), color, pos, rot);
  build({ box, cylinder, tube, ring });
  const buffers = [], views = [], accessors = [], primitives = [];
  let offset = 0;
  function attribute(values, bounds) {
    const bytes = Buffer.from(new Float32Array(values).buffer);
    const view = views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target: 34962 }) - 1;
    offset += bytes.length; buffers.push(bytes);
    const accessor = { bufferView: view, componentType: 5126, count: values.length / 3, type: 'VEC3' };
    if (bounds) {
      accessor.min = [Infinity, Infinity, Infinity]; accessor.max = [-Infinity, -Infinity, -Infinity];
      values.forEach((v, i) => { accessor.min[i % 3] = Math.min(accessor.min[i % 3], v); accessor.max[i % 3] = Math.max(accessor.max[i % 3], v); });
    }
    return accessors.push(accessor) - 1;
  }
  groups.forEach((group, material) => {
    if (group.positions.length) primitives.push({ attributes: { POSITION: attribute(group.positions, true), NORMAL: attribute(group.normals) }, material });
  });
  const materials = palette.map((hex, i) => {
    const c = new Color(hex);
    return { name: hex, pbrMetallicRoughness: { baseColorFactor: [c.r, c.g, c.b, 1], metallicFactor: i === 5 ? .05 : .45, roughnessFactor: .62 }, ...(i > 5 ? { emissiveFactor: [c.r, c.g, c.b] } : {}) };
  });
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0', generator: 'Drift Foundry original geometry', copyright: 'JGengine Games contributors' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name }], meshes: [{ primitives }], materials, buffers: [{ byteLength: offset }], bufferViews: views, accessors }));
  const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
  const bin = Buffer.concat(buffers);
  const header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + padded.length + bin.length, 8);
  jh.writeUInt32LE(padded.length); jh.writeUInt32LE(0x4e4f534a, 4); bh.writeUInt32LE(bin.length); bh.writeUInt32LE(0x004e4942, 4);
  writeFileSync(`${output}${name}.glb`, Buffer.concat([header, jh, padded, bh, bin]));
  console.log(`${name}: ${bin.length} geometry bytes, ${primitives.length} material groups`);
}

author('row-six-buggy', ({ box, cylinder, tube, ring }) => {
  box([1.55, .22, 2.8], [0, .48, 0], 0);
  box([1.35, .24, 1.0], [0, .74, .94], 1, [-.13, 0, 0]);
  box([.18, .025, 1.05], [-.36, .89, .94], 2, [-.13, 0, 0]);
  box([.18, .025, 1.05], [.36, .89, .94], 2, [-.13, 0, 0]);
  for (const x of [-.95, .95]) for (const z of [-1.03, 1.02]) {
    cylinder(.47, .34, [x, .48, z], 5, [0, 0, Math.PI / 2]);
    cylinder(.27, .36, [x, .48, z], 3, [0, 0, Math.PI / 2]);
    cylinder(.12, .38, [x, .48, z], 2, [0, 0, Math.PI / 2]);
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; box([.36, .09, .18], [x, .48 + Math.cos(a) * .45, z + Math.sin(a) * .45], 0, [a, 0, 0]); }
    tube([x * .55, .5, z], [x, .48, z], .08, 3);
    tube([x * .7, .92, z], [x, .48, z], .05, 2);
  }
  for (const x of [-.66, .66]) {
    tube([x, .6, -.95], [x, 1.6, -.6], .065, 3);
    tube([x, 1.6, -.6], [x, 1.6, .25], .065, 3);
    tube([x, 1.6, .25], [x, .65, .6], .065, 3);
    tube([x, .7, -.8], [x, 1.4, .2], .04, 2);
    box([.06, .46, .9], [x, .83, -.1], 1);
    box([.18, .12, .1], [x, .71, -1.45], 7);
    box([.23, .13, .1], [x, .72, 1.51], 4);
  }
  tube([-.66, 1.6, -.6], [.66, 1.6, -.6], .065, 3);
  tube([-.66, 1.6, .25], [.66, 1.6, .25], .065, 3);
  tube([-.66, .75, -.95], [.66, 1.6, -.6], .045, 2);
  box([.65, .13, .6], [0, .73, -.2], 5);
  box([.65, .65, .12], [0, 1.02, -.52], 5, [-.15, 0, 0]);
  ring(.2, .035, [0, 1.06, .26], 0, [-.5, 0, 0]);
  box([.95, .34, .6], [0, .76, -1.02], 3);
  for (const x of [-.3, 0, .3]) cylinder(.09, .3, [x, 1.04, -1.06], 0);
  cylinder(.08, .7, [.5, 1.12, -1.1], 0, [0, 0, -.15]);
  tube([-.8, .45, 1.53], [.8, .45, 1.53], .08, 3);
  cylinder(.055, .9, [-.58, 1.85, -.64], 0);
  box([.34, .25, .04], [-.42, 2.13, -.64], 2);
});

for (const [name, color] of [['engine', 1], ['front', 2], ['wheels', 6], ['frame', 3]]) author(`pickup-${name}`, ({ box, tube, cylinder, ring }) => {
  cylinder(1.05, .16, [0, .08, 0], 0); ring(.94, .06, [0, .2, 0], color, [Math.PI / 2, 0, 0]);
  for (const x of [-.7, .7]) tube([x, .12, 0], [x, 1.8, 0], .055, color);
  tube([-.7, 1.8, 0], [.7, 1.8, 0], .055, color);
  if (name === 'engine') {
    box([.8, .55, .6], [0, .95, 0], 3);
    for (const x of [-.27, 0, .27]) cylinder(.11, .36, [x, 1.35, 0], color);
  } else if (name === 'wheels') {
    ring(.42, .13, [0, 1, 0], 5); ring(.23, .07, [0, 1, .07], color);
    for (let i = 0; i < 5; i++) ring(.2, .03, [.8, .45 + i * .18, .15], color, [Math.PI / 2, 0, 0]);
  } else if (name === 'front') {
    box([1.1, .55, .12], [0, 1, 0], color, [-.25, 0, 0]);
    for (const x of [-.35, 0, .35]) box([.13, .05, .16], [x, .72, .13], 0);
  } else {
    for (const x of [-.4, .4]) tube([x, .6, 0], [x, 1.4, 0], .08, color);
    tube([-.4, 1.4, 0], [.4, 1.4, 0], .08, color); tube([-.4, .6, 0], [.4, 1.4, 0], .05, 2);
  }
});

author('jump-barrier', ({ box, cylinder }) => {
  box([7.9, .52, .65], [0, .26, 0], 0);
  for (let x = -3.6; x <= 3.6; x += .8) box([.38, .54, .025], [x, .27, -.34], 2, [0, 0, -.4]);
  for (const x of [-3.8, 3.8]) { cylinder(.12, 1.8, [x, .9, 0], 3); box([.2, .18, .2], [x, 1.8, 0], 6); }
});

author('jump-cue', ({ box }) => {
  for (const z of [-3, 0, 3]) for (const side of [-1, 1]) box([2.6, .035, .28], [side * .9, .025, z], 6, [0, side * -.55, 0]);
});

// Installed weldments use the original chassis origin; no imported replacement vehicle.
// Keep the distinctive silhouette above/outside the stock engine, hood, tires and cage.
author('upgrade-salvage_v6', ({ box, cylinder, tube }) => {
  box([1.12, .28, .7], [0, 1.04, -1.07], 1);
  for (const side of [-1, 1]) for (const z of [-1.3, -1.05, -.8]) {
    cylinder(.12, .35, [side * .36, 1.3, z], 2, [0, 0, side * -.3]);
    tube([side * .42, 1.1, z], [side * .72, .85, z], .055, 3);
  }
});
author('upgrade-truck_engine', ({ box, cylinder, tube }) => {
  box([1.24, .48, .82], [0, 1.14, -1.04], 0);
  for (const x of [-.68, .68]) {
    cylinder(.11, 1.28, [x, 1.6, -1.13], 3);
    cylinder(.16, .14, [x, 2.23, -1.13], 0);
    tube([x, 1.02, -1.13], [x * .55, 1.02, -.72], .08, 3);
  }
  box([1.15, .09, .06], [0, 1.36, -1.48], 2);
});
author('upgrade-ev_conversion', ({ box, tube }) => {
  box([1.15, .38, .9], [0, 1.1, -1.04], 3);
  for (const x of [-.39, 0, .39]) {
    box([.28, .29, .83], [x, 1.32, -1.04], 0);
    box([.2, .055, .68], [x, 1.49, -1.04], 6);
  }
  tube([-.62, 1.22, -1.1], [-.76, .75, -.5], .05, 6);
  tube([.62, 1.22, -1.1], [.76, .75, -.5], .05, 2);
});
author('upgrade-plow_blade', ({ box, tube }) => {
  for (const side of [-1, 1]) {
    box([1.21, .62, .13], [side * .55, .47, 1.84], 2, [-.2, side * .24, 0]);
    tube([side * .62, .48, 1.1], [side * .82, .44, 1.78], .075, 3);
    for (const x of [.22, .62, 1]) box([.12, .07, .23], [side * x, .18, 1.95], 0);
  }
  box([.1, .64, .15], [0, .48, 1.96], 3, [-.2, 0, 0]);
});
author('upgrade-hood_plate', ({ box }) => {
  box([1.56, .08, 1.15], [0, .99, 1], 3, [-.13, 0, 0]);
  for (const x of [-.66, .66]) box([.09, .12, 1.15], [x, 1.05, 1], 2, [-.13, 0, 0]);
  for (const z of [.7, .9, 1.1]) box([.77, .035, .07], [0, 1.06, z], 0, [-.13, 0, 0]);
});
author('upgrade-fan_blade_vanes', ({ box, cylinder }) => {
  box([1.92, .12, .3], [0, .63, 1.64], 0);
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++)
    box([.17, .38, .72], [side * (.37 + i * .36), .82, 1.58], i % 2 ? 3 : 6, [-.45, side * .26, side * -.14]);
  cylinder(.13, .1, [0, .77, 1.75], 2);
});
author('upgrade-coil_springs', ({ tube, ring }) => {
  for (const x of [-.87, .87]) for (const z of [-1.03, 1.02]) {
    tube([x, .55, z], [x * .75, 1.05, z], .055, 3);
    for (let i = 0; i < 6; i++) ring(.13, .028, [x * .85, .66 + i * .07, z], 6, [Math.PI / 2, 0, 0]);
  }
});
author('upgrade-steel_rims', ({ cylinder, tube, ring }) => {
  for (const side of [-1, 1]) for (const z of [-1.03, 1.02]) {
    const x = side * 1.15;
    ring(.35, .065, [x, .48, z], 4, [0, Math.PI / 2, 0]);
    cylinder(.14, .12, [x, .48, z], 2, [0, 0, Math.PI / 2]);
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; tube([x, .48, z], [x, .48 + Math.cos(a) * .32, z + Math.sin(a) * .32], .045, 3); }
  }
});
author('upgrade-monster_treads', ({ box, cylinder }) => {
  for (const x of [-1.02, 1.02]) for (const z of [-1.03, 1.02]) {
    cylinder(.6, .48, [x, .56, z], 5, [0, 0, Math.PI / 2]);
    cylinder(.29, .5, [x, .56, z], 1, [0, 0, Math.PI / 2]);
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; box([.53, .1, .21], [x, .56 + Math.cos(a) * .59, z + Math.sin(a) * .59], 0, [a, 0, 0]); }
  }
});
author('upgrade-scrap_frame', ({ tube, box }) => {
  for (const side of [-1, 1]) {
    tube([side * .86, .55, -1.3], [side * .86, .55, 1.25], .1, 1);
    tube([side * .86, .55, -1.15], [side * .76, 1.15, -.45], .07, 3);
    tube([side * .86, .55, .95], [side * .76, 1.15, -.45], .07, 2);
    box([.11, .11, .65], [side * .83, .88, -.28], 1, [0, 0, side * .16]);
  }
});
author('upgrade-roll_cage', ({ tube, box }) => {
  for (const x of [-.78, .78]) {
    tube([x, .65, -.85], [x, 1.87, -.64], .08, 2);
    tube([x, 1.87, -.64], [x, 1.87, .35], .08, 2);
    tube([x, 1.87, .35], [x, .65, .8], .08, 2);
  }
  tube([-.78, 1.87, -.64], [.78, 1.87, .35], .065, 3);
  tube([.78, 1.87, -.64], [-.78, 1.87, .35], .065, 3);
  box([1.75, .07, .12], [0, 1.94, -.64], 2);
});
author('upgrade-armor_plating', ({ box, cylinder }) => {
  for (const side of [-1, 1]) {
    box([.13, .7, 1.67], [side * .83, .94, -.12], 3, [0, 0, side * -.12]);
    box([.14, .11, 1.58], [side * .9, 1.25, -.12], 2);
    for (const z of [-.68, -.08, .5]) cylinder(.065, .04, [side * .92, 1.05, z], 0, [0, 0, Math.PI / 2]);
  }
  box([1.48, .68, .12], [0, 1.02, -.71], 0, [-.12, 0, 0]);
});
