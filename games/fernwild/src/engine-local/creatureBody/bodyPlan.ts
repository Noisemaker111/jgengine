import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { gaitClips, type GaitLimb } from "./gait";
import { encodeGlb, glbDataUrl, type GlbModel, type GlbNode, type GlbPrimitive } from "./glbWrite";

/**
 * A creature body described by knobs instead of a mesh: torso, legs, neck, head, tail and the
 * features that tell species apart (horns, frill, back plates, sail, crest, shell, wings...).
 * {@link bodyModel} turns it into an animated low-poly model with Idle, Walk, Run, Attack and Death
 * clips, so a game can field a whole bestiary before (or without) any artist-made models.
 * Lengths are metres in the creature's own frame (+Z forward, +Y up); the model is normalised to
 * a target height when drawn, so only proportions matter.
 */
export interface BodyPlan {
  /** The trunk: an ellipsoid this long, tall and wide. */
  torso: { length: number; height: number; width: number };
  /**
   * Legs in pairs along the body. `biped`: the hind pair carries it and the front pair are short
   * arms (`armScale` of a leg). Three or more pairs splay out sideways like an insect or spider.
   * Zero pairs with `serpent` makes a legless, slithering body.
   */
  legs: { pairs: 0 | 1 | 2 | 3 | 4; length: number; thickness: number; biped?: boolean; armScale?: number };
  neck?: { length: number; thickness: number; /** Degrees up from straight ahead. */ rise: number };
  head: { length: number; height: number; width: number; /** Snout length as a share of the head. */ snout?: number };
  tail?: { length: number; thickness: number; segments?: number; /** Metres the tail sinks per metre. */ droop?: number };
  /** A long legless body of this many segments (snakes, leeches). The torso is the first segment. */
  serpent?: { segments: number };
  features?: BodyFeatures;
  /** Build it as a machine: panelled boxes, metal, glowing eyes and the fittings robots carry. */
  machine?: MachineStyle;
  colors: { body: string; belly?: string; accent?: string };
}

/**
 * A body plan built as a robot instead of an animal: the same skeleton and gait, drawn in hard panels
 * over pistons, a metal finish and eyes that glow. Every length is metres.
 */
export interface MachineStyle {
  /** Eye (or lens) glow colour, sRGB hex; it reads at night and says what the machine is. */
  glow: string;
  /** Square panels for torso and head instead of rounded hide. Default true. */
  boxy?: boolean;
  /** One big lens instead of two eyes. */
  cyclops?: boolean;
  /** Antennae on the head: how many and how long. */
  antennae?: { count: 1 | 2; length: number };
  /** Exhaust stacks standing up off the back. */
  stacks?: number;
  /** A rotor disc spinning over the back, this radius (drones). */
  rotor?: number;
  /** A drill bit on the snout, this long. */
  drill?: number;
  /** A circular saw blade on the snout, this radius. */
  saw?: number;
  /** Forklift tines under the head, this long. */
  forks?: number;
  /** Bolted joint caps at the hips and knees. Default true. */
  joints?: boolean;
  /** How metallic the hull reads, 0 to 1. Default 0.55. */
  metal?: number;
  /** Tank treads down both flanks, this tall: the legs hide inside and it rolls on them. */
  treads?: number;
  /** An intake grille of this many slats across the front of the hull. */
  grille?: number;
  /** A glass canopy on the top front of the hull, as if something once rode inside. */
  cockpit?: boolean;
  /** Hazard striping across the front bumper, in the accent colour on the dark trim. */
  hazard?: boolean;
  /** Rows of status lights down the front face (a server rack), in the eye glow. */
  lights?: number;
  /** A corrugated hose for a neck: ring bands down its length. */
  ribbed?: boolean;
  /** A wide intake mouth across the front of the head, slatted. */
  mouth?: boolean;
  /** A flat fluke at the tail's tip, this wide (a whale's). */
  fluke?: number;
}

/** What sets a species apart. Every length is metres. */
export interface BodyFeatures {
  /** Horns on the head: one on the nose, two on the brow, three for both. */
  horns?: { count: 1 | 2 | 3; length: number };
  /** A bony frill behind the head, this radius. */
  frill?: number;
  /** Plates standing in a row along the back. */
  plates?: { count: number; height: number };
  /** A sail along the back, this tall. */
  sail?: number;
  /** A crest sweeping back from the head, this long. */
  crest?: number;
  /** A domed skull, this radius. */
  dome?: number;
  /** An armoured shell over the back, this much taller than the torso. */
  shell?: number;
  /** A club at the tail's tip, this radius. */
  club?: number;
  /** Tusks curving from the jaw, this long. */
  tusks?: number;
  /** A trunk hanging from the snout, this long. */
  trunk?: number;
  /** Wings from the shoulders, this full span. */
  wings?: number;
  /** Pincer jaws on the head, this long. */
  mandibles?: number;
  /** A hump on the back, this tall. */
  hump?: number;
  /** A pointed beak instead of a snout. */
  beak?: boolean;
  /** A shaggy mane over neck and shoulders. */
  mane?: boolean;
  /** Spikes along the tail, this long. */
  tailSpikes?: number;
}

