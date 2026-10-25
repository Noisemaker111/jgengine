// Builds far-detail ("level 2") meshes Harbor Heat draws past 60 m by decimating a source GLB.
// Reads the source GLBs and writes tracked far GLBs, so the art can be regenerated:
//
//   bun run provision harbor-heat && node scripts/build-far-meshes.mjs
//
// Two strategies, chosen per primitive by its own topology - no hand editing, no third-party
// simplifier, same bytes on every run:
//   * closed solids (trunk segments, coconuts) get quadric-error edge collapse, which thins the
//     trunk's rings while the crown keeps every frond vertex (a frond is an open sheet);
//   * open sheets (the planter's 450 leaf cards and its flowers) get island thinning, because
//     collapsing a two-triangle leaf card just deletes the leaf, while dropping a spread of whole
//     cards keeps the bush's shape at the size it is on screen past 60 m.
// Every vertex on the model's bounding box is locked, so origin, footprint, pivot and overall
// height survive: the engine normalizes `targetHeight` from that box, so a drift there would
// rescale the instance and move it.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * A source GLB's textures are fetched relative to the URL the GLB is served from. The far GLBs are
 * served from `src/art/` (Vite's `?url` copy, hashed into `assets/` in a build), so a relative
 * `Flowers.png` would be requested from `/art/` or `/assets/` and 404 - the model resolves, its
 * textures do not, and the far level draws untextured. Each copied image is re-pointed at the URL
 * the pack itself is served from, and a texture the pack does not ship fails the build here rather
 * than at 60 m in a player's frame.
 */
function resolveImageUris(json, source) {
  const publicRoot = join(gameRoot, "public");
  const sourceDir = dirname(source);
  for (const image of json.images ?? []) {
    if (image.uri === undefined || image.uri.startsWith("data:")) continue;
    const onDisk = resolve(sourceDir, image.uri);
    if (!onDisk.startsWith(publicRoot) || !existsSync(onDisk)) {
      throw new Error(`${source}: texture "${image.uri}" is not a file under public/, so the far mesh cannot serve it`);
    }
    image.uri = `/${relative(publicRoot, onDisk).replaceAll("\\", "/")}`;
  }
}

/**
 * Triangle ceilings: about 45% of each source mesh. Empty today: the Mainsail palm's far level is
 * authored alongside its near level by `scripts/author-harbor.mjs` (same crown, fewer leaflets and
 * rings), so it no longer comes from here. Add an entry to decimate a model that has no authored
 * far level: { name, src: "src/art/x.glb", out: "src/art/x-far.glb", triangles }.
 */
const MODELS = [];

const COMPONENT = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const TYPE_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const FLOAT = 5126;

function parseGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a GLB`);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
  const binOffset = 20 + jsonLength;
  const binLength = buf.readUInt32LE(binOffset);
  return { json, bin: buf.subarray(binOffset + 8, binOffset + 8 + binLength) };
}

function accessorValues(json, bin, index) {
  const accessor = json.accessors[index];
  const view = json.bufferViews[accessor.bufferView];
  const [Ctor, bytes] = COMPONENT[accessor.componentType];
  const width = TYPE_SIZE[accessor.type];
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? 0;
  const out = new Array(accessor.count * width);
  if (stride === 0 || stride === width * bytes) {
    const source = new Ctor(bin.buffer, bin.byteOffset + base, accessor.count * width);
    for (let i = 0; i < out.length; i++) out[i] = source[i];
  } else {
    for (let v = 0; v < accessor.count; v++) {
      for (let c = 0; c < width; c++) {
        out[v * width + c] = new Ctor(bin.buffer, bin.byteOffset + base + v * stride + c * bytes, 1)[0];
      }
    }
  }
  return out;
}

function writeGlb(path, json, chunks) {
  // Rebuild the binary chunk from whatever bufferViews the final accessors and images point at.
  const keep = new Set();
  for (const accessor of json.accessors) if (accessor.bufferView !== undefined) keep.add(accessor.bufferView);
  for (const image of json.images ?? []) if (image.bufferView !== undefined) keep.add(image.bufferView);
  const parts = [];
  let offset = 0;
  const moved = new Map();
  for (const [index] of chunks) keep.add(index);
  for (const index of [...keep].sort((a, b) => a - b)) {
    const bytes = chunks.get(index) ?? null;
    const view = json.bufferViews[index];
    const data = bytes ?? null;
    if (data === null) continue;
    while (offset % 4 !== 0) {
      parts.push(Buffer.alloc(1));
      offset += 1;
    }
    moved.set(index, offset);
    parts.push(data);
    view.byteOffset = offset;
    view.byteLength = data.length;
    delete view.byteStride;
    offset += data.length;
  }
  const bin = Buffer.concat(parts);
  json.buffers = [{ byteLength: bin.length }];
  const jsonBytes = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const binPad = (4 - (bin.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);
  const binChunk = Buffer.concat([bin, Buffer.alloc(binPad)]);
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(out, 20);
  const binHeader = 20 + jsonChunk.length;
  out.writeUInt32LE(binChunk.length, binHeader);
  out.writeUInt32LE(0x004e4942, binHeader + 4);
  binChunk.copy(out, binHeader + 8);
  writeFileSync(path, out);
  return out.length;
}

/** Welds vertices that share a position and UV, so seams stay seams and a cylinder stays closed. */
function weld({ positions, uvs, triangles }) {
  const keyOf = (v) => {
    const p = `${positions[v * 3].toFixed(5)},${positions[v * 3 + 1].toFixed(5)},${positions[v * 3 + 2].toFixed(5)}`;
    return uvs === null ? p : `${p}|${uvs[v * 2].toFixed(4)},${uvs[v * 2 + 1].toFixed(4)}`;
  };
  const ids = new Map();
  const representative = [];
  const remap = new Int32Array(positions.length / 3);
  for (let v = 0; v < remap.length; v++) {
    const key = keyOf(v);
    let id = ids.get(key);
    if (id === undefined) {
      id = representative.length;
      ids.set(key, id);
      representative.push(v);
    }
    remap[v] = id;
  }
  const tris = [];
  for (let t = 0; t < triangles.length; t += 3) {
    const a = remap[triangles[t]], b = remap[triangles[t + 1]], c = remap[triangles[t + 2]];
    if (a === b || b === c || a === c) continue;
    tris.push(a, b, c);
  }
  const weldedPositions = new Float32Array(representative.length * 3);
  for (let i = 0; i < representative.length; i++) {
    const v = representative[i];
    weldedPositions[i * 3] = positions[v * 3];
    weldedPositions[i * 3 + 1] = positions[v * 3 + 1];
    weldedPositions[i * 3 + 2] = positions[v * 3 + 2];
  }
  return { positions: weldedPositions, triangles: tris, representative };
}

/** Islands of one primitive, as triangle index lists. */
function islands(triangles) {
  const parent = new Map();
  const find = (x) => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(x) !== root) {
      const next = parent.get(x);
      parent.set(x, root);
      x = next;
    }
    return root;
  };
  for (let t = 0; t < triangles.length; t += 3) {
    for (const v of [triangles[t], triangles[t + 1], triangles[t + 2]]) if (!parent.has(v)) parent.set(v, v);
    const [a, b, c] = [triangles[t], triangles[t + 1], triangles[t + 2]];
    parent.set(find(a), find(b));
    parent.set(find(b), find(c));
  }
  const groups = new Map();
  for (let t = 0; t < triangles.length; t += 3) {
    const root = find(triangles[t]);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(t);
  }
  return [...groups.values()];
}

/** Deterministic, spatially spread key: leaves that survive are not all from one side of the bush. */
function islandSortKey(positions, triangles, triIndices) {
  let x = 0, y = 0, z = 0;
  for (const t of triIndices) {
    for (let k = 0; k < 3; k++) {
      const v = triangles[t * 3 + k];
      x += positions[v * 3];
      y += positions[v * 3 + 1];
      z += positions[v * 3 + 2];
    }
  }
  const n = triIndices.length * 3;
  // Quantize to a coarse lattice, then hash: evenly spread survivors without a random seed.
  const h = (v) => Math.round(v * 8) | 0;
  const mix = (a) => {
    a = (a ^ 0x9e3779b9) | 0;
    a = Math.imul(a ^ (a >>> 16), 0x21f0aaad) | 0;
    a = Math.imul(a ^ (a >>> 15), 0x735a2d97) | 0;
    return (a ^ (a >>> 15)) >>> 0;
  };
  return mix(h(x / n)) ^ mix(h(y / n)) ^ mix(h(z / n));
}

/** Quadric-error edge collapse over the welded mesh; boundary planes are weighted so sheets hold. */
function collapse({ positions, triangles }, targetTriangles, bounds) {
  const count = positions.length / 3;
  const quadrics = Array.from({ length: count }, () => new Float64Array(10));
  const accumulate = (q, a, b, c, weight) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length === 0) return;
    nx /= length; ny /= length; nz /= length;
    const d = -(nx * a[0] + ny * a[1] + nz * a[2]);
    const w = weight * length;
    q[0] += w * nx * nx; q[1] += w * nx * ny; q[2] += w * nx * nz; q[3] += w * nx * d;
    q[4] += w * ny * ny; q[5] += w * ny * nz; q[6] += w * ny * d;
    q[7] += w * nz * nz; q[8] += w * nz * d;
    q[9] += w * d * d;
  };
  const at = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  const edgeUse = new Map();
  const edgeNormal = new Map();
  const edgeKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  for (let t = 0; t < triangles.length; t += 3) {
    const ids = [triangles[t], triangles[t + 1], triangles[t + 2]];
    const [a, b, c] = ids.map(at);
    for (const v of ids) accumulate(quadrics[v], a, b, c, 1);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    const normal = [nx / length, ny / length, nz / length];
    for (const [p, q] of [[ids[0], ids[1]], [ids[1], ids[2]], [ids[2], ids[0]]]) {
      const key = edgeKey(p, q);
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
      edgeNormal.set(key, normal);
    }
  }
  // An open edge is a silhouette edge: a frond blade's outline, a cap rim, a leaf edge. Weighting
  // those planes heavily keeps them from collapsing while interiors still simplify.
  for (const [key, use] of edgeUse) {
    if (use !== 1) continue;
    const [p, q] = key.split("-").map(Number);
    const a = at(p), b = at(q);
    const normal = edgeNormal.get(key);
    const edge = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let mx = edge[1] * normal[2] - edge[2] * normal[1];
    let my = edge[2] * normal[0] - edge[0] * normal[2];
    let mz = edge[0] * normal[1] - edge[1] * normal[0];
    const length = Math.hypot(mx, my, mz);
    if (length === 0) continue;
    mx /= length; my /= length; mz /= length;
    const d = -(mx * a[0] + my * a[1] + mz * a[2]);
    const gap = Math.hypot(edge[0], edge[1], edge[2]);
    const w = 40 * gap;
    for (const [v, point] of [[p, a], [q, b]]) {
      const q4 = quadrics[v];
      const q0 = q4[0], q1 = q4[1], q2 = q4[2], q3 = q4[3], q4v = q4[4], q5 = q4[5], q6 = q4[6], q7 = q4[7], q8 = q4[8], q9 = q4[9];
      void point;
      q4[0] = q0 + w * mx * mx; q4[1] = q1 + w * mx * my; q4[2] = q2 + w * mx * mz; q4[3] = q3 + w * mx * d;
      q4[4] = q4v + w * my * my; q4[5] = q5 + w * my * mz; q4[6] = q6 + w * my * d;
      q4[7] = q7 + w * mz * mz; q4[8] = q8 + w * mz * d;
      q4[9] = q9 + w * d * d;
    }
  }

  const locked = new Set();
  // Lock only vertices that sit on the model's own bounding box: those carry the origin, the
  // footprint and the height `targetHeight` is measured from. A vertex at an intermediate ring
  // (a trunk segment at mid-height) is exactly what a far level should thin.
  const tolerance = (bounds.max[0] - bounds.min[0] + bounds.max[1] - bounds.min[1] + bounds.max[2] - bounds.min[2]) * 1e-4;
  for (let v = 0; v < count; v++) {
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[v * 3 + axis];
      if (Math.abs(value - bounds.min[axis]) <= tolerance || Math.abs(value - bounds.max[axis]) <= tolerance) {
        locked.add(v);
        break;
      }
    }
  }

  const deleted = new Uint8Array(count);
  const live = triangles.slice();
  const vertexTris = () => {
    const map = new Map();
    for (let t = 0; t < live.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const v = live[t + k];
        if (!map.has(v)) map.set(v, []);
        map.get(v).push(t / 3);
      }
    }
    return map;
  };
  const error = (q, p) => {
    const [x, y, z] = p;
    return (
      q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x +
      q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y +
      q[7] * z * z + 2 * q[8] * z + q[9]
    );
  };

  let tris = live.length / 3;
  let guard = 0;
  while (tris > targetTriangles && guard++ < count * 4) {
    const adjacency = vertexTris();
    let best = null;
    for (const [u, ts] of adjacency) {
      if (deleted[u]) continue;
      for (const t of ts) {
        for (let k = 0; k < 3; k++) {
          const v = live[t * 3 + k];
          if (v === u || v < u) continue;
          if (deleted[v]) continue;
          const q = new Float64Array(10);
          for (let i = 0; i < 10; i++) q[i] = quadrics[u][i] + quadrics[v][i];
          const pu = at(u), pv = at(v);
          const mid = [(pu[0] + pv[0]) / 2, (pu[1] + pv[1]) / 2, (pu[2] + pv[2]) / 2];
          const candidates = locked.has(u) || locked.has(v) ? [] : [pu, pv, mid];
          if (candidates.length === 0) continue;
          let bestCost = Infinity, bestPoint = null;
          for (const point of candidates) {
            const cost = error(q, point);
            if (cost < bestCost) { bestCost = cost; bestPoint = point; }
          }
          if (bestCost < (best?.cost ?? Infinity)) best = { u, v, cost: bestCost, point: bestPoint, quadric: q };
        }
      }
    }
    if (best === null) break;
    // Collapse v into u at the chosen point, then rewrite the triangles that used v.
    deleted[best.v] = 1;
    positions[best.u * 3] = best.point[0];
    positions[best.u * 3 + 1] = best.point[1];
    positions[best.u * 3 + 2] = best.point[2];
    quadrics[best.u] = best.quadric;
    let removed = 0;
    for (let t = 0; t < live.length; ) {
      let hit = false;
      for (let k = 0; k < 3; k++) if (live[t + k] === best.v) hit = true;
      if (!hit) { t += 3; continue; }
      const tri = [live[t], live[t + 1], live[t + 2]].map((index) => (index === best.v ? best.u : index));
      if (new Set(tri).size < 3) {
        live.splice(t, 3);
        removed += 1;
        continue;
      }
      live[t] = tri[0]; live[t + 1] = tri[1]; live[t + 2] = tri[2];
      t += 3;
    }
    if (removed === 0) {
      // The vertex folded onto its neighbour without dropping a face: undo the deletion marker.
      deleted[best.v] = 0;
      break;
    }
    tris -= removed;
  }
  return compact({ positions, triangles: live });
}

function compact({ positions, triangles }) {
  const used = new Map();
  const nextPositions = [];
  const nextTriangles = [];
  for (const index of triangles) {
    let id = used.get(index);
    if (id === undefined) {
      id = used.size;
      used.set(index, id);
      nextPositions.push(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);
    }
    nextTriangles.push(id);
  }
  return { positions: Float32Array.from(nextPositions), triangles: nextTriangles, sources: [...used.keys()] };
}

/**
 * How much of a primitive's surface is open edge, measured on positions alone so a cylinder's cap
 * rim (one welded vertex, two UV copies) is not mistaken for an open sheet.
 */
function openEdgeRatio({ positions, triangles }) {
  const welded = weld({ positions, uvs: null, triangles });
  const edges = new Map();
  for (let t = 0; t < welded.triangles.length; t += 3) {
    const [a, b, c] = [welded.triangles[t], welded.triangles[t + 1], welded.triangles[t + 2]];
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const key = p < q ? `${p}-${q}` : `${q}-${p}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const use of edges.values()) if (use === 1) open += 1;
  return open / Math.max(1, edges.size);
}

