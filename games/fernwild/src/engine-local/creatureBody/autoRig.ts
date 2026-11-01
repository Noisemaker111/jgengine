// @skill jgengine-assets
import { gaitClips, type GaitLimb } from "./gait";
import type { ReadModel } from "./glbRead";
import type { GlbMaterial, GlbModel, GlbNode, GlbPrimitive } from "./glbWrite";

/**
 * How a static animal model is put together, which decides the bones {@link autoRig} gives it:
 * - `quadruped`: four legs, a head in front and an optional tail behind.
 * - `biped`: two legs under a level body (theropods, big birds, apes), tail optional.
 * - `flyer`: a bird or pterosaur with spread wings and a pair of legs.
 * - `bug`: legs splayed out sideways in pairs (spiders, scorpions, ants).
 * - `serpent`: no legs, one long swaying body (snakes, leeches).
 */
export type RigShape = "quadruped" | "biped" | "flyer" | "bug" | "serpent";

/** What {@link autoRig} needs to know about a model; every share is of the model's own size. */
export interface AutoRigOptions {
  shape: RigShape;
  /** The way the source model faces. Default `+z`. */
  facing?: "+z" | "-z" | "+x" | "-x";
  /** Where the legs join the body, as a share of standing height. Found from the belly when omitted. */
  legTop?: number;
  /** Share of the body length, from the nose, that the neck and head take. */
  head?: number;
  /** Share of the body length, from the tail tip, that the tail takes; 0 for no tail. */
  tail?: number;
  /** Pairs of legs on a bug. Default 4. */
  legPairs?: number;
  /** Where a wing (flyer) or a splayed leg (bug) leaves the body, as a share of the half-width. */
  bodyWidth?: number;
}

type V3 = [number, number, number];

const DEFAULTS: Record<RigShape, { head: number; tail: number }> = {
  quadruped: { head: 0.24, tail: 0.12 },
  biped: { head: 0.24, tail: 0.38 },
  flyer: { head: 0.3, tail: 0.15 },
  bug: { head: 0.22, tail: 0.25 },
  serpent: { head: 0.1, tail: 0.9 },
};

const smooth = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