type V3 = [number, number, number];

const MAT = { body: 0, belly: 1, accent: 2, eye: 3, glass: 4 } as const;

class Part {
  positions: number[] = [];
  normals: number[] = [];
  indices: number[] = [];
  constructor(readonly material: number) {}
  private vertex(p: V3, n: V3): number {
    const length = Math.hypot(n[0], n[1], n[2]) || 1;
    this.positions.push(p[0], p[1], p[2]);
    this.normals.push(n[0] / length, n[1] / length, n[2] / length);
    return this.positions.length / 3 - 1;
  }
  ellipsoid(c: V3, r: V3, segU = 10, segV = 6): this {
    const start = this.positions.length / 3;
    for (let j = 0; j <= segV; j += 1) {
      const v = (j / segV) * Math.PI;
      for (let i = 0; i <= segU; i += 1) {
        const u = (i / segU) * Math.PI * 2;
        const x = Math.sin(v) * Math.cos(u);
        const y = Math.cos(v);
        const z = Math.sin(v) * Math.sin(u);
        this.vertex([c[0] + x * r[0], c[1] + y * r[1], c[2] + z * r[2]], [x / r[0], y / r[1], z / r[2]]);
      }
    }
    for (let j = 0; j < segV; j += 1) {
      for (let i = 0; i < segU; i += 1) {
        const a = start + j * (segU + 1) + i;
        const b = a + segU + 1;
        this.indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    return this;
  }
  /** An axis-aligned box centred on `c` with half-extents `h`, flat-shaded. */
  box(c: V3, h: V3): this {
    const faces: [V3, V3, V3][] = [
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
      [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
      [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
      [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    ];
    for (const [n, u, v] of faces) {
      const corner = (su: number, sv: number): V3 => [
        c[0] + (n[0] + u[0] * su + v[0] * sv) * h[0],
        c[1] + (n[1] + u[1] * su + v[1] * sv) * h[1],
        c[2] + (n[2] + u[2] * su + v[2] * sv) * h[2],
      ];
      const a = this.vertex(corner(-1, -1), n);
      const b = this.vertex(corner(1, -1), n);
      const d = this.vertex(corner(1, 1), n);
      const e = this.vertex(corner(-1, 1), n);
      this.indices.push(a, b, d, a, d, e);
    }
    return this;
  }
  /** A tapered tube from `a` (radius r0) to `b` (radius r1), capped at both ends. */
  tube(a: V3, b: V3, r0: number, r1: number, seg = 7): this {
    const d = norm(sub(b, a));
    const up: V3 = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = norm(cross(d, up));
    const w = cross(u, d);
    const start = this.positions.length / 3;
    for (const [p, r] of [[a, r0], [b, r1]] as const) {
      for (let i = 0; i <= seg; i += 1) {
        const t = (i / seg) * Math.PI * 2;
        const n: V3 = [u[0] * Math.cos(t) + w[0] * Math.sin(t), u[1] * Math.cos(t) + w[1] * Math.sin(t), u[2] * Math.cos(t) + w[2] * Math.sin(t)];
        this.vertex([p[0] + n[0] * r, p[1] + n[1] * r, p[2] + n[2] * r], n);
      }
    }
    for (let i = 0; i < seg; i += 1) {
      const p = start + i;
      const q = start + seg + 1 + i;
      this.indices.push(p, q, p + 1, p + 1, q, q + 1);
    }
    for (const [end, r, sign] of [[a, r0, -1], [b, r1, 1]] as const) {
      const centre = this.vertex(end, [d[0] * sign, d[1] * sign, d[2] * sign]);
      const ring = this.positions.length / 3;
      for (let i = 0; i <= seg; i += 1) {
        const t = (i / seg) * Math.PI * 2;
        this.vertex([end[0] + (u[0] * Math.cos(t) + w[0] * Math.sin(t)) * r, end[1] + (u[1] * Math.cos(t) + w[1] * Math.sin(t)) * r, end[2] + (u[2] * Math.cos(t) + w[2] * Math.sin(t)) * r], [d[0] * sign, d[1] * sign, d[2] * sign]);
      }
      for (let i = 0; i < seg; i += 1) {
        if (sign > 0) this.indices.push(centre, ring + i, ring + i + 1);
        else this.indices.push(centre, ring + i + 1, ring + i);
      }
    }
    return this;
  }
  cone(base: V3, tip: V3, r: number, seg = 6): this {
    return this.tube(base, tip, r, r * 0.04, seg);
  }
  primitive(): GlbPrimitive {
    return { positions: this.positions, normals: this.normals, indices: this.indices, material: this.material };
  }
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const deg = (d: number) => (d * Math.PI) / 180;

interface Built {
  node: GlbNode;
  parts: Map<number, Part>;
}

/** The node tree under construction, with the indices each clip needs. */
class Rig {
  nodes: Built[] = [];
  add(name: string, parent: number, translation: V3): number {
    this.nodes.push({ node: { name, parent, translation, primitives: [] }, parts: new Map() });
    return this.nodes.length - 1;
  }
  part(node: number, material: number): Part {
    const built = this.nodes[node]!;
    let part = built.parts.get(material);
    if (part === undefined) {
      part = new Part(material);
      built.parts.set(material, part);
    }
    return part;
  }
  translation(node: number): V3 {
    return this.nodes[node]!.node.translation as V3;
  }
  finish(): GlbNode[] {
    return this.nodes.map(({ node, parts }) => ({ ...node, primitives: [...parts.values()].map((part) => part.primitive()) }));
  }
}

/**
 * Build a plan's node tree and its clips.
 * @capability creature-body-glb a body plan as a raw node tree and clips, to edit or write out yourself before encoding
 */
export function bodyGlbModel(plan: BodyPlan): GlbModel {
  const rig = new Rig();
  const f = plan.features ?? {};
  const { torso, legs, head } = plan;
  const splay = legs.pairs >= 3;
  const hip = splay ? legs.length * 0.45 : legs.pairs === 0 ? torso.height * 0.5 : legs.length;
  const centreY = hip + (legs.pairs === 0 ? 0 : torso.height * 0.3);

  const m = plan.machine;
  const boxy = m !== undefined && m.boxy !== false;
  const root = rig.add("creature", -1, [0, 0, 0]);
  const body = rig.add("body", root, [0, centreY, 0]);
  const limbs: GaitLimb[] = [];
  /** Machine parts that move on their own in every clip: rotors and saws spin, wheels roll, antennae sway. */
  const spinners: { node: number; axis: V3; turnsPerSecond: number; rolls?: boolean }[] = [];
  const swayers: { node: number; axis: V3; degrees: number; pulse?: number }[] = [];
  const swaying: { node: number; phase: number; amp: number }[] = [];

  // Trunk, belly and back features.
  if (plan.serpent === undefined && boxy) {
    // A hull of panels: the main box, a darker under-frame and a raised spine plate.
    rig.part(body, MAT.body).box([0, torso.height * 0.04, 0], [torso.width / 2, torso.height * 0.46, torso.length / 2]);
    rig.part(body, MAT.belly).box([0, -torso.height * 0.3, 0], [torso.width * 0.42, torso.height * 0.24, torso.length * 0.46]);
    rig.part(body, MAT.accent).box([0, torso.height * 0.52, -torso.length * 0.05], [torso.width * 0.3, torso.height * 0.06, torso.length * 0.36]);
    for (const side of [-1, 1]) rig.part(body, MAT.eye).box([side * torso.width * 0.505, torso.height * 0.12, torso.length * 0.2], [torso.width * 0.01, torso.height * 0.05, torso.length * 0.12]);
  } else if (plan.serpent === undefined) {
    rig.part(body, MAT.body).ellipsoid([0, 0, 0], [torso.width / 2, torso.height / 2, torso.length / 2], 12, 7);
    rig.part(body, MAT.belly).ellipsoid([0, -torso.height * 0.12, 0], [torso.width * 0.44, torso.height * 0.4, torso.length * 0.44], 10, 6);
  } else {
    rig.part(body, MAT.body).tube([0, 0, -torso.length / 2], [0, 0, torso.length / 2], torso.width / 2, torso.width / 2, 9);
  }
  if (f.hump !== undefined) rig.part(body, MAT.body).ellipsoid([0, torso.height * 0.4, torso.length * 0.12], [torso.width * 0.35, f.hump, torso.length * 0.25]);
  if (f.shell !== undefined) {
    rig.part(body, MAT.accent).ellipsoid([0, torso.height * 0.12, 0], [torso.width * 0.58, torso.height * 0.5 + f.shell, torso.length * 0.55], 12, 7);
    for (let i = 0; i < 5; i += 1) {
      const z = (i / 4 - 0.5) * torso.length * 0.8;
      for (const side of [-1, 1]) rig.part(body, MAT.body).cone([side * torso.width * 0.5, torso.height * 0.1, z], [side * torso.width * 0.72, torso.height * 0.15, z], torso.height * 0.08);
    }
  }
  if (f.plates !== undefined) {
    for (let i = 0; i < f.plates.count; i += 1) {
      const t = i / Math.max(1, f.plates.count - 1);
      const z = (0.45 - t * 0.95) * torso.length;
      const h = f.plates.height * (0.6 + 0.4 * Math.sin(t * Math.PI));
      const side = i % 2 === 0 ? -1 : 1;
      if (boxy) rig.part(body, MAT.accent).box([side * torso.width * 0.12, torso.height * 0.45 + h * 0.45, z], [torso.width * 0.03, h * 0.5, h * 0.35]);
      else rig.part(body, MAT.accent).ellipsoid([side * torso.width * 0.08, torso.height * 0.45 + h * 0.45, z], [torso.width * 0.04, h * 0.55, h * 0.4], 6, 4);
    }
  }
  if (f.sail !== undefined) rig.part(body, MAT.accent).ellipsoid([0, torso.height * 0.4, 0], [torso.width * 0.04, f.sail, torso.length * 0.42], 10, 5);
  if (f.mane === true) rig.part(body, MAT.accent).ellipsoid([0, torso.height * 0.15, torso.length * 0.3], [torso.width * 0.6, torso.height * 0.62, torso.length * 0.28], 10, 6);
  if (m?.stacks !== undefined) {
    for (const side of [-1, 1]) {
      const base: V3 = [side * torso.width * 0.22, torso.height * 0.4, -torso.length * 0.25];
      rig.part(body, MAT.belly).tube(base, [base[0], base[1] + m.stacks, base[2] - m.stacks * 0.15], torso.width * 0.07, torso.width * 0.06, 6);
      rig.part(body, MAT.eye).ellipsoid([base[0], base[1] + m.stacks, base[2] - m.stacks * 0.15], [torso.width * 0.05, torso.width * 0.02, torso.width * 0.05], 6, 3);
    }
  }
  if (m?.rotor !== undefined) {
    const top = torso.height * 0.5;
    rig.part(body, MAT.belly).tube([0, top, 0], [0, top + m.rotor * 0.35, 0], torso.width * 0.05, torso.width * 0.05, 6);
    const rotor = rig.add("rotor", body, [0, top + m.rotor * 0.35, 0]);
    rig.part(rotor, MAT.accent).ellipsoid([0, 0, 0], [m.rotor, m.rotor * 0.03, m.rotor], 14, 3);
    rig.part(rotor, MAT.belly).box([0, m.rotor * 0.04, 0], [m.rotor * 1.02, m.rotor * 0.02, m.rotor * 0.08]).box([0, m.rotor * 0.04, 0], [m.rotor * 0.08, m.rotor * 0.02, m.rotor * 1.02]);
    spinners.push({ node: rotor, axis: [0, 1, 0], turnsPerSecond: 3 });
  }

  // Legs.
  const hipY = hip - centreY;
  for (let pair = 0; pair < legs.pairs; pair += 1) {
    const arms = legs.biped === true && pair === 0 && legs.pairs === 2;
    const t = legs.pairs === 1 ? 0.5 : pair / (legs.pairs - 1);
    const z = legs.biped === true ? (arms ? torso.length * 0.32 : -torso.length * 0.08) : (0.36 - t * 0.72) * torso.length;
    const scale = arms ? (legs.armScale ?? 0.4) : 1;
    for (const side of [-1, 1] as const) {
      const x = side * torso.width * (splay ? 0.35 : 0.36);
      const y = arms ? torso.height * 0.05 : hipY;
      const node = rig.add(`leg_${pair}_${side < 0 ? "l" : "r"}`, body, [x, y, z]);
      const length = legs.length * scale;
      const r = legs.thickness * scale;
      if (splay) {
        const knee: V3 = [side * length * 0.55, length * 0.35, 0];
        const foot: V3 = [side * length * 1.05, -hip, (t - 0.5) * length * 0.6];
        rig.part(node, MAT.body).tube([0, 0, 0], knee, r, r * 0.8).tube(knee, foot, r * 0.8, r * 0.35);
        limbs.push({ node, phase: (pair + (side < 0 ? 0 : 1)) % 2 === 0 ? 0 : 0.5, axis: [0, 1, 0], scale: 1 });
      } else {
        const reach = arms ? length : hip;
        const knee: V3 = [0, -reach * 0.5, arms ? reach * 0.25 : (legs.biped === true ? -reach * 0.12 : reach * 0.04)];
        const foot: V3 = [0, -reach + r * 0.6, arms ? reach * 0.45 : 0];
        rig.part(node, m === undefined ? MAT.body : MAT.belly).tube([0, 0, 0], knee, r * 1.15, r * 0.9).tube(knee, foot, r * 0.9, r * 0.7);
        if (m !== undefined && m.joints !== false) rig.part(node, MAT.accent).ellipsoid([0, 0, 0], [r * 1.18, r * 1.18, r * 1.18], 8, 5).ellipsoid(knee, [r * 0.98, r * 0.98, r * 0.98], 8, 5);
        if (!arms && boxy) rig.part(node, MAT.accent).box([foot[0], foot[1] - r * 0.2, foot[2] + r * 0.4], [r * 1.0, r * 0.4, r * 1.4]);
        else if (!arms) rig.part(node, MAT.accent).ellipsoid([foot[0], foot[1] - r * 0.25, foot[2] + r * 0.4], [r * 0.95, r * 0.45, r * 1.4], 8, 4);
        const diagonal = legs.biped === true ? (side < 0 ? 0 : 0.5) : (pair + (side < 0 ? 0 : 1)) % 2 === 0 ? 0 : 0.5;
        limbs.push({ node, phase: diagonal, axis: [1, 0, 0], scale: arms ? 0.4 : 1 });
      }
    }
  }

  // Machine anatomy on the hull: treads, grille, canopy, hazard bumper, status lights.
  if (m !== undefined && plan.serpent === undefined) {
    const front = torso.length / 2;
    if (m.treads !== undefined) {
      const tall = m.treads;
      const width = Math.max(torso.width * 0.22, tall * 0.55);
      const y = -centreY + tall / 2;
      const long = torso.length * 0.95;
      for (const side of [-1, 1]) {
        const x = side * (torso.width / 2 + width / 2);
        // The track: a belt with rounded ends (idler and sprocket), pads along its top run.
        rig.part(body, MAT.belly).box([x, y, 0], [width / 2, tall / 2, long / 2 - tall / 2]);
        for (const end of [-1, 1]) rig.part(body, MAT.belly).tube([x - width / 2, y, end * (long / 2 - tall / 2)], [x + width / 2, y, end * (long / 2 - tall / 2)], tall / 2, tall / 2, 12);
        for (let pad = 0; pad < 7; pad += 1) rig.part(body, MAT.accent).box([x, y + tall / 2 + tall * 0.02, ((pad + 0.5) / 7 - 0.5) * (long - tall)], [width / 2 * 0.96, tall * 0.03, (long - tall) / 7 * 0.22]);
        // Road wheels show through the tread's flank, and the track's top run is a lighter band.
        for (let i = 0; i < 4; i += 1) {
          const z = (i / 3 - 0.5) * long * 0.8;
          const wheel = rig.add(`wheel_${side < 0 ? "l" : "r"}${i}`, body, [x, y, z]);
          rig.part(wheel, MAT.accent).tube([-side * width * 0.4, 0, 0], [side * width * 0.62, 0, 0], tall * 0.36, tall * 0.36, 12);
          // A hub spoke on the outer face shows the wheel turning.
          rig.part(wheel, MAT.belly).box([side * width * 0.64, 0, 0], [width * 0.03, tall * 0.32, tall * 0.07]);
          spinners.push({ node: wheel, axis: [1, 0, 0], turnsPerSecond: 0.8, rolls: true });
        }
      }
    }
    if (m.grille !== undefined && m.grille > 0) {
      const slats = m.grille;
      for (let i = 0; i < slats; i += 1) {
        const y = torso.height * (0.3 - (i / Math.max(1, slats - 1)) * 0.5);
        rig.part(body, MAT.belly).box([0, y, front + 0.01], [torso.width * 0.3, torso.height * 0.022, torso.length * 0.012]);
      }
    }
    if (m.cockpit === true) rig.part(body, MAT.glass).ellipsoid([0, torso.height * 0.5, front * 0.35], [torso.width * 0.26, torso.height * 0.2, torso.length * 0.16], 12, 6);
    if (m.hazard === true) {
      const bars = 6;
      for (let i = 0; i < bars; i += 1) {
        const x = ((i + 0.5) / bars - 0.5) * torso.width * 0.9;
        rig.part(body, i % 2 === 0 ? MAT.accent : MAT.belly).box([x, -torso.height * 0.36, front + 0.02], [torso.width * 0.9 / bars / 2, torso.height * 0.07, torso.length * 0.02]);
      }
    }
    if (m.lights !== undefined) {
      for (let row = 0; row < m.lights; row += 1) {
        const y = torso.height * (0.38 - (row / Math.max(1, m.lights - 1)) * 0.7);
        for (let col = 0; col < 5; col += 1) {
          const x = (col / 4 - 0.5) * torso.width * 0.7;
          rig.part(body, (row + col) % 3 === 0 ? MAT.eye : MAT.belly).box([x, y, front + 0.015], [torso.width * 0.05, torso.height * 0.02, torso.length * 0.01]);
        }
      }
    }
    // Panel seams: two dark bands round a boxy hull break the slab into plates.
    if (boxy) for (const z of [-0.18, 0.18]) rig.part(body, MAT.belly).box([0, torso.height * 0.04, z * torso.length], [torso.width / 2 + 0.008, torso.height * 0.465, torso.length * 0.008]);
  }

  // Neck and head.
  const front: V3 = [0, torso.height * (plan.neck === undefined ? 0.05 : 0.22), torso.length * 0.42];
  let headParent = body;
  let headAt: V3 = front;
  let neckNode = -1;
  if (plan.neck !== undefined) {
    neckNode = rig.add("neck", body, front);
    const dir: V3 = [0, Math.sin(deg(plan.neck.rise)), Math.cos(deg(plan.neck.rise))];
    const tip: V3 = [0, dir[1] * plan.neck.length, dir[2] * plan.neck.length];
    rig.part(neckNode, MAT.body).tube([0, 0, -plan.neck.thickness * 0.6], tip, plan.neck.thickness, plan.neck.thickness * 0.7);
    if (m?.ribbed === true) {
      for (let ring = 1; ring < 9; ring += 1) {
        const t = ring / 9;
        const r = plan.neck.thickness * (1 - 0.3 * t) * 1.12;
        const at: V3 = [0, tip[1] * t, -plan.neck.thickness * 0.6 + (tip[2] + plan.neck.thickness * 0.6) * t];
        rig.part(neckNode, MAT.belly).tube([at[0], at[1] - dir[1] * r * 0.12, at[2] - dir[2] * r * 0.12], [at[0], at[1] + dir[1] * r * 0.12, at[2] + dir[2] * r * 0.12], r, r, 10);
      }
    }
    if (f.mane === true) rig.part(neckNode, MAT.accent).tube([0, plan.neck.thickness * 0.4, 0], [0, tip[1] + plan.neck.thickness * 0.3, tip[2] * 0.8], plan.neck.thickness * 1.1, plan.neck.thickness * 0.6);
    headParent = neckNode;
    headAt = tip;
  } else if (plan.serpent === undefined) {
    headAt = [0, front[1], torso.length * 0.4];
  } else {
    headAt = [0, 0, torso.length / 2];
  }
  const headNode = rig.add("head", headParent, headAt);
  const hl = head.length;
  const hh = head.height;
  const hw = head.width;
  const snout = head.snout ?? 0.5;
  if (boxy) {
    rig.part(headNode, MAT.body).box([0, 0, hl * 0.35], [hw / 2, hh / 2, hl * 0.42]);
    if (f.beak === true) rig.part(headNode, MAT.accent).cone([0, -hh * 0.05, hl * 0.7], [0, -hh * 0.2, hl * (0.8 + snout)], hh * 0.3, 4);
    else if (snout > 0) rig.part(headNode, MAT.belly).box([0, -hh * 0.14, hl * (0.72 + snout * 0.5)], [hw * 0.32, hh * 0.24, hl * snout * 0.5]);
    // A visor band across the face carries the eyes.
    rig.part(headNode, MAT.belly).box([0, hh * 0.16, hl * 0.775], [hw * 0.46, hh * 0.14, hl * 0.02]);
  } else {
    rig.part(headNode, MAT.body).ellipsoid([0, 0, hl * 0.35], [hw / 2, hh / 2, hl * 0.42]);
    if (f.beak === true) rig.part(headNode, MAT.accent).cone([0, -hh * 0.05, hl * 0.65], [0, -hh * 0.2, hl * (0.75 + snout)], hh * 0.3);
    else if (snout > 0) rig.part(headNode, MAT.body).tube([0, -hh * 0.08, hl * 0.5], [0, -hh * 0.14, hl * (0.6 + snout)], hh * 0.36, hh * 0.24);
  }
  // A machine's eyes sit on their own node so they can pulse.
  const eyeAt: V3 = [0, hh * 0.16, hl * (boxy ? 0.79 : m?.cyclops === true ? 0.7 : 0.48)];
  const eyes = m === undefined ? headNode : rig.add("eyes", headNode, eyeAt);
  const eyeOffset = (p: V3): V3 => (m === undefined ? p : [p[0] - eyeAt[0], p[1] - eyeAt[1], p[2] - eyeAt[2]]);
  if (m !== undefined) swayers.push({ node: eyes, axis: [0, 0, 0], degrees: 0, pulse: 0.14 });
  if (m?.cyclops === true) rig.part(eyes, MAT.eye).ellipsoid(eyeOffset([0, hh * 0.16, hl * (boxy ? 0.79 : 0.7)]), [hh * 0.24, hh * 0.24, hh * 0.08], 10, 6);
  else if (boxy) for (const side of [-1, 1]) rig.part(eyes, MAT.eye).box(eyeOffset([side * hw * 0.24, hh * 0.16, hl * 0.79]), [hw * 0.15, hh * 0.11, hl * 0.02]);
  else for (const side of [-1, 1]) rig.part(eyes, MAT.eye).ellipsoid(eyeOffset([side * hw * 0.38, hh * 0.18, hl * 0.48]), [hh * (m === undefined ? 0.09 : 0.16), hh * (m === undefined ? 0.09 : 0.16), hh * (m === undefined ? 0.09 : 0.16)], 6, 4);
  if (m?.antennae !== undefined) {
    const spots = m.antennae.count === 1 ? [0] : [-1, 1];
    for (const side of spots) {
      const foot: V3 = [side * hw * 0.3, hh * 0.45, hl * 0.25];
      const antenna = rig.add(`antenna_${side < 0 ? "l" : side > 0 ? "r" : "c"}`, headNode, foot);
      const tip: V3 = [side * m.antennae.length * 0.25, m.antennae.length, -m.antennae.length * 0.3];
      rig.part(antenna, MAT.belly).tube([0, 0, 0], tip, hh * 0.035, hh * 0.02, 5);
      rig.part(antenna, MAT.eye).ellipsoid(tip, [hh * 0.07, hh * 0.07, hh * 0.07], 6, 4);
      swayers.push({ node: antenna, axis: [0, 0, 1], degrees: 9 });
    }
  }
  if (m?.mouth === true) {
    // A nozzle intake: a dark slot across the lower face with slats over it.
    rig.part(headNode, MAT.belly).box([0, -hh * 0.18, hl * 0.78], [hw * 0.44, hh * 0.2, hl * 0.04]);
    for (let slat = 0; slat < 4; slat += 1) rig.part(headNode, MAT.accent).box([((slat + 0.5) / 4 - 0.5) * hw * 0.8, -hh * 0.18, hl * 0.81], [hw * 0.02, hh * 0.19, hl * 0.02]);
  }
  if (m?.drill !== undefined) rig.part(headNode, MAT.accent).cone([0, -hh * 0.1, hl * (0.75 + snout)], [0, -hh * 0.1, hl * (0.75 + snout) + m.drill], hh * 0.28, 8);
  if (m?.saw !== undefined) {
    const saw = rig.add("saw", headNode, [0, -hh * 0.2, hl * (0.7 + snout) + m.saw * 0.4]);
    rig.part(saw, MAT.accent).ellipsoid([0, 0, 0], [hh * 0.04, m.saw, m.saw], 16, 4);
    for (let tooth = 0; tooth < 8; tooth += 1) {
      const angle = (tooth / 8) * Math.PI * 2;
      rig.part(saw, MAT.belly).box([0, Math.sin(angle) * m.saw * 1.02, Math.cos(angle) * m.saw * 1.02], [hh * 0.05, m.saw * 0.08, m.saw * 0.08]);
    }
    spinners.push({ node: saw, axis: [1, 0, 0], turnsPerSecond: 2 });
  }
  if (m?.forks !== undefined) for (const side of [-1, 1]) rig.part(headNode, MAT.belly).box([side * hw * 0.25, -hh * 0.55, hl * 0.6 + m.forks * 0.5], [hw * 0.06, hh * 0.04, m.forks * 0.5]);
  if (f.horns !== undefined) {
    if (f.horns.count !== 2) rig.part(headNode, MAT.accent).cone([0, hh * 0.15, hl * (0.6 + snout * 0.7)], [0, hh * 0.15 + f.horns.length * 0.8, hl * (0.6 + snout * 0.7) + f.horns.length * 0.4], hh * 0.16);
    if (f.horns.count >= 2) for (const side of [-1, 1]) rig.part(headNode, MAT.accent).cone([side * hw * 0.3, hh * 0.35, hl * 0.4], [side * hw * 0.45, hh * 0.35 + f.horns.length * 0.5, hl * 0.4 + f.horns.length * 0.85], hh * 0.14);
  }
  if (f.frill !== undefined) rig.part(headNode, MAT.accent).ellipsoid([0, hh * 0.45, hl * 0.02], [f.frill, f.frill * 0.85, hh * 0.08], 12, 5);
  if (f.crest !== undefined) rig.part(headNode, MAT.accent).tube([0, hh * 0.35, hl * 0.4], [0, hh * 0.35 + f.crest * 0.35, hl * 0.4 - f.crest], hh * 0.14, hh * 0.08);
  if (f.dome !== undefined) rig.part(headNode, MAT.accent).ellipsoid([0, hh * 0.38, hl * 0.3], [f.dome, f.dome * 0.85, f.dome], 10, 6);
  if (f.tusks !== undefined) for (const side of [-1, 1]) rig.part(headNode, MAT.accent).tube([side * hw * 0.25, -hh * 0.3, hl * 0.65], [side * hw * 0.35, -hh * 0.3 - f.tusks * 0.35, hl * 0.65 + f.tusks * 0.75], hh * 0.12, hh * 0.04);
  if (f.trunk !== undefined) rig.part(headNode, MAT.body).tube([0, -hh * 0.1, hl * 0.75], [0, -hh * 0.1 - f.trunk, hl * 0.85 + f.trunk * 0.15], hh * 0.2, hh * 0.1);
  if (f.mandibles !== undefined) for (const side of [-1, 1]) rig.part(headNode, MAT.accent).cone([side * hw * 0.3, -hh * 0.15, hl * 0.7], [side * hw * 0.1, -hh * 0.2, hl * 0.7 + f.mandibles], hh * 0.12);

  // Wings.
  const wings: number[] = [];
  if (f.wings !== undefined) {
    for (const side of [-1, 1] as const) {
      const wing = rig.add(`wing_${side < 0 ? "l" : "r"}`, body, [side * torso.width * 0.4, torso.height * 0.3, torso.length * 0.1]);
      if (boxy) rig.part(wing, MAT.accent).box([side * f.wings * 0.25, 0, -torso.length * 0.05], [f.wings * 0.25, torso.height * 0.03, torso.length * 0.28]);
      else rig.part(wing, MAT.accent).ellipsoid([side * f.wings * 0.25, 0, -torso.length * 0.05], [f.wings * 0.25, torso.height * 0.04, torso.length * 0.32], 10, 4);
      wings.push(wing);
    }
  }

  // Tail, or the serpent's long body.
  const chain = plan.serpent?.segments ?? plan.tail?.segments ?? 4;
  const tailLength = plan.serpent !== undefined ? torso.length * (chain - 1) : (plan.tail?.length ?? 0);
  if (tailLength > 0) {
    const seg = tailLength / chain;
    const droop = plan.tail?.droop ?? 0.08;
    let parent = body;
    let at: V3 = plan.serpent !== undefined ? [0, 0, -torso.length / 2] : [0, torso.height * 0.05, -torso.length * 0.42];
    const r0 = plan.serpent !== undefined ? torso.width / 2 : (plan.tail?.thickness ?? torso.height * 0.25);
    for (let i = 0; i < chain; i += 1) {
      const node = rig.add(`tail_${i}`, parent, at);
      const ra = r0 * (1 - (i / chain) * 0.85);
      const rb = r0 * (1 - ((i + 1) / chain) * 0.85);
      rig.part(node, MAT.body).tube([0, 0, 0], [0, -seg * droop, -seg], ra, rb);
      if (f.tailSpikes !== undefined && i >= chain - 2) for (const side of [-1, 1]) rig.part(node, MAT.accent).cone([side * ra * 0.6, ra * 0.4, -seg * 0.5], [side * (ra + f.tailSpikes), ra * 0.4 + f.tailSpikes * 0.5, -seg * 0.6], ra * 0.35);
      if (f.club !== undefined && i === chain - 1) rig.part(node, MAT.accent).ellipsoid([0, -seg * droop, -seg], [f.club, f.club * 0.7, f.club], 8, 5);
      if (m?.fluke !== undefined && i === chain - 1) rig.part(node, MAT.accent).box([0, -seg * droop, -seg * 1.05], [m.fluke / 2, ra * 0.25, seg * 0.35]);
      swaying.push({ node, phase: i / chain, amp: plan.serpent !== undefined ? 22 : 6 + i * 2 });
      parent = node;
      at = [0, -seg * droop, -seg];
    }
  }

  const nodes = rig.finish();
  const nodder = neckNode >= 0 ? neckNode : nodes.findIndex((node) => node.name === "head");
  const clips = gaitClips({
    body,
    restBody: rig.translation(body),
    limbs,
    swaying,
    wings,
    nodder,
    height: centreY + torso.height / 2,
    fallen: Math.max(torso.width / 2, torso.height * 0.35),
  });

  // Machine parts move in every clip but the death: rotors and saws spin, wheels roll faster at a run, antennae sway.
  for (const clip of clips) {
    if (clip.name === "Death" || (spinners.length === 0 && swayers.length === 0)) continue;
    const duration = Math.max(0.5, ...clip.tracks.flatMap((track) => track.times));
    const pace = clip.name === "Run" ? 2.2 : clip.name === "Walk" ? 1 : 0;
    for (const spinner of spinners) {
      const rate = spinner.rolls === true ? spinner.turnsPerSecond * pace : spinner.turnsPerSecond;
      const turns = Math.round(rate * duration);
      if (turns === 0) continue;
      const keys = turns * 8;
      const times = Array.from({ length: keys + 1 }, (_, k) => (k / keys) * duration);
      const values = times.map((_, k) => {
        const angle = (k / keys) * turns * Math.PI * 2;
        const sin = Math.sin(angle / 2);
        return [spinner.axis[0] * sin, spinner.axis[1] * sin, spinner.axis[2] * sin, Math.cos(angle / 2)] as const;
      });
      clip.tracks.push({ node: spinner.node, path: "rotation", times, values });
    }
    for (const swayer of swayers) {
      const keys = 8;
      if (swayer.pulse !== undefined) {
        // Eyes swell and settle like a charge indicator, twice a clip.
        const times = Array.from({ length: keys + 1 }, (_, k) => (k / keys) * duration);
        const values = times.map((_, k) => {
          const grow = 1 + swayer.pulse! * (0.5 - 0.5 * Math.cos((k / keys) * Math.PI * 4));
          return [grow, grow, grow] as const;
        });
        clip.tracks.push({ node: swayer.node, path: "scale", times, values });
        continue;
      }
      const times = Array.from({ length: keys + 1 }, (_, k) => (k / keys) * duration);
      const values = times.map((_, k) => {
        const angle = deg(swayer.degrees * (clip.name === "Idle" ? 0.6 : 1)) * Math.sin((k / keys) * Math.PI * 2);
        const sin = Math.sin(angle / 2);
        return [swayer.axis[0] * sin, swayer.axis[1] * sin, swayer.axis[2] * sin, Math.cos(angle / 2)] as const;
      });
      clip.tracks.push({ node: swayer.node, path: "rotation", times, values });
    }
  }

  return {
    nodes,
    materials:
      m === undefined
        ? [
            { name: "body", color: plan.colors.body },
            { name: "belly", color: plan.colors.belly ?? plan.colors.body },
            { name: "accent", color: plan.colors.accent ?? plan.colors.body, roughness: 0.7 },
            { name: "eye", color: "#111111", roughness: 0.3 },
          ]
        : [
            { name: "body", color: plan.colors.body, metalness: m.metal ?? 0.55, roughness: 0.45 },
            { name: "belly", color: plan.colors.belly ?? "#3a3d42", metalness: 0.7, roughness: 0.4 },
            { name: "accent", color: plan.colors.accent ?? plan.colors.body, metalness: 0.35, roughness: 0.55 },
            { name: "eye", color: m.glow, emissive: m.glow, roughness: 0.2 },
            { name: "glass", color: "#7fd3e8", emissive: "#12343c", metalness: 0.1, roughness: 0.05 },
          ],
    clips,
  };
}

/**
 * A body plan as a drawable, animated model: an embedded GLB (a `data:` URL) the engine loads,
 * scales to `targetHeight` and animates (idle, walk, run, attack, death) like an imported creature.
 * The GLB is built the first time its `url` is read, so a bestiary of bodies costs nothing until a
 * species is actually drawn.
 * @capability creature-body give a creature an animated low-poly body from knobs (torso, legs, neck, head, tail, horns, frill, plates, wings...) without a model file
 */
export function bodyModel(plan: BodyPlan, targetHeight: number): ModelConfig {
  let url: string | null = null;
  return {
    get url(): string {
      url ??= glbDataUrl(encodeGlb(bodyGlbModel(plan)));
      return url;
    },
    animation: "auto",
    targetHeight,
  };
}
