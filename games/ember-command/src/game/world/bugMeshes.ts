import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Stylized procedural bodies for every LAWN ORDER entity. The asset catalog holds no ants, beetles or
 * dirt chambers, so each caste is assembled here from a handful of primitives and merged into very few
 * vertex-coloured meshes (a body plus two leg tripods), cached per kind and shared by every instance.
 *
 * Silhouette rules (see `art-direction.md`): a worker is small and even, a scout is long-legged with
 * glowing antenna tips, a soldier is all head and mandibles, a spitter carries a swollen acid gaster
 * curled up over its back, the tank beetle is a horned dome, the Marshal wears a gold crest, the black
 * major is a heavy-jawed brute and the paper wasp hovers on striped wings. Facing is +Z.
 */

export interface BugPalette {
  body: string;
  /** Head/thorax tone (slightly darker or lighter than the gaster). */
  head: string;
  leg: string;
  accent: string;
}

export const RED_ANT: BugPalette = { body: "#d42a1c", head: "#a81d14", leg: "#5e130c", accent: "#ffd23f" };
export const BLACK_ANT: BugPalette = { body: "#26222b", head: "#17141b", leg: "#0d0b10", accent: "#9b7cff" };

/** One merged part: geometry carrying vertex colours. */
type Piece = THREE.BufferGeometry;

function tint(geo: THREE.BufferGeometry, color: string): Piece {
  const g = geo.index === null ? geo : geo.toNonIndexed();
  const c = new THREE.Color(color);
  const count = g.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  if (g.getAttribute("uv") !== undefined) g.deleteAttribute("uv");
  return g;
}

function blob(color: string, [sx, sy, sz]: [number, number, number], [x, y, z]: [number, number, number], detail = 14): Piece {
  const g = new THREE.SphereGeometry(1, detail, Math.max(6, Math.round(detail * 0.7)));
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return tint(g, color);
}

/** A thin rod from A to B. */
function rod(color: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, tipRadius = radius): Piece {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(tipRadius, radius, len, 6, 1);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return tint(g, color);
}

function cone(color: string, radius: number, height: number, at: [number, number, number], rot: [number, number, number] = [0, 0, 0], segments = 7): Piece {
  const g = new THREE.ConeGeometry(radius, height, segments);
  g.rotateX(rot[0]);
  g.rotateY(rot[1]);
  g.rotateZ(rot[2]);
  g.translate(...at);
  return tint(g, color);
}