/** How a primitive loses triangles: closed solids collapse, loose cards thin, open sheets stay. */
function meshMode({ positions, triangles }) {
  const open = openEdgeRatio({ positions, triangles }) > 0.3;
  const groups = islands(triangles);
  const average = groups.reduce((sum, group) => sum + group.length, 0) / Math.max(1, groups.length);
  if (open && average <= 16) return "thin";
  if (open) return "keep";
  return "collapse";
}

/** Keeps a spread of whole islands until the triangle budget is met. */
function thinIslands(welded, targetTriangles) {
  const groups = islands(welded.triangles);
  const ranked = groups
    .map((group) => ({ group, key: islandSortKey(welded.positions, welded.triangles, group) }))
    .sort((a, b) => a.key - b.key);
  const kept = [];
  let total = 0;
  for (const { group } of ranked) {
    if (total + group.length > targetTriangles && kept.length > 0) continue;
    kept.push(...group);
    total += group.length;
  }
  const triangles = kept.flatMap((t) => [welded.triangles[t * 3], welded.triangles[t * 3 + 1], welded.triangles[t * 3 + 2]]);
  return {
    ...compact({ positions: welded.positions, triangles }),
    strategy: `islands ${total / 3}/${groups.length} kept`,
  };
}

/** Triangle count island thinning can actually reach, for budget planning before the real pass. */
function islandFloor(welded, targetTriangles) {
  const groups = islands(welded.triangles);
  let total = 0;
  for (const group of groups) {
    if (total / 3 + group.length > targetTriangles && total > 0) continue;
    total += group.length;
  }
  return total / 3;
}

