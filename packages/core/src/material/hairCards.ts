import type { MaterialDiagnostic } from "./materialAsset";

/** Tangents follow card width (UV U); strand length follows UV V. Angles are radians. */
export const HAIR_CARD_STRAND_ROTATION = Math.PI / 2;

/** An authored centreline, in model-local metres, with root-to-tip points. */
export interface HairCardGuide {
  id: string;
  points: readonly (readonly [number, number, number])[];
  width: number;
  tipWidth?: number;
  /** Desired front-facing normal; must not be parallel to the strand direction. */
  facing: readonly [number, number, number];
  /** Atlas rectangle [uMin,vMin,uMax,vMax]; U is width and V is root to tip. */
  uvRect?: readonly [number, number, number, number];
}

/** Serializable geometry authoring, independent of materials, grooming physics and collisions. */
export interface HairCardAuthoring {
  guides: readonly HairCardGuide[];
  subdivisionsPerSegment?: number;
  /** Allocation ceiling for offline/editor generation; default 65,536 vertices. */
  maxVertices?: number;
}

/** Renderer-neutral indexed ribbons with an explicit tangent frame and guide ranges. */
export interface HairCardMesh {
  positions: number[];
  normals: number[];
  tangents: number[];
  uvs: number[];
  indices: number[];
  bounds: { min: [number, number, number]; max: [number, number, number] };
  guides: { id: string; vertexStart: number; vertexCount: number; indexStart: number; indexCount: number }[];
}

