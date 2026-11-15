// Harbor Heat's city block: a 1 m unit building drawn at each lot's real size through per-placement
// scale. Walls are one material named "facade" (the game projects a scanned ambientCG facade onto it
// in metres, so storeys keep their height whatever the scale); the roof is "roof".
//
// The lit variants (`city-block-lit-<storeys>.glb`) are the same block with glowing window panes laid
// just off its street (+z) and back (-z) walls, one pane row per storey: the panes are part of the
// building, so they are drawn, scaled, streamed and culled with it and can never stand where the
// block is not. About half the flats have a lamp on, a few the blue of a TV, and the ground floor
// stays dark (shopfronts and awnings there, and the king tide reaches it).
// Rebuild with: node scripts/author-city-block.mjs
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { writeFile } from 'node:fs/promises';

globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((value) => { this.result = value; this.onloadend?.(); }); }
};
const COPYRIGHT = 'Original Harbor Heat game art, authored for jgengine-games. Repository license applies.';
const facade = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, name: 'facade' });
facade.name = 'facade';
const roof = new THREE.MeshStandardMaterial({ color: '#5c5b57', roughness: 0.92, name: 'roof' });
roof.name = 'roof';

function block() {
  const geometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  // BoxGeometry face groups: +x, -x, +y (roof), -y, +z, -z.
  const mesh = new THREE.Mesh(geometry, [facade, facade, roof, roof, facade, facade]);
  mesh.name = 'city_block';
  return mesh;
}

async function save(name, object) {
  const data = await new GLTFExporter().parseAsync(object, { binary: true, copyright: COPYRIGHT });
  await writeFile(new URL(`../src/art/${name}.glb`, import.meta.url), Buffer.from(data));
  console.log(`${name}: ${data.byteLength} bytes`);
}

await save('city-block', block());

/** Storey counts the lit blocks are authored for; `src/game/world/buildings.ts` mirrors this list. */
const WINDOW_ROWS = [2, 3, 4, 5, 6, 8, 10, 14, 20];
const PANES = [
  { name: 'window warm', color: '#ffd59a', intensity: 1.3 },
  { name: 'window amber', color: '#ffae5c', intensity: 1.2 },
  { name: 'window tv', color: '#8fe0ff', intensity: 1.0 },
].map((pane) => {
  const material = new THREE.MeshStandardMaterial({ color: pane.color, emissive: pane.color, emissiveIntensity: pane.intensity, roughness: 0.6 });
  material.name = pane.name;
  return material;
});

function litBlock(rows) {
  const group = new THREE.Group();
  group.name = 'city_block_lit';
  group.add(block());
  const cols = 6;
  let n = rows * 7919;
  const rand = () => { n = (n * 16807) % 2147483647; return n / 2147483647; };
  const lists = PANES.map(() => []);
  for (const side of [1, -1]) {
    for (let r = 1; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const pick = rand();
        if (pick > 0.55) continue;
        const which = pick < 0.06 ? 2 : pick < 0.2 ? 1 : 0;
        const pane = new THREE.PlaneGeometry(0.5 / cols, 0.48 / rows);
        if (side < 0) pane.rotateY(Math.PI);
        pane.translate((-0.5 + (c + 0.5) / cols) * side, (r + 0.55) / rows, 0.502 * side);
        lists[which].push(pane);
      }
    }
  }
  lists.forEach((list, index) => {
    if (list.length === 0) return;
    const mesh = new THREE.Mesh(mergeGeometries(list), PANES[index]);
    mesh.name = PANES[index].name;
    group.add(mesh);
  });
  return group;
}

for (const rows of WINDOW_ROWS) await save(`city-block-lit-${rows}`, litBlock(rows));