function decimateSolid(welded, targetTriangles, bounds) {
  const source = welded.representative;
  const result = collapse({ positions: welded.positions.slice(), triangles: welded.triangles.slice() }, targetTriangles, bounds);
  return { ...result, sources: result.sources.map((id) => source[id]), strategy: "quadric collapse" };
}

function build(model) {
  const source = join(gameRoot, model.src);
  const { json, bin } = parseGlb(source);
  resolveImageUris(json, source);
  const meshes = json.meshes ?? [];
  const primitiveTriangles = (primitive) => {
    const count = primitive.indices !== undefined ? json.accessors[primitive.indices].count : json.accessors[primitive.attributes.POSITION].count;
    return count / 3;
  };
  const total = meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((s, p) => s + primitiveTriangles(p), 0), 0);
  const chunks = new Map();
  const materialNames = (json.materials ?? []).map((m) => m.name ?? "-");
  let after = 0;
  console.log(`${model.name}: ${total} triangles -> ceiling ${model.triangles}`);

  // Pass 1: read and classify, so piece-cloud primitives claim whole islands before solids split the rest.
  const primitives = [];
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const mesh of meshes) {
    for (const primitive of mesh.primitives) {
      const positions = Float32Array.from(accessorValues(json, bin, primitive.attributes.POSITION));
      for (let v = 0; v < positions.length; v += 3) {
        for (let axis = 0; axis < 3; axis++) {
          bounds.min[axis] = Math.min(bounds.min[axis], positions[v + axis]);
          bounds.max[axis] = Math.max(bounds.max[axis], positions[v + axis]);
        }
      }
      const uvs = primitive.attributes.TEXCOORD_0 !== undefined
        ? Float32Array.from(accessorValues(json, bin, primitive.attributes.TEXCOORD_0))
        : null;
      const indices = primitive.indices !== undefined
        ? Array.from(accessorValues(json, bin, primitive.indices))
        : Array.from({ length: positions.length / 3 }, (_, i) => i);
      const welded = weld({ positions, uvs, triangles: indices });
      const share = Math.max(1, Math.round((model.triangles * indices.length / 3) / total));
      primitives.push({ primitive, welded, before: indices.length / 3, share, mode: meshMode({ positions, triangles: indices }) });
    }
  }
  // Sheets keep every vertex and loose cards keep whole islands, so only what is left goes to the
  // collapse pass; a sheet's floor is its own count because its outline is the silhouette.
  const floor = primitives
    .filter((p) => p.mode !== "collapse")
    .reduce((sum, p) => sum + (p.mode === "keep" ? p.before : islandFloor(p.welded, p.share)), 0);
  const solidBudget = Math.max(primitives.filter((p) => p.mode === "collapse").length, model.triangles - floor);
  const solidTotal = primitives.filter((p) => p.mode === "collapse").reduce((sum, p) => sum + p.before, 0);

  for (const entry of primitives) {
    const { primitive, welded, before, share, mode } = entry;
    const target = mode === "collapse" ? Math.max(1, Math.round((solidBudget * before) / Math.max(1, solidTotal))) : share;
    const result = mode === "collapse" ? decimateSolid(welded, target, bounds) : mode === "thin" ? thinIslands(welded, target) : { positions: welded.positions, triangles: welded.triangles, sources: welded.representative, strategy: "kept whole (open sheet)" };
    after += result.triangles.length / 3;
    if (before > 24 || result.triangles.length / 3 !== before) {
      console.log(`  primitive ${before} -> ${result.triangles.length / 3} tris (${result.strategy})`);
    }

      // Positions and normals are rebuilt; every other attribute keeps its representative vertex.
      const normals = new Float32Array(result.positions.length);
      for (let t = 0; t < result.triangles.length; t += 3) {
        const [a, b, c] = [result.triangles[t], result.triangles[t + 1], result.triangles[t + 2]];
        const ux = result.positions[b * 3] - result.positions[a * 3];
        const uy = result.positions[b * 3 + 1] - result.positions[a * 3 + 1];
        const uz = result.positions[b * 3 + 2] - result.positions[a * 3 + 2];
        const vx = result.positions[c * 3] - result.positions[a * 3];
        const vy = result.positions[c * 3 + 1] - result.positions[a * 3 + 1];
        const vz = result.positions[c * 3 + 2] - result.positions[a * 3 + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        for (const v of [a, b, c]) {
          normals[v * 3] += nx; normals[v * 3 + 1] += ny; normals[v * 3 + 2] += nz;
        }
      }
      for (let v = 0; v < normals.length; v += 3) {
        const length = Math.hypot(normals[v], normals[v + 1], normals[v + 2]) || 1;
        normals[v] /= length; normals[v + 1] /= length; normals[v + 2] /= length;
      }

      const pushAccessor = (values, componentType, type, target, minMax) => {
        const [Ctor, bytes] = COMPONENT[componentType];
        const array = values instanceof Ctor ? values : new Ctor(values.map((n) => (componentType === FLOAT ? n : Math.round(n))));
        const bytesNeeded = array.length * bytes;
        const viewIndex = json.bufferViews.push({ buffer: 0, byteLength: bytesNeeded, target }) - 1;
        chunks.set(viewIndex, Buffer.from(array.buffer, array.byteOffset, array.byteLength));
        void bytesNeeded;
        const accessor = { bufferView: viewIndex, componentType, count: array.length / TYPE_SIZE[type], type };
        if (minMax !== undefined) {
          accessor.min = minMax.min;
          accessor.max = minMax.max;
        }
        return json.accessors.push(accessor) - 1;
      };

      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let v = 0; v < result.positions.length; v += 3) {
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis], result.positions[v + axis]);
          max[axis] = Math.max(max[axis], result.positions[v + axis]);
        }
      }
      primitive.attributes.POSITION = pushAccessor(result.positions, FLOAT, "VEC3", 34962, { min, max });
      primitive.attributes.NORMAL = pushAccessor(normals, FLOAT, "VEC3", 34962);
      for (const [name, attributeIndex] of Object.entries(primitive.attributes)) {
        if (name === "POSITION" || name === "NORMAL") continue;
        const accessor = json.accessors[attributeIndex];
        const values = accessorValues(json, bin, attributeIndex);
        const width = TYPE_SIZE[accessor.type];
        const picked = [];
        for (const sourceId of result.sources) {
          for (let c = 0; c < width; c++) picked.push(values[sourceId * width + c]);
        }
        primitive.attributes[name] = pushAccessor(picked, accessor.componentType, accessor.type, 34962);
      }
      const indexType = result.positions.length / 3 > 65535 ? 5125 : 5123;
      primitive.indices = pushAccessor(result.triangles, indexType, "SCALAR", 34963);
      primitive.mode = primitive.mode ?? 4;

      // Anything else that referenced the old primitive data is gone with the old accessors.
  }

  // Copy the bufferViews the surviving accessors and images still point at.
  for (const [index, view] of json.bufferViews.entries()) {
    if (chunks.has(index)) continue;
    const bytes = Buffer.from(bin.buffer, bin.byteOffset + (view.byteOffset ?? 0), view.byteLength);
    chunks.set(index, bytes);
  }
  // Drop bufferViews that no accessor or image references any more.
  const referenced = new Set();
  for (const accessor of json.accessors) if (accessor.bufferView !== undefined) referenced.add(accessor.bufferView);
  for (const image of json.images ?? []) if (image.bufferView !== undefined) referenced.add(image.bufferView);
  for (const index of chunks.keys()) if (!referenced.has(index)) chunks.delete(index);

  const bytes = writeGlb(join(gameRoot, model.out), json, chunks);
  console.log(`${model.name}: wrote ${model.out} - ${after} triangles, ${(bytes / 1024).toFixed(0)} KiB, materials ${materialNames.length}`);
}

for (const model of MODELS) build(model);