function merge(pieces: Piece[]): THREE.BufferGeometry {
  const merged = mergeGeometries(pieces, false);
  if (merged === null) throw new Error("bug mesh merge failed");
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface BugShape {
  /** Length scale of the whole body. */
  size: number;
  headScale: number;
  gasterScale: number;
  legScale: number;
  antennaScale: number;
  mandible: number;
  /** Gaster tilt up over the back (spitters curl theirs). */
  gasterCurl: number;
  crest?: boolean;
  glowTips?: boolean;
  acidSac?: boolean;
}

export interface BugBody {
  body: THREE.BufferGeometry;
  legsA: THREE.BufferGeometry;
  legsB: THREE.BufferGeometry;
  /** Height the body rides at; wasps hover. */
  ride: number;
  wings?: THREE.BufferGeometry;
}

/** Six legs on three hips, split into the two alternating tripods an ant walks on. */
function antLegs(palette: BugPalette, shape: BugShape): [Piece[], Piece[]] {
  const a: Piece[] = [];
  const b: Piece[] = [];
  const hips = [0.32, 0.16, 0.0];
  const reach = 0.62 * shape.legScale;
  hips.forEach((hz, i) => {
    for (const side of [-1, 1]) {
      const hip = v(side * 0.1, 0.34, hz);
      const swing = (i - 1) * 0.42;
      const knee = v(side * (0.1 + reach * 0.62), 0.5, hz + swing * 0.5 + 0.04);
      const foot = v(side * (0.12 + reach), 0.0, hz + swing);
      const leg = [rod(palette.leg, hip, knee, 0.035, 0.028), rod(palette.leg, knee, foot, 0.028, 0.014)];
      const tripodA = (i === 1) === (side === 1);
      (tripodA ? a : b).push(...leg);
    }
  });
  return [a, b];
}

function antBody(palette: BugPalette, shape: BugShape): Piece[] {
  const h = shape.headScale;
  const g = shape.gasterScale;
  const pieces: Piece[] = [
    // thorax + waist
    blob(palette.head, [0.13, 0.12, 0.26], [0, 0.38, 0.16]),
    blob(palette.head, [0.07, 0.07, 0.07], [0, 0.36, -0.14], 8),
    blob(palette.head, [0.08, 0.09, 0.08], [0, 0.4, -0.24], 8),
    // head
    blob(palette.head, [0.2 * h, 0.17 * h, 0.2 * h], [0, 0.42 + 0.03 * h, 0.5 + 0.12 * h]),
    // eyes
    blob("#0b0b0b", [0.05 * h, 0.05 * h, 0.05 * h], [0.15 * h, 0.47 + 0.03 * h, 0.55 + 0.12 * h], 6),
    blob("#0b0b0b", [0.05 * h, 0.05 * h, 0.05 * h], [-0.15 * h, 0.47 + 0.03 * h, 0.55 + 0.12 * h], 6),
  ];
  // gaster, curled up for spitters
  const curl = shape.gasterCurl;
  const gz = -0.52 - 0.12 * g + curl * 0.18;
  const gy = 0.42 + curl * 0.38;
  const gaster = new THREE.SphereGeometry(1, 16, 12);
  gaster.scale(0.27 * g, 0.24 * g, 0.38 * g);
  gaster.rotateX(-curl * 0.9);
  gaster.translate(0, gy, gz);
  pieces.push(tint(gaster, palette.body));
  // banding highlight on the gaster
  pieces.push(blob(palette.body === RED_ANT.body ? "#ff5a3c" : "#3d3646", [0.2 * g, 0.12 * g, 0.18 * g], [0, gy + 0.13 * g, gz + 0.1 * g], 10));
  if (shape.acidSac) pieces.push(blob("#7dff4a", [0.14 * g, 0.12 * g, 0.14 * g], [0, gy + 0.08 * g, gz - 0.32 * g + curl * 0.2], 10));
  // mandibles
  const mz = 0.62 + 0.24 * h;
  const m = shape.mandible;
  for (const side of [-1, 1]) {
    pieces.push(rod(palette.leg, v(side * 0.09 * h, 0.36, mz), v(side * 0.03, 0.32, mz + 0.16 * m), 0.035 * m, 0.012));
  }
  // antennae: elbowed, like a real ant's
  const a = shape.antennaScale;
  for (const side of [-1, 1]) {
    const root = v(side * 0.07 * h, 0.5 + 0.06 * h, 0.58 + 0.18 * h);
    const elbow = v(side * 0.2 * a, 0.78 + 0.08 * a, 0.66 + 0.2 * h);
    const tip = v(side * 0.3 * a, 0.62 + 0.04 * a, 0.95 + 0.32 * a);
    pieces.push(rod(palette.leg, root, elbow, 0.02, 0.016), rod(palette.leg, elbow, tip, 0.016, 0.01));
    if (shape.glowTips) pieces.push(blob("#b9fff2", [0.045, 0.045, 0.045], [tip.x, tip.y, tip.z], 6));
  }
  if (shape.crest) {
    for (let i = 0; i < 5; i += 1) {
      const x = (i - 2) * 0.07 * h;
      pieces.push(cone(palette.accent, 0.035, 0.16, [x, 0.6 + 0.08 * h, 0.5 + 0.1 * h], [-0.3, 0, 0], 5));
    }
    pieces.push(blob(palette.accent, [0.14 * h, 0.02, 0.06], [0, 0.56 + 0.07 * h, 0.5 + 0.1 * h], 8));
  }
  return pieces;
}

function scaled(geo: THREE.BufferGeometry, s: number): THREE.BufferGeometry {
  geo.scale(s, s, s);
  geo.computeBoundingSphere();
  return geo;
}

export function antGeometry(palette: BugPalette, shape: BugShape): BugBody {
  const [a, b] = antLegs(palette, shape);
  return {
    body: scaled(merge(antBody(palette, shape)), shape.size),
    legsA: scaled(merge(a), shape.size),
    legsB: scaled(merge(b), shape.size),
    ride: 0,
  };
}

/** The tamed rhinoceros beetle: a glossy domed shell striped in colony red, a curved horn up front. */
export function beetleGeometry(palette: BugPalette): BugBody {
  const shell = "#1c2f5a";
  const pieces: Piece[] = [];
  const dome = new THREE.SphereGeometry(1, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(0.62, 0.48, 0.82);
  dome.translate(0, 0.32, -0.12);
  pieces.push(tint(dome, shell));
  // elytra seam and colony stripe
  pieces.push(blob(palette.body, [0.1, 0.06, 0.72], [0, 0.78, -0.12], 10));
  pieces.push(blob("#3e5d9c", [0.22, 0.08, 0.3], [0.22, 0.7, -0.3], 10));
  // pronotum + head + horn
  pieces.push(blob("#14213f", [0.42, 0.3, 0.3], [0, 0.42, 0.62]));
  pieces.push(blob("#14213f", [0.22, 0.17, 0.18], [0, 0.32, 0.92]));
  pieces.push(rod("#0e1730", v(0, 0.4, 0.98), v(0, 0.78, 1.3), 0.09, 0.05));
  pieces.push(rod("#0e1730", v(0, 0.78, 1.3), v(0, 1.02, 1.18), 0.05, 0.015));
  pieces.push(cone(palette.body, 0.06, 0.18, [0, 0.62, 0.66], [-0.4, 0, 0], 5));
  const legsA: Piece[] = [];
  const legsB: Piece[] = [];
  [0.5, 0.15, -0.25].forEach((hz, i) => {
    for (const side of [-1, 1]) {
      const hip = v(side * 0.36, 0.3, hz);
      const knee = v(side * 0.78, 0.36, hz + (i - 1) * 0.18);
      const foot = v(side * 0.95, 0, hz + (i - 1) * 0.42);
      const leg = [rod("#0e1730", hip, knee, 0.06, 0.05), rod("#0e1730", knee, foot, 0.05, 0.025)];
      ((i === 1) === (side === 1) ? legsA : legsB).push(...leg);
    }
  });
  return { body: scaled(merge(pieces), 1.25), legsA: scaled(merge(legsA), 1.25), legsB: scaled(merge(legsB), 1.25), ride: 0 };
}

/** The paper wasp: yellow-and-black striped abdomen, narrow waist, stinger, and a pair of glassy wings. */
export function waspGeometry(): BugBody {
  const yellow = "#ffcf1f";
  const black = "#1a1712";
  const pieces: Piece[] = [
    blob(black, [0.17, 0.16, 0.28], [0, 0.4, 0.18]),
    blob(yellow, [0.18, 0.16, 0.17], [0, 0.42, 0.56]),
    blob(black, [0.06, 0.06, 0.06], [0.12, 0.47, 0.64], 6),
    blob(black, [0.06, 0.06, 0.06], [-0.12, 0.47, 0.64], 6),
    rod(black, v(0, 0.38, -0.08), v(0, 0.36, -0.26), 0.04, 0.035),
  ];
  // striped abdomen: alternating rings tapering to the sting
  for (let i = 0; i < 5; i += 1) {
    const z = -0.36 - i * 0.14;
    const r = 0.26 - i * 0.035;
    pieces.push(blob(i % 2 === 0 ? yellow : black, [r, r * 0.9, 0.1], [0, 0.32 - i * 0.03, z], 12));
  }
  pieces.push(cone(black, 0.04, 0.18, [0, 0.2, -1.08], [-Math.PI / 2, 0, 0], 5));
  for (const side of [-1, 1]) {
    pieces.push(rod(black, v(side * 0.08, 0.52, 0.66), v(side * 0.24, 0.8, 0.95), 0.018, 0.012));
  }
  const legsA: Piece[] = [];
  const legsB: Piece[] = [];
  [0.28, 0.16, 0.04].forEach((hz, i) => {
    for (const side of [-1, 1]) {
      const hip = v(side * 0.1, 0.32, hz);
      const knee = v(side * 0.28, 0.2, hz + (i - 1) * 0.1);
      const foot = v(side * 0.34, -0.05, hz + (i - 1) * 0.22 - 0.1);
      const leg = [rod(yellow, hip, knee, 0.025, 0.02), rod(yellow, knee, foot, 0.02, 0.01)];
      ((i === 1) === (side === 1) ? legsA : legsB).push(...leg);
    }
  });
  const wing = new THREE.CircleGeometry(1, 14);
  wing.scale(0.22, 0.62, 1);
  wing.rotateX(-Math.PI / 2);
  const left = wing.clone();
  left.rotateY(0.5);
  left.translate(-0.36, 0.62, -0.08);
  const right = wing.clone();
  right.rotateY(-0.5);
  right.translate(0.36, 0.62, -0.08);
  return {
    body: scaled(merge(pieces), 1.4),
    legsA: scaled(merge(legsA), 1.4),
    legsB: scaled(merge(legsB), 1.4),
    ride: 1.6,
    wings: scaled(merge([tint(left, "#e8f6ff"), tint(right, "#e8f6ff")]), 1.4),
  };
}

/* ------------------------------------------------------------------------------------------- */
/* Chambers, food and dressing                                                                  */
/* ------------------------------------------------------------------------------------------- */

/** A dug mound: a lathe of soil with jittered slopes, a dark entrance and a rim of pebbles. */
function mound(radius: number, height: number, soil: string, top: string, seed: number): Piece[] {
  const profile: THREE.Vector2[] = [];
  const steps = 9;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const r = radius * (1 - t) ** 0.9 + 0.35 * (t === 1 ? 0 : 1) * (1 - t);
    const y = height * Math.sin((t * Math.PI) / 2) ** 1.4;
    profile.push(new THREE.Vector2(Math.max(0.01, r), y));
  }
  const g = new THREE.LatheGeometry(profile, 26);
  const pos = g.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const low = new THREE.Color(soil);
  const high = new THREE.Color(top);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = Math.sin(x * 2.3 + seed) * Math.cos(z * 1.9 - seed) * 0.12 + Math.sin(x * 5.1 + z * 4.7 + seed) * 0.05;
    if (y > 0.05) pos.setXYZ(i, x * (1 + n), y + n * 0.4, z * (1 + n));
    c.copy(low).lerp(high, Math.min(1, y / height) * 0.8 + n);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  const geo = g.toNonIndexed();
  geo.deleteAttribute("uv");
  const flat = geo.getAttribute("position").count;
  const recolor = new Float32Array(flat * 3);
  const src = g.index;
  if (src !== null) {
    for (let i = 0; i < src.count; i += 1) {
      const vi = src.getX(i);
      recolor[i * 3] = colors[vi * 3]!;
      recolor[i * 3 + 1] = colors[vi * 3 + 1]!;
      recolor[i * 3 + 2] = colors[vi * 3 + 2]!;
    }
  }
  geo.setAttribute("color", new THREE.BufferAttribute(recolor, 3));
  const pieces: Piece[] = [geo];
  // pebble rim
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2 + seed;
    const r = radius * (0.95 + 0.1 * Math.sin(i * 3.1));
    pieces.push(blob(i % 3 === 0 ? "#b7a48a" : "#8f7d66", [0.35, 0.22, 0.3], [Math.cos(a) * r, 0.08, Math.sin(a) * r], 7));
  }
  return pieces;
}