function toHex(linear: readonly number[]): string {
  const channel = (c: number) => {
    const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, s)) * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(linear[0]!)}${channel(linear[1]!)}${channel(linear[2]!)}`;
}

/** Turn a point or direction so the model faces +Z. */
function facingTurn(facing: AutoRigOptions["facing"]): (x: number, z: number) => [number, number] {
  switch (facing) {
    case "-z": return (x, z) => [-x, -z];
    case "+x": return (x, z) => [-z, x];
    case "-x": return (x, z) => [z, -x];
    default: return (x, z) => [x, z];
  }
}

/** Lowest point where an upward ray at (x, z) meets the mesh, or null. */
function lowestHit(prims: readonly { positions: Float32Array; indices: Uint32Array }[], x: number, z: number): number | null {
  let best: number | null = null;
  for (const { positions: p, indices } of prims) {
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t]! * 3, b = indices[t + 1]! * 3, c = indices[t + 2]! * 3;
      const ax = p[a]!, az = p[a + 2]!, bx = p[b]!, bz = p[b + 2]!, cx = p[c]!, cz = p[c + 2]!;
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-12) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
      const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
      const l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      const y = l1 * p[a + 1]! + l2 * p[b + 1]! + l3 * p[c + 1]!;
      if (best === null || y < best) best = y;
    }
  }
  return best;
}

/** Split values into `k` groups by 1-D k-means; returns the sorted group centres. */
function kMeans1d(values: readonly number[], k: number): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  let centres = Array.from({ length: k }, (_, i) => sorted[Math.min(sorted.length - 1, Math.floor(((i + 0.5) / k) * sorted.length))]!);
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const sums = new Array<number>(k).fill(0);
    const counts = new Array<number>(k).fill(0);
    for (const v of sorted) {
      let best = 0;
      for (let i = 1; i < k; i += 1) if (Math.abs(v - centres[i]!) < Math.abs(v - centres[best]!)) best = i;
      sums[best]! += v;
      counts[best]! += 1;
    }
    centres = centres.map((c, i) => (counts[i]! > 0 ? sums[i]! / counts[i]! : c));
  }
  return centres.sort((a, b) => a - b);
}

const nearestIndex = (centres: readonly number[], v: number): number => {
  let best = 0;
  for (let i = 1; i < centres.length; i += 1) if (Math.abs(v - centres[i]!) < Math.abs(v - centres[best]!)) best = i;
  return best;
};

/**
 * Give a static animal model a skeleton and the five gait clips: legs found under the belly and
 * swung in a diagonal (or alternating) stride, a neck that nods and bites, a tail or serpent body
 * that sways, wings that flap, and a trunk that bobs and falls over on death. The mesh is skinned
 * with soft weights across each joint, so nothing tears at the hips or neck. The model is turned to
 * face +Z, stood on y = 0 and centred; materials, textures and vertex colours carry over untouched.
 * @capability auto-rig turn a static animal model (any downloaded GLB) into an animated, skinned creature with idle, walk, run, attack and death
 */
export function autoRig(source: ReadModel, options: AutoRigOptions): GlbModel {
  const { shape } = options;
  const turn = facingTurn(options.facing);
  const prims = source.primitives.map((prim) => {
    const positions = new Float32Array(prim.positions.length);
    const normals = new Float32Array(prim.normals.length);
    for (let i = 0; i < prim.positions.length; i += 3) {
      const [x, z] = turn(prim.positions[i]!, prim.positions[i + 2]!);
      positions[i] = x;
      positions[i + 1] = prim.positions[i + 1]!;
      positions[i + 2] = z;
      const [nx, nz] = turn(prim.normals[i]!, prim.normals[i + 2]!);
      normals[i] = nx;
      normals[i + 1] = prim.normals[i + 1]!;
      normals[i + 2] = nz;
    }
    return { ...prim, positions, normals };
  });

  // Stand it on y = 0, centred in x and z.
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const { positions } of prims) {
    for (let i = 0; i < positions.length; i += 3) {
      for (let k = 0; k < 3; k += 1) {
        min[k] = Math.min(min[k]!, positions[i + k]!);
        max[k] = Math.max(max[k]!, positions[i + k]!);
      }
    }
  }
  const shift: V3 = [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2];
  for (const { positions } of prims) for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k += 1) positions[i + k] = positions[i + k]! + shift[k]!;
  const width = max[0] - min[0];
  const height = max[1] - min[1];
  const length = max[2] - min[2];
  const front = length / 2;
  const back = -length / 2;

  const headShare = options.head ?? DEFAULTS[shape].head;
  const tailShare = options.tail ?? DEFAULTS[shape].tail;
  const headZ = front - headShare * length;
  const tailZ = back + tailShare * length;
  const bandZ = length * 0.05;
  const halfWidth = width / 2;
  const sideX = (options.bodyWidth ?? (shape === "flyer" ? 0.3 : 0.35)) * halfWidth;

  // Where the legs meet the body: the belly seen from straight below, between the legs.
  let legTop = options.legTop === undefined ? null : options.legTop * height;
  if (legTop === null && (shape === "quadruped" || shape === "biped" || shape === "flyer")) {
    const hits: number[] = [];
    for (let i = 0; i < 9; i += 1) {
      const z = tailZ + ((headZ - tailZ) * (i + 0.5)) / 9;
      const hit = lowestHit(prims, 0, z);
      if (hit !== null) hits.push(hit);
    }
    hits.sort((a, b) => a - b);
    legTop = hits.length === 0 ? height * 0.45 : hits[Math.floor(hits.length / 2)]!;
    legTop = Math.min(Math.max(legTop, height * 0.12), height * 0.75);
  }
  const legBand = height * 0.06;

  // Bones. Node 0 is the root, 1 the trunk; every joint's rest pose is a pure translation.
  const nodes: GlbNode[] = [{ name: "creature", parent: -1, translation: [0, 0, 0], primitives: [] }];
  const world: V3[] = [[0, 0, 0]];
  const joint = (name: string, parent: number, at: V3): number => {
    const p = world[parent]!;
    nodes.push({ name, parent, translation: [at[0] - p[0], at[1] - p[1], at[2] - p[2]], primitives: [] });
    world.push(at);
    return nodes.length - 1;
  };
  const meanY = (z: number, band: number, above = -Infinity): number => {
    let sum = 0;
    let count = 0;
    for (const { positions } of prims) {
      for (let i = 0; i < positions.length; i += 3) {
        if (Math.abs(positions[i + 2]! - z) <= band && positions[i + 1]! > above) {
          sum += positions[i + 1]!;
          count += 1;
        }
      }
    }
    return count === 0 ? height * 0.5 : sum / count;
  };

  const bodyY = shape === "serpent" || shape === "bug" ? meanY((headZ + tailZ) / 2, length * 0.2) : (legTop ?? 0) + (height - (legTop ?? 0)) * 0.35;
  const body = joint("body", 0, [0, bodyY, (headZ + tailZ) / 2]);

  // Legs.
  const limbs: GaitLimb[] = [];
  const legJoints: { node: number; x: number; z: number }[] = [];
  let legZCentres: number[] = [];
  if (shape === "quadruped" || shape === "biped" || shape === "flyer") {
    const feet: number[] = [];
    for (const { positions } of prims) {
      for (let i = 0; i < positions.length; i += 3) {
        const z = positions[i + 2]!;
        if (positions[i + 1]! < legTop! * 0.5 && z > tailZ - bandZ && z < headZ + bandZ) feet.push(z);
      }
    }
    legZCentres = shape === "quadruped" ? kMeans1d(feet, 2) : [feet.length === 0 ? 0 : feet.reduce((a, b) => a + b, 0) / feet.length];
    const hipY = Math.min(legTop! + height * 0.08, bodyY);
    legZCentres.forEach((z, pair) => {
      for (const side of [-1, 1] as const) {
        let sumX = 0;
        let count = 0;
        for (const { positions } of prims) {
          for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i]!;
            if (positions[i + 1]! < legTop! && Math.sign(x) === side && nearestIndex(legZCentres, positions[i + 2]!) === pair) {
              sumX += x;
              count += 1;
            }
          }
        }
        const x = count === 0 ? side * halfWidth * 0.4 : sumX / count;
        const node = joint(`leg_${pair}_${side < 0 ? "l" : "r"}`, body, [x, hipY, z]);
        legJoints.push({ node, x, z });
        const phase = shape === "quadruped" ? ((pair + (side < 0 ? 0 : 1)) % 2 === 0 ? 0 : 0.5) : side < 0 ? 0 : 0.5;
        limbs.push({ node, phase, axis: [1, 0, 0], scale: 1 });
      }
    });
  } else if (shape === "bug") {
    const pairs = options.legPairs ?? 4;
    const zs: number[] = [];
    for (const { positions } of prims) for (let i = 0; i < positions.length; i += 3) if (Math.abs(positions[i]!) > sideX * 1.4) zs.push(positions[i + 2]!);
    legZCentres = kMeans1d(zs, pairs);
    legZCentres.forEach((z, pair) => {
      for (const side of [-1, 1] as const) {
        const node = joint(`leg_${pair}_${side < 0 ? "l" : "r"}`, body, [side * sideX, bodyY, z]);
        legJoints.push({ node, x: side * sideX, z });
        limbs.push({ node, phase: (pair + (side < 0 ? 0 : 1)) % 2 === 0 ? 0 : 0.5, axis: [0, 1, 0], scale: 1 });
      }
    });
  }

  // Neck and head.
  const neck = joint("neck", body, [0, meanY(headZ, bandZ, legTop ?? -Infinity), headZ]);

  // Tail (or the serpent's whole body behind the head) as a chain.
  const swaying: { node: number; phase: number; amp: number }[] = [];
  const tailJoints: { node: number; z: number }[] = [];
  if (tailShare > 0) {
    const segments = shape === "serpent" ? 6 : 3;
    let parent = body;
    for (let i = 0; i < segments; i += 1) {
      const z = tailZ - ((tailZ - back) * i) / segments;
      const node = joint(`tail_${i}`, parent, [0, meanY(z, bandZ), z]);
      tailJoints.push({ node, z });
      swaying.push({ node, phase: i / segments, amp: shape === "serpent" ? 22 : 6 + i * 2 });
      parent = node;
    }
  }

  // Wings.
  const wings: number[] = [];
  if (shape === "flyer") {
    for (const side of [-1, 1] as const) {
      let sumY = 0;
      let sumZ = 0;
      let count = 0;
      for (const { positions } of prims) {
        for (let i = 0; i < positions.length; i += 3) {
          const x = positions[i]! * side;
          if (x > sideX && x < sideX * 1.6) {
            sumY += positions[i + 1]!;
            sumZ += positions[i + 2]!;
            count += 1;
          }
        }
      }
      wings.push(joint(`wing_${side < 0 ? "l" : "r"}`, body, [side * sideX, count === 0 ? bodyY : sumY / count, count === 0 ? 0 : sumZ / count]));
    }
  }

  // Skin weights: each region fades into the trunk across a band around its joint.
  const jointList = nodes.map((_, index) => index).filter((index) => index > 0);
  const slot = new Map(jointList.map((node, index) => [node, index]));
  const primitives: GlbPrimitive[] = prims.map((prim) => {
    const count = prim.positions.length / 3;
    const joints = new Uint16Array(count * 4);
    const weights = new Float32Array(count * 4);
    for (let v = 0; v < count; v += 1) {
      const x = prim.positions[v * 3]!, y = prim.positions[v * 3 + 1]!, z = prim.positions[v * 3 + 2]!;
      const influences: [number, number][] = [];
      // A head reaches down only to the belly: feet and talons under it stay on their legs.
      const head = smooth(headZ - bandZ, headZ + bandZ, z) * (legTop === null ? 1 : smooth(legTop - legBand, legTop + legBand, y));
      if (head > 0) influences.push([neck, head]);
      if (tailJoints.length > 0 && z < tailZ + bandZ) {
        const first = 1 - smooth(tailZ - bandZ, tailZ + bandZ, z);
        // Hat functions along the chain: each joint owns the stretch behind it up to the next.
        const step = (tailZ - back) / tailJoints.length;
        const f = Math.max(0, (tailZ - z) / step);
        const i = Math.min(tailJoints.length - 1, Math.floor(f));
        const frac = Math.min(1, f - i);
        const blend = i + 1 < tailJoints.length ? smooth(0.6, 1, frac) : 0;
        influences.push([tailJoints[i]!.node, first * (1 - blend)]);
        if (blend > 0) influences.push([tailJoints[i + 1]!.node, first * blend]);
      }
      if (legJoints.length > 0 && z > tailZ - bandZ * 2 && z < headZ + bandZ * 2) {
        let leg = 0;
        if (shape === "bug") leg = smooth(sideX * 0.9, sideX * 1.3, Math.abs(x));
        else leg = 1 - smooth(legTop! - legBand, legTop! + legBand, y);
        if (leg > 0) {
          const pair = nearestIndex(legZCentres, z);
          const side = x < 0 ? "l" : "r";
          const node = legJoints.find((j) => nodes[j.node]!.name === `leg_${pair}_${side}`)?.node;
          if (node !== undefined) influences.push([node, leg * (1 - head)]);
        }
      }
      if (wings.length === 2) {
        const wing = smooth(sideX * 0.9, sideX * 1.3, Math.abs(x)) * (1 - head);
        if (wing > 0) influences.push([wings[x < 0 ? 0 : 1]!, wing]);
      }
      let used = influences.reduce((sum, [, w]) => sum + w, 0);
      if (used > 1) {
        for (const entry of influences) entry[1] /= used;
        used = 1;
      }
      if (used < 1) influences.push([body, 1 - used]);
      influences.sort((a, b) => b[1] - a[1]);
      const top = influences.slice(0, 4);
      const total = top.reduce((sum, [, w]) => sum + w, 0) || 1;
      top.forEach(([node, w], k) => {
        joints[v * 4 + k] = slot.get(node)!;
        weights[v * 4 + k] = w / total;
      });
    }
    return {
      positions: prim.positions,
      normals: prim.normals,
      indices: prim.indices,
      material: prim.material,
      ...(prim.uvs === undefined ? {} : { uvs: prim.uvs }),
      ...(prim.colors === undefined ? {} : { colors: prim.colors }),
      skin: { joints, weights },
    };
  });
  nodes.push({ name: "mesh", parent: -1, translation: [0, 0, 0], primitives, skin: 0 });

  const materials: GlbMaterial[] = source.materials.map((material) => ({
    name: material.name,
    color: toHex(material.baseColor),
    roughness: material.roughness,
    metalness: material.metalness,
    ...(material.emissive.some((c) => c > 0) ? { emissive: toHex(material.emissive) } : {}),
    ...(material.doubleSided ? { doubleSided: true } : {}),
    ...(material.image === undefined ? {} : { image: material.image }),
  }));

  return {
    nodes,
    materials,
    images: source.images,
    skins: [{ joints: jointList, inverseBindMatrices: jointList.map((node) => {
      const [x, y, z] = world[node]!;
      return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1];
    }) }],
    clips: gaitClips({
      body,
      restBody: world[body]!,
      limbs,
      swaying,
      wings,
      nodder: neck,
      height,
      fallen: Math.max(width * 0.3, height * 0.3),
    }),
  };
}
