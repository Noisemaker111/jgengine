// Harbor Heat's city block: a 1 m unit building drawn at each lot's real size through per-placement
// scale. Walls are one material named "facade" (the game projects a scanned ambientCG facade onto it
// in metres, so storeys keep their height whatever the scale); the roof is "roof".
// Rebuild with: node scripts/author-city-block.mjs
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { writeFile } from 'node:fs/promises';

globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((value) => { this.result = value; this.onloadend?.(); }); }
};
const facade = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, name: 'facade' });
facade.name = 'facade';
const roof = new THREE.MeshStandardMaterial({ color: '#5c5b57', roughness: 0.92, name: 'roof' });
roof.name = 'roof';
const geometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
// BoxGeometry face groups: +x, -x, +y (roof), -y, +z, -z.
const block = new THREE.Mesh(geometry, [facade, facade, roof, roof, facade, facade]);
block.name = 'city_block';
const data = await new GLTFExporter().parseAsync(block, { binary: true, copyright: 'Original Harbor Heat game art, authored for jgengine-games. Repository license applies.' });
await writeFile(new URL('../src/art/city-block.glb', import.meta.url), Buffer.from(data));
console.log(`city-block: ${data.byteLength} bytes`);
