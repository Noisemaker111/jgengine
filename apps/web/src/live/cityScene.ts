/**
 * GeneratedCity → three.js. Everything rendered here is read from the real
 * `@jgengine/core` city generator output: street ribbons from the network
 * polylines, buildings extruded on the derived frontage lots, traffic flowing
 * along the street chains, accent lights on the busiest junctions. Nothing is
 * hand-placed — same seed, same city, here and in a shipped game.
 */
import * as THREE from "three";

import type { GeneratedCity } from "@jgengine/core/world/cityGenerator";
import type { Street, StreetLevel } from "@jgengine/core/world/streetGenerator";
import { seededStreams } from "@jgengine/core/random/rng";

export interface CityPalette {
  /** Building diffuse base + jitter. */
  building: number;
  /** Street ribbon color per level. */
  streets: Record<StreetLevel, number>;
  /** Additive centerline glow on boulevards/avenues. */
  glow: number;
  /** Lit-window emissive tints. */
  windowWarm: number;
  windowCool: number;
  /** Traffic head/tail light streams. */
  trafficA: number;
  trafficB: number;
  /** Junction accent point lights. */
  lightA: number;
  lightB: number;
  fogDensity: number;
}

export interface CityStats {
  streets: number;
  lots: number;
  loops: number;
  junctions: number;
}

export interface CityModel {
  group: THREE.Group;
  stats: CityStats;
  radius: number;
  /** True once streets have swept in and every building has risen. */
  settled(): boolean;
  update(dt: number, elapsed: number): void;
  dispose(): void;
}

const STREET_Y: Record<StreetLevel, number> = { boulevard: 0.1, avenue: 0.085, street: 0.07, lane: 0.055 };
const BUILD_SWEEP_SECONDS = 1.3;
const WINDOW_W = 2.7;
const WINDOW_H = 3.4;
const TEX_CELLS = 8;

/** Street ribbon strip along a polyline; returns per-strip index count for the sweep-in. */
function pushRibbon(
  positions: number[],
  colors: number[],
  indices: number[],
  points: readonly (readonly [number, number])[],
  width: number,
  y: number,
  color: THREE.Color,
): void {
  if (points.length < 2) return;
  const base = positions.length / 3;
  const half = width / 2;
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const px = points[i]![0];
    const pz = points[i]![1];
    positions.push(px - dz * half, y, pz + dx * half, px + dz * half, y, pz - dx * half);
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = base + i * 2;
    // Wound so the face normal points +y (visible from above).
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
}

