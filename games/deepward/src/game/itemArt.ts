import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, type BufferGeometry } from "three";
import { ITEMS, type ItemKind } from "./loot";

/**
 * Every find as a little original mesh, at its true size beside a Little (who stands about 1.7
 * units tall): a sugar cube is a knee-high boulder, a coin a millstone, a needle a spear.
 */
function mat(color: string, opts: { rough?: number; metal?: number; glow?: number; opacity?: number } = {}) {
  return new MeshStandardMaterial({ color, roughness: opts.rough ?? 0.6, metalness: opts.metal ?? 0, ...(opts.glow ? { emissive: color, emissiveIntensity: opts.glow } : {}), ...(opts.opacity !== undefined ? { transparent: true, opacity: opts.opacity } : {}) });
}
function part(group: Group, geometry: BufferGeometry, material: MeshStandardMaterial, at: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(...at); mesh.rotation.set(...rot); mesh.scale.set(...scale);
  mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
const METAL = { rough: 0.25, metal: 0.9 } as const;

export function itemMesh(kind: ItemKind): Group {
  const g = new Group(), c = ITEMS[kind].color;
  switch (kind) {
    case "crumb": part(g, new IcosahedronGeometry(0.45, 0), mat(c, { rough: 0.95 }), [0, 0.35, 0], [0.4, 0.7, 0.2], [1.2, 0.8, 1]); break;
    case "sugar-cube": part(g, new BoxGeometry(1, 1, 1), mat(c, { rough: 0.8 }), [0, 0.5, 0], [0, 0.3, 0]); break;
    case "cheese-cube": part(g, new BoxGeometry(2, 1.7, 2), mat(c, { rough: 0.55 }), [0, 0.85, 0], [0, 0.2, 0]); for (const [x, y] of [[0.4, 1.2], [-0.5, 0.6]] as const) part(g, new SphereGeometry(0.22, 8, 6), mat("#c99a2a"), [x, y, 1.0]); break;
    case "raisin": part(g, new SphereGeometry(0.4, 8, 6), mat(c, { rough: 0.9 }), [0, 0.3, 0], [0, 0, 0.3], [1.3, 0.75, 1]); break;
    case "cereal-ring": part(g, new TorusGeometry(0.45, 0.2, 8, 16), mat(c, { rough: 0.9 }), [0, 0.22, 0], [Math.PI / 2, 0, 0]); break;
    case "cookie-shard": part(g, new CylinderGeometry(1, 1.1, 0.5, 5), mat(c, { rough: 0.9 }), [0, 0.25, 0], [0, 0.4, 0], [1, 1, 0.6]); part(g, new BoxGeometry(0.4, 0.3, 0.4), mat("#4a2a14"), [0.2, 0.5, 0.1]); break;
    case "peanut": part(g, new SphereGeometry(0.42, 10, 8), mat(c, { rough: 0.9 }), [0, 0.35, 0], [0, 0, Math.PI / 2], [1, 1.9, 1]); break;
    case "gummy-bear": part(g, new SphereGeometry(0.42, 10, 8), mat(c, { rough: 0.25, opacity: 0.85 }), [0, 0.45, 0], [0, 0, 0], [1, 1.2, 0.8]); part(g, new SphereGeometry(0.32, 10, 8), mat(c, { rough: 0.25, opacity: 0.85 }), [0, 1.05, 0]); break;
    case "watch-battery": part(g, new CylinderGeometry(0.75, 0.75, 0.35, 24), mat(c, METAL), [0, 0.18, 0]); break;
    case "spring": for (let i = 0; i < 4; i++) part(g, new TorusGeometry(0.35, 0.06, 6, 16), mat(c, METAL), [0, 0.15 + i * 0.22, 0], [Math.PI / 2, 0, 0]); break;
    case "paperclip": part(g, new TorusGeometry(0.4, 0.06, 6, 20), mat(c, METAL), [0, 0.07, 0], [Math.PI / 2, 0, 0], [2.2, 1, 1]); part(g, new TorusGeometry(0.28, 0.06, 6, 20), mat(c, METAL), [0.1, 0.07, 0], [Math.PI / 2, 0, 0], [2.2, 1, 1]); break;
    case "rubber-band": part(g, new TorusGeometry(0.55, 0.07, 6, 24), mat(c, { rough: 0.9 }), [0, 0.08, 0], [Math.PI / 2, 0, 0], [1.3, 1, 1]); break;
    case "screw": part(g, new CylinderGeometry(0.22, 0.12, 2.2, 10), mat(c, METAL), [0, 0.3, 0], [0, 0, Math.PI / 2]); part(g, new CylinderGeometry(0.45, 0.45, 0.18, 14), mat(c, METAL), [1.1, 0.3, 0], [0, 0, Math.PI / 2]); break;
    case "toy-gear": part(g, new CylinderGeometry(0.6, 0.6, 0.3, 16), mat(c, { rough: 0.4 }), [0, 0.15, 0]); for (let i = 0; i < 8; i++) part(g, new BoxGeometry(0.25, 0.3, 0.3), mat(c, { rough: 0.4 }), [Math.cos(i / 8 * Math.PI * 2) * 0.7, 0.15, Math.sin(i / 8 * Math.PI * 2) * 0.7], [0, -i / 8 * Math.PI * 2, 0]); break;
    case "safety-pin": part(g, new BoxGeometry(2, 0.08, 0.08), mat(c, METAL), [0, 0.1, 0.12]); part(g, new BoxGeometry(2, 0.08, 0.08), mat(c, METAL), [0, 0.1, -0.12]); part(g, new BoxGeometry(0.35, 0.25, 0.4), mat(c, METAL), [0.9, 0.15, 0]); break;
    case "thread-spool": part(g, new CylinderGeometry(0.55, 0.55, 1.6, 16), mat(c, { rough: 0.95 }), [0, 0.85, 0]); for (const y of [0.05, 1.65]) part(g, new CylinderGeometry(0.75, 0.75, 0.12, 16), mat("#d9b98a"), [0, y, 0]); break;
    case "tissue": part(g, new IcosahedronGeometry(0.8, 1), mat(c, { rough: 1 }), [0, 0.45, 0], [0.3, 0.2, 0], [1.4, 0.6, 1.2]); break;
    case "button": part(g, new CylinderGeometry(0.8, 0.8, 0.18, 24), mat(c, { rough: 0.3 }), [0, 0.1, 0]); for (const [x, z] of [[0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2]] as const) part(g, new CylinderGeometry(0.08, 0.08, 0.2, 8), mat("#1c2a33"), [x, 0.12, z]); break;
    case "marble": part(g, new SphereGeometry(0.7, 20, 14), mat(c, { rough: 0.05, opacity: 0.8 }), [0, 0.7, 0]); part(g, new SphereGeometry(0.35, 10, 8), mat("#ffffff", { glow: 0.3 }), [0.1, 0.7, 0]); break;
    case "coin": part(g, new CylinderGeometry(1.5, 1.5, 0.2, 32), mat(c, METAL), [0, 0.1, 0]); part(g, new CylinderGeometry(1.25, 1.25, 0.22, 32), mat("#b38c3a", METAL), [0, 0.11, 0]); break;
    case "bead": part(g, new TorusGeometry(0.3, 0.2, 10, 16), mat(c, { rough: 0.1, opacity: 0.85 }), [0, 0.3, 0]); break;
    case "earring": part(g, new TorusGeometry(0.35, 0.05, 6, 20), mat("#d4af37", METAL), [0, 0.45, 0]); part(g, new IcosahedronGeometry(0.25, 0), mat(c, { rough: 0.02, glow: 0.6 }), [0, 0.12, 0]); break;
    case "tiny-key": part(g, new TorusGeometry(0.3, 0.08, 6, 16), mat(c, METAL), [-0.5, 0.08, 0], [Math.PI / 2, 0, 0]); part(g, new BoxGeometry(1, 0.1, 0.14), mat(c, METAL), [0.25, 0.08, 0]); part(g, new BoxGeometry(0.14, 0.1, 0.3), mat(c, METAL), [0.65, 0.08, 0.12]); break;
    case "dice": part(g, new BoxGeometry(1, 1, 1), mat(c, { rough: 0.35 }), [0, 0.5, 0], [0, 0.5, 0]); for (const [x, z] of [[0, 0], [0.25, 0.25], [-0.25, -0.25]] as const) part(g, new SphereGeometry(0.08, 6, 4), mat("#111"), [x, 1.0, z]); break;
    case "brick": part(g, new BoxGeometry(2, 1, 1), mat(c, { rough: 0.3 }), [0, 0.5, 0]); for (const x of [-0.5, 0.5]) part(g, new CylinderGeometry(0.3, 0.3, 0.22, 14), mat(c, { rough: 0.3 }), [x, 1.1, 0]); break;
    case "crayon": part(g, new CylinderGeometry(0.3, 0.3, 1.6, 10), mat(c, { rough: 0.5 }), [0, 0.3, 0], [0, 0, Math.PI / 2]); part(g, new ConeGeometry(0.3, 0.5, 10), mat(c, { rough: 0.5 }), [-1.05, 0.3, 0], [0, 0, Math.PI / 2]); break;
    case "stamp": part(g, new BoxGeometry(1, 0.04, 1.2), mat(c, { rough: 0.8 }), [0, 0.03, 0]); part(g, new BoxGeometry(0.7, 0.05, 0.9), mat("#f2e6c8"), [0, 0.04, 0]); break;
    case "sequin": part(g, new CylinderGeometry(0.5, 0.5, 0.04, 20), mat(c, { rough: 0.05, metal: 1, glow: 0.4 }), [0, 0.05, 0]); break;
    case "cat-bell": part(g, new SphereGeometry(0.55, 14, 10), mat(c, METAL), [0, 0.55, 0]); part(g, new BoxGeometry(0.7, 0.08, 0.12), mat("#222"), [0, 0.45, 0.5]); part(g, new TorusGeometry(0.18, 0.05, 6, 12), mat(c, METAL), [0, 1.12, 0]); break;
    case "pearl": part(g, new SphereGeometry(0.45, 20, 14), mat(c, { rough: 0.08, metal: 0.2, glow: 0.15 }), [0, 0.45, 0]); break;
    case "toy-soldier": part(g, new CylinderGeometry(0.4, 0.45, 0.2, 12), mat("#3f6b45"), [0, 0.1, 0]); part(g, new BoxGeometry(0.5, 1.1, 0.35), mat(c), [0, 0.75, 0]); part(g, new SphereGeometry(0.22, 10, 8), mat("#f1c9a5"), [0, 1.45, 0]); part(g, new CylinderGeometry(0.2, 0.22, 0.35, 10), mat("#222"), [0, 1.72, 0]); break;
    case "spider-silk": part(g, new SphereGeometry(0.45, 10, 8), mat(c, { rough: 1, glow: 0.2 }), [0, 0.4, 0], [0, 0, 0], [1, 0.7, 1]); break;
    case "thimble": part(g, new CylinderGeometry(0.55, 0.7, 1.2, 18, 1, true), mat(c, METAL), [0, 0.6, 0]); part(g, new SphereGeometry(0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(c, METAL), [0, 1.2, 0]); break;
    case "needle": part(g, new CylinderGeometry(0.06, 0.02, 3.2, 8), mat(c, METAL), [0, 0.12, 0], [0, 0, Math.PI / 2]); part(g, new TorusGeometry(0.1, 0.03, 6, 10), mat(c, METAL), [1.62, 0.12, 0]); break;
    case "napkin": part(g, new BoxGeometry(2, 0.12, 2), mat(c, { rough: 1 }), [0, 0.06, 0], [0, 0.4, 0]); break;
    case "grapple": part(g, new TorusGeometry(0.4, 0.06, 6, 16, Math.PI * 1.3), mat(c, METAL), [0, 0.4, 0]); part(g, new CylinderGeometry(0.35, 0.35, 0.6, 12), mat("#4d6fb3", { rough: 0.95 }), [0.8, 0.3, 0]); break;
    case "button-shield": part(g, new CylinderGeometry(0.9, 0.9, 0.2, 24), mat(c, { rough: 0.3 }), [0, 0.9, 0], [Math.PI / 2, 0, 0]); part(g, new BoxGeometry(0.15, 0.6, 0.15), mat("#6a4a2a"), [0, 0.9, -0.2]); break;
    case "candle": part(g, new CylinderGeometry(0.16, 0.16, 1.6, 10), mat(c, { rough: 0.5 }), [0, 0.8, 0]); part(g, new SphereGeometry(0.14, 8, 6), mat("#ffb347", { glow: 2.5 }), [0, 1.75, 0], [0, 0, 0], [1, 1.6, 1]); break;
    case "slingshot": part(g, new BoxGeometry(0.14, 1, 0.14), mat("#8a5a32"), [0, 0.5, 0]); for (const s of [-1, 1]) part(g, new BoxGeometry(0.12, 0.7, 0.12), mat("#8a5a32"), [s * 0.25, 1.2, 0], [0, 0, -s * 0.4]); part(g, new BoxGeometry(0.7, 0.05, 0.05), mat(c), [0, 1.45, 0]); break;
    case "bottle-cap": part(g, new CylinderGeometry(0.75, 0.8, 0.35, 21), mat(c, { rough: 0.3, metal: 0.6 }), [0, 0.18, 0]); part(g, new CylinderGeometry(0.62, 0.62, 0.36, 21), mat("#e8e2d0", { rough: 0.5 }), [0, 0.19, 0]); break;
  }
  return g;
}
