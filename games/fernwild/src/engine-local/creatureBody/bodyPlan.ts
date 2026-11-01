import type { ModelConfig } from "../game/playableGame";
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
  colors: { body: string; belly?: string; accent?: string };
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

const MAT = { body: 0, belly: 1, accent: 2, eye: 3 } as const;

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

  const root = rig.add("creature", -1, [0, 0, 0]);
  const body = rig.add("body", root, [0, centreY, 0]);
  const limbs: GaitLimb[] = [];
  const swaying: { node: number; phase: number; amp: number }[] = [];

  // Trunk, belly and back features.
  if (plan.serpent === undefined) {
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
      rig.part(body, MAT.accent).ellipsoid([side * torso.width * 0.08, torso.height * 0.45 + h * 0.45, z], [torso.width * 0.04, h * 0.55, h * 0.4], 6, 4);
    }
  }
  if (f.sail !== undefined) rig.part(body, MAT.accent).ellipsoid([0, torso.height * 0.4, 0], [torso.width * 0.04, f.sail, torso.length * 0.42], 10, 5);
  if (f.mane === true) rig.part(body, MAT.accent).ellipsoid([0, torso.height * 0.15, torso.length * 0.3], [torso.width * 0.6, torso.height * 0.62, torso.length * 0.28], 10, 6);

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
        rig.part(node, MAT.body).tube([0, 0, 0], knee, r * 1.15, r * 0.9).tube(knee, foot, r * 0.9, r * 0.7);
        if (!arms) rig.part(node, MAT.accent).ellipsoid([foot[0], foot[1] - r * 0.25, foot[2] + r * 0.4], [r * 0.95, r * 0.45, r * 1.4], 8, 4);
        const diagonal = legs.biped === true ? (side < 0 ? 0 : 0.5) : (pair + (side < 0 ? 0 : 1)) % 2 === 0 ? 0 : 0.5;
        limbs.push({ node, phase: diagonal, axis: [1, 0, 0], scale: arms ? 0.4 : 1 });
      }
    }
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
  rig.part(headNode, MAT.body).ellipsoid([0, 0, hl * 0.35], [hw / 2, hh / 2, hl * 0.42]);
  const snout = head.snout ?? 0.5;
  if (f.beak === true) rig.part(headNode, MAT.accent).cone([0, -hh * 0.05, hl * 0.65], [0, -hh * 0.2, hl * (0.75 + snout)], hh * 0.3);
  else if (snout > 0) rig.part(headNode, MAT.body).tube([0, -hh * 0.08, hl * 0.5], [0, -hh * 0.14, hl * (0.6 + snout)], hh * 0.36, hh * 0.24);
  for (const side of [-1, 1]) rig.part(headNode, MAT.eye).ellipsoid([side * hw * 0.38, hh * 0.18, hl * 0.48], [hh * 0.09, hh * 0.09, hh * 0.09], 6, 4);
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
      rig.part(wing, MAT.accent).ellipsoid([side * f.wings * 0.25, 0, -torso.length * 0.05], [f.wings * 0.25, torso.height * 0.04, torso.length * 0.32], 10, 4);
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

  return {
    nodes,
    materials: [
      { name: "body", color: plan.colors.body },
      { name: "belly", color: plan.colors.belly ?? plan.colors.body },
      { name: "accent", color: plan.colors.accent ?? plan.colors.body, roughness: 0.7 },
      { name: "eye", color: "#111111", roughness: 0.3 },
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