/** One shared emissive window texture: a grid of lit/dark cells; cell (0,0) stays dark for roofs. */
function windowTexture(seedRng: () => number, warm: number, cool: number): THREE.CanvasTexture {
  const size = 256;
  const cell = size / TEX_CELLS;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  const warmColor = new THREE.Color(warm);
  const coolColor = new THREE.Color(cool);
  for (let row = 0; row < TEX_CELLS; row += 1) {
    for (let col = 0; col < TEX_CELLS; col += 1) {
      if (row === TEX_CELLS - 1 && col === 0) continue; // roof cell (uv origin) stays dark
      const roll = seedRng();
      if (roll > 0.4) continue;
      const tint = roll > 0.32 ? coolColor : warmColor;
      const bright = 0.7 + seedRng() * 0.3;
      ctx.fillStyle = `rgb(${Math.round(tint.r * 255 * bright)},${Math.round(tint.g * 255 * bright)},${Math.round(
        tint.b * 255 * bright,
      )})`;
      const x = col * cell;
      const y = row * cell;
      ctx.fillRect(x + cell * 0.22, y + cell * 0.16, cell * 0.56, cell * 0.68);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface BoxWriter {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  grow: number[];
  indices: number[];
}

/** Windowed box (no bottom face) rotated by ry around its center, with world-scaled window UVs. */
function pushBuildingBox(
  out: BoxWriter,
  cx: number,
  cz: number,
  w: number,
  d: number,
  y0: number,
  y1: number,
  ry: number,
  shade: THREE.Color,
  growDelay: number,
): void {
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  const rotX = (x: number, z: number) => cx + x * cos + z * sin;
  const rotZ = (x: number, z: number) => cz - x * sin + z * cos;
  const h = y1 - y0;
  const hw = w / 2;
  const hd = d / 2;
  const roofU = 0.5 / TEX_CELLS;
  const roofV = 0.5 / TEX_CELLS;

  const face = (
    corners: readonly (readonly [number, number, number])[],
    normal: readonly [number, number],
    uWorld: number,
    vWorld: number,
    roof: boolean,
  ) => {
    const base = out.positions.length / 3;
    const nx = normal[0] * cos + normal[1] * sin;
    const nz = -normal[0] * sin + normal[1] * cos;
    const ny = roof ? 1 : 0;
    const uRepeat = uWorld / WINDOW_W / TEX_CELLS;
    const vRepeat = vWorld / WINDOW_H / TEX_CELLS;
    for (let i = 0; i < 4; i += 1) {
      const [x, y, z] = corners[i]!;
      out.positions.push(rotX(x, z), y, rotZ(x, z));
      out.normals.push(roof ? 0 : nx, ny, roof ? 0 : nz);
      if (roof) out.uvs.push(roofU, roofV);
      else out.uvs.push((i === 1 || i === 2 ? uRepeat : 0) + 0.013, (i >= 2 ? vRepeat : 0) + 0.013);
      out.colors.push(shade.r, shade.g, shade.b);
      out.grow.push(growDelay);
    }
    out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  face([[-hw, y0, hd], [hw, y0, hd], [hw, y1, hd], [-hw, y1, hd]], [0, 1], w, h, false); // front (+z)
  face([[hw, y0, -hd], [-hw, y0, -hd], [-hw, y1, -hd], [hw, y1, -hd]], [0, -1], w, h, false); // back
  face([[hw, y0, hd], [hw, y0, -hd], [hw, y1, -hd], [hw, y1, hd]], [1, 0], d, h, false); // right
  face([[-hw, y0, -hd], [-hw, y0, hd], [-hw, y1, hd], [-hw, y1, -hd]], [-1, 0], d, h, false); // left
  face([[-hw, y1, hd], [hw, y1, hd], [hw, y1, -hd], [-hw, y1, -hd]], [0, 0], 1, 1, true); // roof
}

interface TrafficStream {
  points: readonly (readonly [number, number])[];
  lengths: number[];
  total: number;
  y: number;
}

function streamFrom(street: Street): TrafficStream {
  const lengths: number[] = [0];
  let total = 0;
  for (let i = 1; i < street.points.length; i += 1) {
    total += Math.hypot(
      street.points[i]![0] - street.points[i - 1]![0],
      street.points[i]![1] - street.points[i - 1]![1],
    );
    lengths.push(total);
  }
  return { points: street.points, lengths, total, y: STREET_Y[street.level] + 0.5 };
}

function sampleStream(stream: TrafficStream, distance: number, out: THREE.Vector3): void {
  const d = ((distance % stream.total) + stream.total) % stream.total;
  let i = 1;
  while (i < stream.lengths.length - 1 && stream.lengths[i]! < d) i += 1;
  const t = (d - stream.lengths[i - 1]!) / Math.max(1e-6, stream.lengths[i]! - stream.lengths[i - 1]!);
  const a = stream.points[i - 1]!;
  const b = stream.points[i]!;
  out.set(a[0] + (b[0] - a[0]) * t, stream.y, a[1] + (b[1] - a[1]) * t);
}

export function buildCityModel(
  city: GeneratedCity,
  palette: CityPalette,
  options: { seed: string; instant?: boolean; heightScale?: number },
): CityModel {
  const heightScale = options.heightScale ?? 1;
  const group = new THREE.Group();
  const rng = seededStreams(`${options.seed}:render`);
  const streets = [...city.network.streets].sort(
    (a, b) => Object.keys(STREET_Y).indexOf(a.level) - Object.keys(STREET_Y).indexOf(b.level),
  );

  // --- streets: one merged ribbon geometry, revealed by drawRange sweep ---
  const streetPos: number[] = [];
  const streetCol: number[] = [];
  const streetIdx: number[] = [];
  const levelColors = Object.fromEntries(
    Object.entries(palette.streets).map(([level, hex]) => [level, new THREE.Color(hex)]),
  ) as Record<StreetLevel, THREE.Color>;
  let radius = 40;
  for (const street of streets) {
    pushRibbon(streetPos, streetCol, streetIdx, street.points, street.width, STREET_Y[street.level], levelColors[street.level]);
    for (const [x, z] of street.points) radius = Math.max(radius, Math.hypot(x, z));
  }
  const streetGeo = new THREE.BufferGeometry();
  streetGeo.setAttribute("position", new THREE.Float32BufferAttribute(streetPos, 3));
  streetGeo.setAttribute("color", new THREE.Float32BufferAttribute(streetCol, 3));
  streetGeo.setIndex(streetIdx);
  const streetMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const streetMesh = new THREE.Mesh(streetGeo, streetMat);
  group.add(streetMesh);

  // --- boulevard/avenue centerline glow, additive ---
  const glowPos: number[] = [];
  const glowCol: number[] = [];
  const glowIdx: number[] = [];
  const glowColor = new THREE.Color(palette.glow);
  for (const street of streets) {
    if (street.level !== "boulevard" && street.level !== "avenue") continue;
    pushRibbon(glowPos, glowCol, glowIdx, street.points, street.level === "boulevard" ? 1.1 : 0.7, STREET_Y[street.level] + 0.03, glowColor);
  }
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute("position", new THREE.Float32BufferAttribute(glowPos, 3));
  glowGeo.setAttribute("color", new THREE.Float32BufferAttribute(glowCol, 3));
  glowGeo.setIndex(glowIdx);
  const glowMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  group.add(glowMesh);

  // --- buildings: merged windowed boxes, risen by a staggered grow shader ---
  const frontage = city.network.streets.filter((street) => street.level !== "lane");
  const heights = rng("heights");
  const shades = rng("shades");
  const writer: BoxWriter = { positions: [], normals: [], uvs: [], colors: [], grow: [], indices: [] };
  const baseShade = new THREE.Color(palette.building);
  const shade = new THREE.Color();
  const heightRange: Record<StreetLevel, readonly [number, number]> = {
    boulevard: [18, 58],
    avenue: [10, 30],
    street: [5, 15],
    lane: [4, 9],
  };
  let tallest = 0;
  for (const lot of city.lots) {
    const level = frontage[lot.road]?.level ?? "street";
    const [minH, maxH] = heightRange[level];
    const centerBias = 1 - Math.min(1, Math.hypot(lot.center[0], lot.center[1]) / Math.max(1, radius)) * 0.55;
    const h = (minH + heights() * (maxH - minH)) * centerBias * heightScale + 3;
    tallest = Math.max(tallest, h);
    const dim = 0.82 + shades() * 0.35;
    shade.copy(baseShade).multiplyScalar(dim);
    const delay = (Math.hypot(lot.center[0], lot.center[1]) / Math.max(1, radius)) * 1.5 + heights() * 0.3;
    const w = lot.footprint.w * 0.92;
    const d = lot.footprint.d * 0.92;
    if (h > 26 && heights() < 0.7) {
      // stepped tower: two or three shrinking tiers
      const tiers = h > 42 && heights() < 0.5 ? 3 : 2;
      let y = 0;
      for (let t = 0; t < tiers; t += 1) {
        const frac = t === tiers - 1 ? 1 : 0.45 + heights() * 0.25;
        const top = t === tiers - 1 ? h : y + (h - y) * frac;
        const scale = 1 - t * (0.16 + heights() * 0.12);
        pushBuildingBox(writer, lot.center[0], lot.center[1], w * scale, d * scale, y, top, lot.rotationY, shade, delay + t * 0.12);
        y = top;
      }
    } else {
      pushBuildingBox(writer, lot.center[0], lot.center[1], w, d, 0, h, lot.rotationY, shade, delay);
    }
  }
  const buildingGeo = new THREE.BufferGeometry();
  buildingGeo.setAttribute("position", new THREE.Float32BufferAttribute(writer.positions, 3));
  buildingGeo.setAttribute("normal", new THREE.Float32BufferAttribute(writer.normals, 3));
  buildingGeo.setAttribute("uv", new THREE.Float32BufferAttribute(writer.uvs, 2));
  buildingGeo.setAttribute("color", new THREE.Float32BufferAttribute(writer.colors, 3));
  buildingGeo.setAttribute("aGrow", new THREE.Float32BufferAttribute(writer.grow, 1));
  buildingGeo.setIndex(writer.indices);

  const windows = windowTexture(rng("windows"), palette.windowWarm, palette.windowCool);
  const growUniform = { value: options.instant === true ? 99 : -0.35 };
  const buildingMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.08,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: windows,
    emissiveIntensity: 1.7,
  });
  buildingMat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrow = growUniform;
    shader.vertexShader = `attribute float aGrow;\nuniform float uGrow;\nvarying float vGrown;\n${shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float growT = clamp((uGrow - aGrow) / 0.8, 0.0, 1.0);
      float grown = 1.0 - pow(1.0 - growT, 3.0);
      vGrown = grown;
      transformed.y *= grown;`,
    )}`;
    shader.fragmentShader = `varying float vGrown;\n${shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      totalEmissiveRadiance *= vGrown * vGrown;`,
    )}`;
  };
  const buildingMesh = new THREE.Mesh(buildingGeo, buildingMat);
  group.add(buildingMesh);

  // --- traffic: light dots flowing along street chains ---
  const streams = streets.filter((street) => street.points.length >= 2 && street.level !== "lane").map(streamFrom);
  const totalLength = streams.reduce((sum, stream) => sum + stream.total, 0);
  const dotCount = Math.min(220, Math.max(24, Math.floor(totalLength / 16)));
  const dots: { stream: TrafficStream; offset: number; speed: number }[] = [];
  const traffic = rng("traffic");
  const dotPos = new Float32Array(dotCount * 3);
  const dotCol = new Float32Array(dotCount * 3);
  const colorA = new THREE.Color(palette.trafficA);
  const colorB = new THREE.Color(palette.trafficB);
  for (let i = 0; i < dotCount; i += 1) {
    const pickAt = traffic() * totalLength;
    let acc = 0;
    let stream = streams[0]!;
    for (const candidate of streams) {
      acc += candidate.total;
      if (pickAt <= acc) {
        stream = candidate;
        break;
      }
    }
    const forward = traffic() < 0.5;
    dots.push({ stream, offset: traffic() * stream.total, speed: (forward ? 1 : -1) * (9 + traffic() * 14) });
    const tint = forward ? colorA : colorB;
    dotCol[i * 3] = tint.r;
    dotCol[i * 3 + 1] = tint.g;
    dotCol[i * 3 + 2] = tint.b;
  }
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute("position", new THREE.BufferAttribute(dotPos, 3));
  dotGeo.setAttribute("color", new THREE.BufferAttribute(dotCol, 3));
  const dotMat = new THREE.PointsMaterial({
    size: 2.1,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const dotMesh = new THREE.Points(dotGeo, dotMat);
  dotMesh.frustumCulled = false;
  group.add(dotMesh);

  // --- accent lights on the two busiest junctions ---
  const junctions = [...city.network.junctions].sort((a, b) => b.arms.length - a.arms.length);
  const lightColors = [palette.lightA, palette.lightB];
  junctions.slice(0, 2).forEach((junction, i) => {
    const light = new THREE.PointLight(lightColors[i], 8000, 260, 2);
    light.position.set(junction.x, 26, junction.z);
    group.add(light);
  });

  const totalIndices = streetIdx.length;
  const scratch = new THREE.Vector3();
  let settledAt = Number.POSITIVE_INFINITY;

  const update = (dt: number, elapsed: number) => {
    const sweep = options.instant === true ? 1 : Math.min(1, elapsed / BUILD_SWEEP_SECONDS);
    const eased = 1 - (1 - sweep) * (1 - sweep);
    streetGeo.setDrawRange(0, Math.ceil((totalIndices / 6) * eased) * 6);
    if (options.instant !== true) growUniform.value = elapsed - BUILD_SWEEP_SECONDS * 0.55;
    const fadeIn = options.instant === true ? 1 : Math.max(0, Math.min(1, (elapsed - 0.9) / 1.2));
    glowMat.opacity = fadeIn * (0.42 + Math.sin(elapsed * 1.7) * 0.1);
    dotMat.opacity = fadeIn * 0.9;
    for (let i = 0; i < dots.length; i += 1) {
      const dot = dots[i]!;
      dot.offset += dot.speed * dt;
      sampleStream(dot.stream, dot.offset, scratch);
      dotPos[i * 3] = scratch.x;
      dotPos[i * 3 + 1] = scratch.y;
      dotPos[i * 3 + 2] = scratch.z;
    }
    dotGeo.attributes.position!.needsUpdate = true;
    if (settledAt === Number.POSITIVE_INFINITY && growUniform.value > 2.6) settledAt = elapsed;
  };

  return {
    group,
    stats: {
      streets: city.network.streets.length,
      lots: city.lots.length,
      loops: city.network.loops,
      junctions: city.network.junctions.length,
    },
    radius,
    settled: () => options.instant === true || settledAt !== Number.POSITIVE_INFINITY,
    update,
    dispose() {
      group.parent?.remove(group);
      streetGeo.dispose();
      glowGeo.dispose();
      buildingGeo.dispose();
      dotGeo.dispose();
      windows.dispose();
      streetMat.dispose();
      glowMat.dispose();
      buildingMat.dispose();
      dotMat.dispose();
    },
  };
}

/** Faded emerald grid ground shared by the hero and playground worlds. */
export function buildGround(radius: number, gridColor: number): THREE.Group {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x070b13, roughness: 1, metalness: 0 }),
  );
  disc.position.y = -0.02;
  group.add(disc);

  const grid = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 64).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(gridColor) },
        uRadius: { value: radius },
      },
      vertexShader: `varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `uniform vec3 uColor;
        uniform float uRadius;
        varying vec3 vPos;
        void main() {
          vec2 cell = vPos.xz / 14.0;
          vec2 g = abs(fract(cell - 0.5) - 0.5) / fwidth(cell);
          float line = 1.0 - min(min(g.x, g.y), 1.0);
          float fade = 1.0 - smoothstep(0.25, 1.0, length(vPos.xz) / uRadius);
          gl_FragColor = vec4(uColor, line * fade * 0.33);
        }`,
    }),
  );
  grid.position.y = 0.01;
  group.add(grid);
  return group;
}