function entrance(radius: number, y: number, z: number): Piece {
  const g = new THREE.CircleGeometry(radius, 14);
  g.rotateX(-0.9);
  g.translate(0, y, z);
  return tint(g, "#140a05");
}

/** A petal flag on a twig, in the colony's colour. */
function petalFlag(color: string, x: number, z: number, h = 2.4): Piece[] {
  const petal = new THREE.SphereGeometry(1, 10, 8);
  petal.scale(0.08, 0.5, 0.32);
  petal.translate(0, h - 0.2, 0.3);
  petal.rotateY(Math.atan2(x, z));
  petal.translate(x, 0, z);
  return [rod("#6b4a2a", v(x, 0, z), v(x, h, z), 0.07, 0.05), tint(petal, color)];
}

export type ChamberKind = "keep_player" | "keep_enemy" | "barracks" | "fungus_garden" | "nursery" | "granary" | "acid_mound" | "brood_mound";

export function chamberGeometry(kind: ChamberKind): THREE.BufferGeometry {
  const red = RED_ANT.body;
  const black = "#2a2433";
  switch (kind) {
    case "keep_player":
      return merge([
        ...mound(5.2, 3.4, "#7a4a26", "#b9824c", 1.3),
        entrance(0.9, 1.5, 3.1),
        entrance(0.6, 2.6, -1.2),
        ...petalFlag(red, -3.4, 2.4, 3.2),
        ...petalFlag(red, 3.4, 2.4, 3.2),
        ...petalFlag(red, 0, -3.8, 3.6),
        blob("#ffd23f", [0.5, 0.35, 0.45], [1.6, 2.7, 0.4], 10),
      ]);
    case "keep_enemy":
      return merge([
        ...mound(5.4, 3.6, "#3b2a20", "#6a5140", 4.7),
        entrance(0.95, 1.6, 3.2),
        entrance(0.6, 2.7, -1.3),
        ...petalFlag("#4b2a6b", -3.5, 2.5, 3.2),
        ...petalFlag("#4b2a6b", 3.5, 2.5, 3.2),
        ...petalFlag(black, 0, -3.9, 3.6),
      ]);
    case "barracks": {
      const thorns: Piece[] = [];
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        thorns.push(cone("#5b3b1e", 0.16, 1.6, [Math.cos(a) * 2.6, 1.0, Math.sin(a) * 2.6], [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6], 5));
      }
      return merge([...mound(3.4, 2.2, "#7a4a26", "#a8743f", 2.1), entrance(0.7, 0.9, 2.1), ...thorns, ...petalFlag(red, 0, -2.2, 3)]);
    }
    case "fungus_garden": {
      const caps: Piece[] = [];
      const spots = [[0, 1.6, 0, 1.0], [1.3, 1.0, 0.8, 0.7], [-1.2, 1.0, 0.6, 0.75], [0.4, 0.9, -1.4, 0.6], [-0.9, 0.8, -1.0, 0.55]] as const;
      for (const [x, y, z, s] of spots) {
        caps.push(rod("#f4ead2", v(x, y - 0.8, z), v(x, y + 0.2 * s, z), 0.12 * s, 0.1 * s));
        caps.push(blob(x === 0 ? "#ff8a3d" : "#f7f0dc", [0.55 * s, 0.3 * s, 0.55 * s], [x, y + 0.3 * s, z], 12));
      }
      return merge([...mound(3.0, 1.2, "#6e4426", "#8a5a32", 3.3), ...caps, ...petalFlag(red, 2.2, -1.4, 2.4)]);
    }
    case "nursery": {
      const eggs: Piece[] = [];
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * Math.PI * 2;
        eggs.push(blob("#fbf6e9", [0.28, 0.22, 0.4], [Math.cos(a) * 0.8, 1.55, Math.sin(a) * 0.8], 10));
      }
      eggs.push(blob("#fff9e0", [0.35, 0.3, 0.6], [0, 1.7, 0], 12));
      return merge([...mound(3.0, 1.6, "#7a4a26", "#a8743f", 5.1), ...eggs, ...petalFlag(red, -2.2, 1.2, 2.4)]);
    }
    case "granary": {
      const seeds: Piece[] = [];
      for (let i = 0; i < 9; i += 1) {
        const a = i * 2.4;
        const r = 0.4 + (i % 3) * 0.35;
        const seed = new THREE.SphereGeometry(1, 10, 8);
        seed.scale(0.22, 0.16, 0.45);
        seed.rotateY(a);
        seed.translate(Math.cos(a) * r, 1.4 + (i % 2) * 0.2, Math.sin(a) * r);
        seeds.push(tint(seed, i % 2 === 0 ? "#e9d6a3" : "#3a3028"));
      }
      return merge([...mound(3.0, 1.4, "#7a4a26", "#b08550", 6.6), ...seeds, ...petalFlag(red, 2.0, 1.6, 2.4)]);
    }
    case "acid_mound":
      return merge([
        ...mound(2.4, 2.0, "#6e4426", "#8a5a32", 7.7),
        rod("#5b3b1e", v(0, 1.8, 0), v(0, 2.8, 0), 0.2, 0.14),
        blob("#7dff4a", [0.7, 0.62, 0.7], [0, 3.3, 0], 16),
        blob("#d5ffb8", [0.22, 0.2, 0.22], [0.25, 3.6, 0.25], 8),
      ]);
    case "brood_mound": {
      const eggs: Piece[] = [];
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        eggs.push(blob("#d8d0c4", [0.3, 0.24, 0.42], [Math.cos(a) * 1.0, 2.0, Math.sin(a) * 1.0], 10));
      }
      return merge([...mound(3.8, 2.2, "#3b2a20", "#5e4838", 8.8), ...eggs, ...petalFlag("#4b2a6b", 0, -2.6, 3)]);
    }
  }
}