type Vec = readonly [number, number, number];
function vec(value: unknown): value is Vec { return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number" && Number.isFinite(item)); }
function subtract(a: Vec, b: Vec): [number, number, number] { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a: Vec, b: Vec): [number, number, number] { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function length(v: Vec): number { return Math.hypot(...v); }
function normalized(v: Vec): [number, number, number] { const magnitude = length(v); return [v[0] / magnitude, v[1] / magnitude, v[2] / magnitude]; }

/**
 * Validate finite guides, tangent frames and bounded generation; crossing/collision is not solved.
 * @capability hair-card-geometry validate authored ribbon guides and their vertex allocation ceiling
 */
export function validateHairCardAuthoring(value: unknown): MaterialDiagnostic[] {
  const diagnostics: MaterialDiagnostic[] = [];
  const error = (path: string, message: string) => diagnostics.push({ severity: "error", code: "invalid-hair-guide", path, message });
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [{ severity: "error", code: "invalid-hair-guide", path: "", message: "Expected hair card authoring data." }];
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) if (!["guides", "subdivisionsPerSegment", "maxVertices"].includes(key)) error(key, "Unsupported hair geometry field.");
  const subdivisions = input.subdivisionsPerSegment ?? 1;
  const maxVertices = input.maxVertices ?? 65_536;
  if (typeof subdivisions !== "number" || !Number.isInteger(subdivisions) || subdivisions < 1 || subdivisions > 256) error("subdivisionsPerSegment", "Expected an integer from 1 to 256.");
  if (typeof maxVertices !== "number" || !Number.isInteger(maxVertices) || maxVertices < 4 || maxVertices > 1_000_000) error("maxVertices", "Expected a vertex ceiling from 4 to 1,000,000.");
  if (!Array.isArray(input.guides) || input.guides.length === 0 || input.guides.length > 10_000) { error("guides", "Expected 1 to 10,000 authored guides."); return diagnostics; }
  const ids = new Set<string>();
  let vertexCount = 0;
  for (let index = 0; index < input.guides.length; index++) {
    const guide = input.guides[index];
    const path = `guides.${index}`;
    if (typeof guide !== "object" || guide === null || Array.isArray(guide)) { error(path, "Expected a guide object."); continue; }
    for (const key of Object.keys(guide)) if (!["id", "points", "width", "tipWidth", "facing", "uvRect"].includes(key)) error(`${path}.${key}`, "Unsupported guide field.");
    if (typeof guide.id !== "string" || guide.id.trim().length === 0 || ids.has(guide.id)) error(`${path}.id`, "Expected a unique stable guide ID.");
    else ids.add(guide.id);
    if (typeof guide.width !== "number" || !Number.isFinite(guide.width) || guide.width <= 0) error(`${path}.width`, "Expected a positive width in metres.");
    if (guide.tipWidth !== undefined && (typeof guide.tipWidth !== "number" || !Number.isFinite(guide.tipWidth) || guide.tipWidth < 0)) error(`${path}.tipWidth`, "Expected a nonnegative tip width in metres.");
    const facingValid = vec(guide.facing) && length(guide.facing) > 1e-8;
    if (!facingValid) error(`${path}.facing`, "Expected a finite nonzero facing vector.");
    if (!Array.isArray(guide.points) || guide.points.length < 2 || guide.points.length > 10_000) { error(`${path}.points`, "Expected 2 to 10,000 finite model-local points."); continue; }
    vertexCount += 2 * ((guide.points.length - 1) * (typeof subdivisions === "number" ? subdivisions : 1) + 1);
    const ceiling = typeof maxVertices === "number" && Number.isFinite(maxVertices) ? Math.min(maxVertices, 1_000_000) : 65_536;
    if (vertexCount > ceiling) { error("maxVertices", `Guides require at least ${vertexCount} vertices, above the ${ceiling} ceiling.`); return diagnostics; }
    if (!guide.points.every(vec)) { error(`${path}.points`, "Expected finite model-local points."); continue; }
    for (let point = 1; point < guide.points.length; point++) {
      const direction = subtract(guide.points[point], guide.points[point - 1]);
      if (length(direction) <= 1e-8) error(`${path}.points.${point}`, "Adjacent guide points must be distinct.");
      else if (facingValid && length(cross(normalized(direction), normalized(guide.facing))) <= 1e-6) error(`${path}.facing`, "Facing is parallel to a guide segment; choose a different card orientation.");
      if (point < guide.points.length - 1 && length(subtract(guide.points[point + 1], guide.points[point - 1])) <= 1e-8) error(`${path}.points.${point}`, "A reversing guide has no stable tangent at its bend.");
    }
    if (guide.uvRect !== undefined && (!Array.isArray(guide.uvRect) || guide.uvRect.length !== 4 || !guide.uvRect.every((item: unknown) => typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= 1) || guide.uvRect[0] >= guide.uvRect[2] || guide.uvRect[1] >= guide.uvRect[3])) error(`${path}.uvRect`, "Expected an ordered atlas rectangle within 0 to 1.");
  }
  if (typeof maxVertices === "number" && vertexCount > maxVertices) error("maxVertices", `Guides require ${vertexCount} vertices, above the ${maxVertices} ceiling.`);
  return diagnostics;
}

/** Build deterministic model-local ribbon geometry; guides remain separately editable source data. */
export function buildHairCards(input: HairCardAuthoring): HairCardMesh {
  const errors = validateHairCardAuthoring(input);
  if (errors.length > 0) throw new TypeError(errors.map((item) => `${item.path}: ${item.message}`).join("; "));
  const mesh: HairCardMesh = { positions: [], normals: [], tangents: [], uvs: [], indices: [], bounds: { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }, guides: [] };
  const subdivisions = input.subdivisionsPerSegment ?? 1;
  for (const guide of input.guides) {
    const vertexStart = mesh.positions.length / 3;
    const indexStart = mesh.indices.length;
    const samples: [number, number, number][] = [[...guide.points[0]]];
    for (let segment = 1; segment < guide.points.length; segment++) {
      const from = guide.points[segment - 1], to = guide.points[segment];
      for (let step = 1; step <= subdivisions; step++) {
        const t = step / subdivisions;
        samples.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]);
      }
    }
    const distances = [0];
    for (let index = 1; index < samples.length; index++) distances.push(distances[index - 1] + length(subtract(samples[index], samples[index - 1])));
    const totalLength = distances[distances.length - 1];
    const atlas = guide.uvRect ?? [0, 0, 1, 1];
    for (let index = 0; index < samples.length; index++) {
      const tangent = normalized(subtract(samples[Math.min(index + 1, samples.length - 1)], samples[Math.max(index - 1, 0)]));
      const widthDirection = cross(tangent, normalized(guide.facing));
      if (length(widthDirection) <= 1e-6 || !widthDirection.every(Number.isFinite)) throw new TypeError(`Guide ${guide.id} has an unstable tangent frame at sample ${index}; change its bend or facing.`);
      const across = normalized(widthDirection);
      const normal = normalized(cross(across, tangent));
      const t = distances[index] / totalLength;
      const halfWidth = (guide.width + ((guide.tipWidth ?? guide.width * 0.1) - guide.width) * t) / 2;
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? -1 : 1;
        const position: [number, number, number] = [samples[index][0] + sign * across[0] * halfWidth, samples[index][1] + sign * across[1] * halfWidth, samples[index][2] + sign * across[2] * halfWidth];
        mesh.positions.push(...position); mesh.normals.push(...normal); mesh.tangents.push(...across, 1);
        mesh.uvs.push(side === 0 ? atlas[0] : atlas[2], atlas[1] + (atlas[3] - atlas[1]) * t);
        for (let axis = 0; axis < 3; axis++) { mesh.bounds.min[axis] = Math.min(mesh.bounds.min[axis], position[axis]); mesh.bounds.max[axis] = Math.max(mesh.bounds.max[axis], position[axis]); }
      }
      if (index < samples.length - 1) { const left = vertexStart + index * 2; mesh.indices.push(left, left + 1, left + 2, left + 1, left + 3, left + 2); }
    }
    mesh.guides.push({ id: guide.id, vertexStart, vertexCount: samples.length * 2, indexStart, indexCount: mesh.indices.length - indexStart });
  }
  return mesh;
}
