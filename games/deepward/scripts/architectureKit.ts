/** Procedural mesh kit shared by Deepward's glTF authoring scripts: boxes and cylinders merged per material, each vertex tagged with the joint that moves it. */
export type V3 = [number, number, number];
export interface Part { positions: number[]; normals: number[]; indices: number[]; joints: number[] }
export type Palette = Record<string, { color: [number, number, number]; metal: number; rough: number; emissive?: [number, number, number] }>;
export const hex = (value: string): [number, number, number] => {
  const n = parseInt(value.slice(1), 16);
  const lin = (c: number) => Math.pow(c / 255, 2.2);
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
};
export const PALETTE: Palette = {
  slate: { color: hex("#34444b"), metal: 0.35, rough: 0.62 },
  steel: { color: hex("#82918b"), metal: 0.85, rough: 0.38 },
  brass: { color: hex("#cca46c"), metal: 0.9, rough: 0.32 },
  iron: { color: hex("#1b2326"), metal: 0.7, rough: 0.5 },
  cyan: { color: hex("#84e8d0"), metal: 0, rough: 0.5, emissive: hex("#84e8d0") },
  red: { color: hex("#ee7361"), metal: 0, rough: 0.5, emissive: hex("#ee7361") },
  amber: { color: hex("#eab379"), metal: 0.3, rough: 0.5 },
};
export class Mesh {
  parts = new Map<string, Part>();
  /** The joint that owns vertices added next. */
  joint = 0;
  part(material: string): Part {
    let part = this.parts.get(material);
    if (part === undefined) this.parts.set(material, (part = { positions: [], normals: [], indices: [], joints: [] }));
    return part;
  }
  box(material: string, center: V3, size: V3, bevel = 0): this {
    const [cx, cy, cz] = center, [sx, sy, sz] = size;
    const p = this.part(material), first = p.positions.length / 3;
    const h: V3 = [sx / 2, sy / 2, sz / 2];
    const faces: Array<[V3, V3, V3]> = [
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
      [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
      [[0, 0, 1], [0, 1, 0], [-1, 0, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
    ];
    for (const [n, u, v] of faces) {
      const base = p.positions.length / 3;
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const inset = bevel > 0 && n[1] === 0 ? 0 : 0;
        p.positions.push(
          cx + (n[0] * h[0] + a * u[0] * h[0] + b * v[0] * h[0]) * (1 - inset),
          cy + n[1] * h[1] + a * u[1] * h[1] + b * v[1] * h[1],
          cz + n[2] * h[2] + a * u[2] * h[2] + b * v[2] * h[2],
        );
        p.normals.push(...n);
      }
      p.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    this.tag(p, first);
    return this;
  }
  private tag(p: Part, first: number): void {
    while (p.joints.length < p.positions.length / 3) p.joints.push(this.joint);
    void first;
  }
  /** A cylinder along `axis` (0 x, 1 y, 2 z) centred on `center`. */
  cylinder(material: string, center: V3, radius: number, length: number, axis: 0 | 1 | 2, segments = 12): this {
    const p = this.part(material), first = p.positions.length / 3;
    const at = (a: number, r: number, along: number): { pos: V3; nrm: V3 } => {
      const c = Math.cos(a), s = Math.sin(a);
      const pos: V3 = [0, 0, 0], nrm: V3 = [0, 0, 0];
      const radial: [number, number] = axis === 1 ? [0, 2] : axis === 0 ? [1, 2] : [0, 1];
      const alongIndex = axis;
      pos[alongIndex] = along;
      pos[radial[0]] = r * c;
      pos[radial[1]] = r * s;
      nrm[radial[0]] = c;
      nrm[radial[1]] = s;
      return { pos: [pos[0] + center[0], pos[1] + center[1], pos[2] + center[2]], nrm };
    };
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2, a1 = ((i + 1) / segments) * Math.PI * 2;
      const base = p.positions.length / 3;
      for (const [a, along] of [[a0, -length / 2], [a1, -length / 2], [a1, length / 2], [a0, length / 2]] as const) {
        const { pos, nrm } = at(a, radius, along);
        p.positions.push(...pos);
        p.normals.push(...nrm);
      }
      p.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    for (const sign of [-1, 1]) {
      const base = p.positions.length / 3;
      const cap: V3 = [...center];
      cap[axis] += (sign * length) / 2;
      const normal: V3 = [0, 0, 0];
      normal[axis] = sign;
      p.positions.push(...cap);
      p.normals.push(...normal);
      for (let i = 0; i <= segments; i++) {
        const { pos } = at((i / segments) * Math.PI * 2, radius, (sign * length) / 2);
        p.positions.push(...pos);
        p.normals.push(...normal);
      }
      for (let i = 0; i < segments; i++) p.indices.push(...(sign > 0 ? [base, base + 1 + i, base + 2 + i] : [base, base + 2 + i, base + 1 + i]));
    }
    this.tag(p, first);
    return this;
  }
}