export type FoodKind = "crumbs" | "popsicle" | "leaves";

export function foodGeometry(kind: FoodKind): THREE.BufferGeometry {
  switch (kind) {
    case "crumbs": {
      const pieces: Piece[] = [];
      for (let i = 0; i < 9; i += 1) {
        const a = i * 2.1;
        const r = 0.3 + (i % 4) * 0.45;
        const s = 0.5 + ((i * 7) % 5) * 0.12;
        const g = new THREE.DodecahedronGeometry(s, 0);
        g.scale(1, 0.7, 1.1);
        g.rotateY(a);
        g.rotateX(a * 0.3);
        g.translate(Math.cos(a) * r, s * 0.5, Math.sin(a) * r);
        pieces.push(tint(g, i % 3 === 0 ? "#c98a3f" : "#e0a95a"));
        if (i % 2 === 0) pieces.push(blob("#4a2a16", [0.16, 0.12, 0.16], [Math.cos(a) * r + 0.2, s * 0.9, Math.sin(a) * r], 6));
      }
      return merge(pieces);
    }
    case "popsicle": {
      // A strawberry popsicle dropped on the lawn, half melted into a sticky pink lake.
      const puddle = new THREE.CircleGeometry(1, 28);
      puddle.scale(5.6, 3.8, 1);
      puddle.rotateX(-Math.PI / 2);
      puddle.translate(0.8, 0.05, 0.4);
      const bar = new THREE.BoxGeometry(3.6, 1.1, 7.2, 2, 1, 4);
      bar.translate(0, 0.62, 0.6);
      const tip = new THREE.CylinderGeometry(1.8, 1.8, 1.1, 18, 1, false, 0, Math.PI);
      tip.rotateY(-Math.PI / 2);
      tip.translate(0, 0.62, 4.2);
      const stick = new THREE.BoxGeometry(1.1, 0.35, 5.2);
      stick.translate(0, 0.25, -5.4);
      const stickEnd = new THREE.CylinderGeometry(0.55, 0.55, 0.35, 10, 1, false, 0, Math.PI);
      stickEnd.rotateY(Math.PI / 2);
      stickEnd.translate(0, 0.25, -8);
      return merge([
        tint(puddle, "#ff7aa8"),
        tint(bar, "#ff3d6e"),
        tint(tip, "#ff3d6e"),
        blob("#ffb3cb", [1.4, 0.18, 2.4], [0.4, 1.18, 1.2], 12),
        blob("#ff5c86", [0.9, 0.35, 0.9], [2.2, 0.15, 2.6], 10),
        blob("#ff5c86", [0.7, 0.3, 0.7], [-2.1, 0.12, 3.8], 10),
        tint(stick, "#e8c48a"),
        tint(stickEnd, "#e8c48a"),
      ]);
    }
    case "leaves": {
      const pieces: Piece[] = [];
      const greens = ["#3f8f2a", "#6cbf3a", "#9bcf3f", "#d9b03a"];
      for (let i = 0; i < 6; i += 1) {
        const leaf = new THREE.CircleGeometry(1, 16);
        leaf.scale(0.9, 2.0, 1);
        leaf.rotateX(-Math.PI / 2 + 0.12 * (i % 3));
        leaf.rotateY(i * 1.05);
        leaf.translate(Math.cos(i * 1.7) * 0.7, 0.12 + i * 0.12, Math.sin(i * 1.7) * 0.7);
        pieces.push(tint(leaf, greens[i % greens.length]!));
        const rib = new THREE.BoxGeometry(0.06, 0.04, 3.6);
        rib.rotateY(i * 1.05);
        rib.translate(Math.cos(i * 1.7) * 0.7, 0.15 + i * 0.12, Math.sin(i * 1.7) * 0.7);
        pieces.push(tint(rib, "#2c5e1c"));
      }
      return merge(pieces);
    }
  }
}

export type DecorKind = "petal_red" | "petal_black" | "dewdrop" | "seed";

export function decorGeometry(kind: DecorKind): THREE.BufferGeometry {
  switch (kind) {
    case "petal_red":
      return merge(petalFlag(RED_ANT.body, 0, 0, 2.6));
    case "petal_black":
      return merge(petalFlag("#4b2a6b", 0, 0, 2.6));
    case "dewdrop":
      return merge([blob("#bfe9ff", [0.7, 0.62, 0.7], [0, 0.6, 0], 18), blob("#ffffff", [0.18, 0.14, 0.18], [0.22, 0.95, 0.22], 8)]);
    case "seed": {
      const seed = new THREE.SphereGeometry(1, 14, 10);
      seed.scale(0.45, 0.32, 0.95);
      seed.translate(0, 0.3, 0);
      return merge([tint(seed, "#2b2622"), blob("#efe6d2", [0.12, 0.33, 0.9], [0, 0.31, 0], 8)]);
    }
  }
}

/* ------------------------------------------------------------------------------------------- */
/* Per-kind plan and cache                                                                      */
/* ------------------------------------------------------------------------------------------- */

const ANT_SHAPES: Record<string, { palette: BugPalette; shape: BugShape }> = {
  worker: { palette: RED_ANT, shape: { size: 1.7, headScale: 1, gasterScale: 1, legScale: 1, antennaScale: 1, mandible: 1, gasterCurl: 0 } },
  scout: { palette: RED_ANT, shape: { size: 1.8, headScale: 0.85, gasterScale: 0.75, legScale: 1.45, antennaScale: 1.7, mandible: 0.8, gasterCurl: 0, glowTips: true } },
  soldier: { palette: RED_ANT, shape: { size: 1.95, headScale: 1.55, gasterScale: 1.05, legScale: 1.05, antennaScale: 1, mandible: 2.2, gasterCurl: 0 } },
  spitter: { palette: RED_ANT, shape: { size: 1.9, headScale: 1.05, gasterScale: 1.45, legScale: 1.05, antennaScale: 1, mandible: 1, gasterCurl: 0.75, acidSac: true } },
  hero: { palette: RED_ANT, shape: { size: 2.1, headScale: 1.6, gasterScale: 1.15, legScale: 1.1, antennaScale: 1.2, mandible: 2.4, gasterCurl: 0.1, crest: true } },
  raider: { palette: BLACK_ANT, shape: { size: 1.85, headScale: 1.15, gasterScale: 1, legScale: 1.05, antennaScale: 1, mandible: 1.4, gasterCurl: 0 } },
  major: { palette: BLACK_ANT, shape: { size: 2.1, headScale: 1.8, gasterScale: 1.15, legScale: 1.1, antennaScale: 0.9, mandible: 2.6, gasterCurl: 0 } },
};

const bodyCache = new Map<string, BugBody>();
const staticCache = new Map<string, THREE.BufferGeometry>();

/** The animated body for a moving kind, or null when the kind is static. */
export function bugBodyFor(kind: string): BugBody | null {
  const cached = bodyCache.get(kind);
  if (cached !== undefined) return cached;
  let body: BugBody | null = null;
  const ant = ANT_SHAPES[kind];
  if (ant !== undefined) body = antGeometry(ant.palette, ant.shape);
  else if (kind === "beetle") body = beetleGeometry(RED_ANT);
  else if (kind === "wasp") body = waspGeometry();
  if (body !== null) bodyCache.set(kind, body);
  return body;
}

const CHAMBERS = new Set<string>(["keep_player", "keep_enemy", "barracks", "fungus_garden", "nursery", "granary", "acid_mound", "brood_mound"]);
const FOOD = new Set<string>(["crumbs", "popsicle", "leaves"]);
const DECOR_KINDS = new Set<string>(["petal_red", "petal_black", "dewdrop", "seed"]);

/** The static geometry for a chamber, food pile or dressing prop, or null when the kind is animated. */
export function staticBodyFor(kind: string): THREE.BufferGeometry | null {
  const cached = staticCache.get(kind);
  if (cached !== undefined) return cached;
  let geo: THREE.BufferGeometry | null = null;
  if (CHAMBERS.has(kind)) geo = chamberGeometry(kind as ChamberKind);
  else if (FOOD.has(kind)) geo = foodGeometry(kind as FoodKind);
  else if (DECOR_KINDS.has(kind)) geo = decorGeometry(kind as DecorKind);
  if (geo !== null) staticCache.set(kind, geo);
  return geo;
}

/** Every kind this module draws, for the render switch and its test. */
export const PROCEDURAL_KINDS: readonly string[] = [...Object.keys(ANT_SHAPES), "beetle", "wasp", ...CHAMBERS, ...FOOD, ...DECOR_KINDS];
