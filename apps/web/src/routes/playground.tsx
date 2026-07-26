import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { generateCity, type GeneratedCity } from "@jgengine/core/world/cityGenerator";
import { extractCircuitRoute, type CircuitRoute } from "@jgengine/core/world/raceCircuit";
import {
  generateStreets,
  streetNetworkMode,
  type StreetNetwork,
  type StreetNetworkMode,
  type StreetNetworkRules,
} from "@jgengine/core/world/streetGenerator";
import { Page, PageHero } from "../components/Layout";
import type { PlaygroundWorldHandle } from "../live/playgroundWorld";
import { seo } from "../lib/seo";

export const Route = createFileRoute("/playground")({
  head: () =>
    seo({
      title: "Playground — grow a 3D city, a circuit, or a street race from one seed",
      description:
        "Live in-browser street generator: one slider set grows a whole 3D city — streets, building lots — a closed race circuit at the other end of the same dials, or a street race lifted out of the city and sealed off. Deterministic from a seed, the same engine JGengine's editor bakes into scene documents.",
      path: "/playground",
    }),
  component: Playground,
});

type Mode = "city" | "circuit" | "race";
type View = "3d" | "map";

interface Dials {
  seed: string;
  size: number;
  gridness: number;
  loopiness: number;
  connectivity: number;
  branching: number;
  deadEnds: number;
  winding: number;
  segmentLength: number;
  aspect: number;
  roadWidth: number;
  minCurveRadius: number;
  boulevards: number;
  lotW: number;
  lotD: number;
  setback: number;
  spacing: number;
  variety: number;
  landmarks: number;
  blockFill: number;
  elevation: number;
  trackDensity: number;
  lapLength: number;
  arterialBias: number;
  checkpoints: number;
  sidewalks: boolean;
  sidewalkWidth: number;
  laneMarkings: boolean;
  laneMarkingWidth: number;
  laneMarkingOffset: number;
  laneMarkingDash: number;
  laneMarkingGap: number;
  focusJunction: number;
  cameraRadius: number;
  cameraPitch: number;
  cameraYaw: number;
}

export const DEFAULTS: Dials = {
  seed: "vice-isle",
  size: 260,
  gridness: 0.85,
  loopiness: 0.35,
  connectivity: 0.6,
  branching: 0.25,
  deadEnds: 0.15,
  winding: 0.15,
  segmentLength: 90,
  aspect: 1.4,
  roadWidth: 9,
  minCurveRadius: 18,
  boulevards: 0.2,
  lotW: 12,
  lotD: 10,
  setback: 3,
  spacing: 2,
  variety: 0.5,
  landmarks: 0.08,
  blockFill: 0.45,
  elevation: 0.35,
  trackDensity: 0.35,
  lapLength: 2400,
  arterialBias: 0.7,
  checkpoints: 12,
  sidewalks: true,
  sidewalkWidth: 2.2,
  laneMarkings: true,
  laneMarkingWidth: 0.18,
  laneMarkingOffset: 0,
  laneMarkingDash: 4.8,
  laneMarkingGap: 4,
  focusJunction: -1,
  cameraRadius: 120,
  cameraPitch: 45,
  cameraYaw: 45,
};

/**
 * The mode buttons are PRESETS over the one shared slider set, not three tools: each writes the same
 * layout dials to a different corner of the generator's space, so dragging away from a preset morphs
 * a city into a circuit continuously.
 */
export const PRESETS: Record<Mode, Partial<Dials>> = {
  city: {
    gridness: 0.85,
    loopiness: 0.35,
    connectivity: 0.6,
    branching: 0.25,
    deadEnds: 0.15,
    winding: 0.15,
    segmentLength: 90,
    aspect: 1.4,
    roadWidth: 9,
    minCurveRadius: 18,
    boulevards: 0.2,
    elevation: 0.35,
  },
  circuit: {
    gridness: 0,
    loopiness: 1,
    connectivity: 0,
    branching: 0,
    deadEnds: 0,
    winding: 0.55,
    segmentLength: 80,
    aspect: 1,
    roadWidth: 10,
    minCurveRadius: 24,
    boulevards: 0,
    elevation: 0.5,
  },
  race: {
    gridness: 0.7,
    loopiness: 0.5,
    connectivity: 0.55,
    branching: 0.3,
    deadEnds: 0.1,
    winding: 0.2,
    segmentLength: 100,
    aspect: 1.3,
    roadWidth: 10,
    minCurveRadius: 18,
    boulevards: 0.35,
    elevation: 0.3,
  },
};

const MODE_LABEL: Record<Mode, string> = { city: "City", circuit: "Race circuit", race: "Street race" };

/** Cap on road grade handed to the street rules (0..1). The generator clamps crest/dip steepness to it. */
const MAX_GRADE = 0.12;
const MIN_TURN_ANGLE = 12;
const MAX_TURN_ANGLE = 110;

/** Every street dial the playground drives, in one place — the same set for all three modes. */
export function playgroundStreetRules(dials: Dials): Omit<StreetNetworkRules, "seed"> {
  return {
    gridness: dials.gridness,
    loopiness: dials.loopiness,
    connectivity: dials.connectivity,
    branching: dials.branching,
    deadEnds: dials.deadEnds,
    segmentLength: dials.segmentLength,
    aspect: dials.aspect,
    winding: dials.winding,
    minCurveRadius: dials.minCurveRadius,
    minTurnAngle: MIN_TURN_ANGLE,
    maxTurnAngle: MAX_TURN_ANGLE,
    width: dials.roadWidth,
    boulevards: dials.boulevards,
    sidewalkWidth: dials.sidewalkWidth,
    elevation: dials.elevation,
    maxGrade: MAX_GRADE,
    compactness: dials.trackDensity,
  };
}

export interface PlaygroundResult {
  network: StreetNetwork;
  city: GeneratedCity | null;
  /** The lap lifted out of `network` in race mode; null in other modes or when no cycle exists. */
  route: CircuitRoute | null;
  /** What the sliders actually asked the generator for, independent of the chosen preset. */
  topology: StreetNetworkMode;
}

/**
 * Grow whatever the dials describe. `city` and `race` share one `generateCity` call — race then lifts
 * a sealed lap out of that same network — so the race is a section of the city, never a second world.
 */
export function growPlayground(mode: Mode, dials: Dials): PlaygroundResult {
  const streets = playgroundStreetRules(dials);
  const topology = streetNetworkMode({ seed: dials.seed, ...streets });
  if (mode === "circuit") {
    return { network: generateStreets({ seed: dials.seed, ...streets }, dials.size, dials.size), city: null, route: null, topology };
  }
  const city = generateCity(
    {
      seed: dials.seed,
      streets,
      lots: {
        // The city plotter already emits deterministic small/medium/large/grand tiers from this
        // scale hint. Passing building-lot variant arrays here is invalid and yields an empty city.
        footprint: { w: dials.lotW, d: dials.lotD },
        setback: dials.setback,
        spacing: dials.spacing,
        variety: dials.variety,
      },
      content: { landmarks: dials.landmarks, blockFill: dials.blockFill },
    },
    dials.size,
    dials.size,
  );
  const route =
    mode === "race"
      ? // `minCornerRadius` stays on the core default: it is the racing line's drivability floor, and a
        // junction can only be rounded inside the street's own width — feeding it the street fillet
        // radius rejects every lap an ordinary city can offer.
        extractCircuitRoute(city.network, {
          seed: dials.seed,
          lapLength: dials.lapLength,
          arterialBias: dials.arterialBias,
          checkpoints: dials.checkpoints,
        })
      : null;
  return { network: city.network, city, route, topology };
}

const LEVEL_COLOR: Record<string, string> = {
  boulevard: "#f8fafc",
  avenue: "#cbd5e1",
  street: "#94a3b8",
  lane: "#475569",
};

function randomSeed(): string {
  const words = ["neon", "vice", "harbor", "palm", "dust", "loop", "ridge", "delta", "night", "coast"];
  const a = words[Math.floor(Math.random() * words.length)];
  const b = words[Math.floor(Math.random() * words.length)];
  return `${a}-${b}-${Math.floor(Math.random() * 1000)}`;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className="font-mono text-emerald-300">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-emerald-400"
      />
    </label>
  );
}

function GroupLabel({ children }: { children: string }) {
  return <p className="pt-2 text-[11px] uppercase tracking-wide text-slate-500">{children}</p>;
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs transition ${
        value ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-black/20 text-slate-500"
      }`}
    >
      <span>{label}</span>
      <span className="font-mono uppercase">{value ? "on" : "off"}</span>
    </button>
  );
}

type Pt = readonly [number, number];

interface MapCorner {
  apex: Pt;
  radius: number;
  turnSign: number;
}

/**
 * Pure (THREE-free) corner detector for the SVG track map: fit a circumradius over each sliding point
 * triple around the closed loop and group consecutive high-curvature runs into one numbered corner.
 * Mirrors `analyzeTrackCorners` in cityScene — duplicated here on purpose so the route bundle never
 * pulls in three.js just to draw a map.
 */
function circuitCorners(points: readonly Pt[], maxRadius = 130, mergeGap = 2): MapCorner[] {
  const closed =
    points.length > 2 &&
    Math.hypot(points[0]![0] - points[points.length - 1]![0], points[0]![1] - points[points.length - 1]![1]) < 1e-6;
  const pts = closed ? points.slice(0, -1) : points.slice();
  const n = pts.length;
  if (n < 6) return [];
  const radius = new Float64Array(n);
  const sign = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const a = pts[(i - 1 + n) % n]!;
    const b = pts[i]!;
    const c = pts[(i + 1) % n]!;
    const la = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const lb = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const lc = Math.hypot(a[0] - c[0], a[1] - c[1]);
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const area = Math.abs(cross) / 2;
    radius[i] = area < 1e-6 ? Infinity : (la * lb * lc) / (4 * area);
    sign[i] = Math.sign(cross);
  }
  const turnAt = (j: number): number => {
    const a = pts[(j - 1 + n) % n]!;
    const b = pts[j]!;
    const c = pts[(j + 1) % n]!;
    const ux = b[0] - a[0];
    const uz = b[1] - a[1];
    const vx = c[0] - b[0];
    const vz = c[1] - b[1];
    const lu = Math.hypot(ux, uz);
    const lv = Math.hypot(vx, vz);
    if (lu < 1e-6 || lv < 1e-6) return 0;
    return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uz * vz) / (lu * lv))));
  };
  const corner = Array.from({ length: n }, (_, i) => radius[i]! < maxRadius);
  const corners: MapCorner[] = [];
  let i = 0;
  while (i < n) {
    if (!corner[i]) {
      i += 1;
      continue;
    }
    let last = i;
    let gap = 0;
    let k = i;
    while (k < n) {
      if (corner[k]) {
        last = k;
        gap = 0;
      } else if (++gap > mergeGap) {
        break;
      }
      k += 1;
    }
    let apexIndex = i;
    for (let j = i; j <= last; j += 1) if (radius[j]! < radius[apexIndex]!) apexIndex = j;
    // True corner radius: run arc length / total heading change (R = L / Δθ).
    let arc = 0;
    let turn = 0;
    for (let j = i; j <= last; j += 1) {
      const b = pts[j]!;
      const c = pts[(j + 1) % n]!;
      arc += Math.hypot(c[0] - b[0], c[1] - b[1]);
      turn += turnAt(j);
    }
    const fitted = turn > 1e-2 ? Math.min(400, arc / turn) : radius[apexIndex]!;
    corners.push({ apex: pts[apexIndex]!, radius: Math.max(8, Math.round(fitted)), turnSign: sign[apexIndex]! || 1 });
    i = last + 1;
  }
  return corners;
}

function StreetsSvg({
  network,
  city,
  route,
  size,
}: {
  network: StreetNetwork;
  city: GeneratedCity | null;
  route: CircuitRoute | null;
  size: number;
}) {
  const view = size * 2 + 40;
  const toX = (x: number) => x + view / 2;
  const toZ = (z: number) => z + view / 2;

  const loop = network.mode === "circuit" ? network.streets.find((s) => s.loop) ?? network.streets[0] : undefined;
  const loopPts = loop?.points ?? [];
  const corners = loop !== undefined ? circuitCorners(loopPts) : [];
  // Dense compactness-1 layouts detect 12-20+ corners; a label on every one collides into an
  // unreadable smear. Above 14, label only the corners tighter than the median radius (the ones a
  // driver actually brakes for) while every corner keeps its apex dot — T-numbers stay the true
  // sequential index so the labelled subset reads as T1…Tn with gaps, never renumbered.
  const LABEL_ALL_MAX = 14;
  const labelEveryCorner = corners.length <= LABEL_ALL_MAX;
  let radiusCutoff = Infinity;
  if (!labelEveryCorner) {
    const sorted = corners.map((c) => c.radius).sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    radiusCutoff = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  // Loop centroid — labels are pushed radially outward from it so they never sit on the track line.
  let cx = 0;
  let cz = 0;
  const unique = loopPts.length > 1 ? loopPts.slice(0, -1) : loopPts;
  for (const p of unique) {
    cx += p[0];
    cz += p[1];
  }
  if (unique.length > 0) {
    cx /= unique.length;
    cz /= unique.length;
  }
  const half = (loop?.width ?? 12) / 2;

  // Checkered start/finish band across the track at the loop's first point.
  const startBand: { pts: string; fill: string }[] = [];
  let startLabel: { x: number; y: number } | null = null;
  if (loop !== undefined && unique.length >= 3) {
    const s0 = unique[0]!;
    const prev = unique[unique.length - 1]!;
    const next = unique[1]!;
    let tx = next[0] - prev[0];
    let tz = next[1] - prev[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    const nx = -tz;
    const nz = tx;
    const cols = 8;
    const rows = 2;
    const depth = Math.max(6, half * 0.9);
    const at = (u: number, v: number): Pt => [s0[0] + nx * u + tx * v, s0[1] + nz * u + tz * v];
    for (let r = 0; r < rows; r += 1) {
      for (let cI = 0; cI < cols; cI += 1) {
        const u0 = -half + (cI / cols) * 2 * half;
        const u1 = -half + ((cI + 1) / cols) * 2 * half;
        const v0 = -depth / 2 + (r / rows) * depth;
        const v1 = -depth / 2 + ((r + 1) / rows) * depth;
        const a = at(u0, v0);
        const b = at(u1, v0);
        const c = at(u1, v1);
        const d = at(u0, v1);
        startBand.push({
          pts: [a, b, c, d].map(([x, z]) => `${toX(x)},${toZ(z)}`).join(" "),
          fill: (cI + r) % 2 === 0 ? "#0b1017" : "#f8fafc",
        });
      }
    }
    startLabel = { x: toX(s0[0] + nx * (half + 10)), y: toZ(s0[1] + nz * (half + 10)) };
  }

  return (
    <svg viewBox={`0 0 ${view} ${view}`} className="h-full w-full">
      {network.streets.map((street, i) => (
        <polyline
          key={`s${i}`}
          points={street.points.map(([x, z]) => `${toX(x)},${toZ(z)}`).join(" ")}
          fill="none"
          stroke={LEVEL_COLOR[street.level] ?? "#94a3b8"}
          strokeWidth={street.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.9}
        />
      ))}
      {network.streets.map((street, i) =>
        street.width >= 8 ? (
          <polyline
            key={`m${i}`}
            points={street.points.map(([x, z]) => `${toX(x)},${toZ(z)}`).join(" ")}
            fill="none"
            stroke="#facc15"
            strokeWidth={0.7}
            strokeDasharray="6 5"
            opacity={0.8}
          />
        ) : null,
      )}
      {city?.lots.map((lot, i) => (
        <rect
          key={`l${i}`}
          x={toX(lot.center[0]) - lot.footprint.w / 2}
          y={toZ(lot.center[1]) - lot.footprint.d / 2}
          width={lot.footprint.w}
          height={lot.footprint.d}
          transform={`rotate(${(-lot.rotationY * 180) / Math.PI} ${toX(lot.center[0])} ${toZ(lot.center[1])})`}
          fill="#34d399"
          opacity={0.55}
          rx={1}
        />
      ))}
      {/* Numbered corners with fitted radii, labels pushed outward from the loop centroid. */}
      {corners.map((corner, i) => {
        const ax = corner.apex[0];
        const az = corner.apex[1];
        // Every corner keeps a dot; only the labelled subset draws a leader line + T/R text.
        const labelled = labelEveryCorner || corner.radius < radiusCutoff;
        if (!labelled) {
          return <circle key={`c${i}`} cx={toX(ax)} cy={toZ(az)} r={1.8} fill="#34d399" opacity={0.7} />;
        }
        let ox = ax - cx;
        let oz = az - cz;
        const ol = Math.hypot(ox, oz) || 1;
        ox /= ol;
        oz /= ol;
        const lx = toX(ax + ox * (half + 16));
        const ly = toZ(az + oz * (half + 16));
        const anchor = ox > 0.35 ? "start" : ox < -0.35 ? "end" : "middle";
        return (
          <g key={`c${i}`}>
            <line x1={toX(ax)} y1={toZ(az)} x2={lx} y2={ly} stroke="#34d399" strokeWidth={0.6} opacity={0.5} />
            <circle cx={toX(ax)} cy={toZ(az)} r={2.4} fill="#34d399" />
            <text x={lx} y={ly - 4} fill="#e2e8f0" fontSize={11} fontFamily="monospace" fontWeight={600} textAnchor={anchor}>
              T{i + 1}
            </text>
            <text x={lx} y={ly + 7} fill="#5eead4" fontSize={9} fontFamily="monospace" textAnchor={anchor}>
              R{corner.radius}
            </text>
          </g>
        );
      })}
      {/* Checkered start/finish band crossing the track. */}
      {startBand.map((cell, i) => (
        <polygon key={`sf${i}`} points={cell.pts} fill={cell.fill} stroke="#0b1017" strokeWidth={0.3} />
      ))}
      {startLabel !== null ? (
        <text x={startLabel.x} y={startLabel.y} fill="#f8fafc" fontSize={10} fontFamily="monospace" fontWeight={600} textAnchor="middle">
          START/FINISH
        </text>
      ) : null}
      {/* Street race: the lap over the city streets it uses, plus a barrier tick per sealed side street. */}
      {route !== null ? (
        <g>
          <polyline
            points={[...route.centerline, route.centerline[0]!].map(([x, z]) => `${toX(x)},${toZ(z)}`).join(" ")}
            fill="none"
            stroke="#0d1016"
            strokeWidth={route.widths[0] ?? 10}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points={[...route.centerline, route.centerline[0]!].map(([x, z]) => `${toX(x)},${toZ(z)}`).join(" ")}
            fill="none"
            stroke="#f97316"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {route.seals.map((seal, i) => {
            const spread = seal.width / 2 + 1.5;
            const ax = Math.cos(seal.heading) * spread;
            const az = -Math.sin(seal.heading) * spread;
            return (
              <line
                key={`sl${i}`}
                x1={toX(seal.x - ax)}
                y1={toZ(seal.z - az)}
                x2={toX(seal.x + ax)}
                y2={toZ(seal.z + az)}
                stroke="#ef4444"
                strokeWidth={2.2}
                strokeLinecap="round"
              />
            );
          })}
          <line
            x1={toX(route.start.line[0][0])}
            y1={toZ(route.start.line[0][1])}
            x2={toX(route.start.line[1][0])}
            y2={toZ(route.start.line[1][1])}
            stroke="#f8fafc"
            strokeWidth={2.4}
          />
        </g>
      ) : null}
    </svg>
  );
}

export interface PlaygroundCam {
  x: number;
  z: number;
  radius: number;
  pitch: number;
  yaw: number;
}

export interface PlaygroundQuery {
  dials: Partial<Dials>;
  cam: PlaygroundCam | null;
  view: View | null;
  mode: Mode | null;
  inspect: boolean;
  capture: boolean;
}

const DIAL_RANGES = {
  size: [140, 400],
  gridness: [0, 1],
  loopiness: [0, 1],
  connectivity: [0, 1],
  branching: [0, 1],
  deadEnds: [0, 1],
  winding: [0, 0.8],
  segmentLength: [50, 160],
  aspect: [1, 2.5],
  roadWidth: [6, 16],
  minCurveRadius: [6, 60],
  boulevards: [0, 0.6],
  lapLength: [400, 6000],
  arterialBias: [0, 1],
  checkpoints: [4, 24],
  lotW: [8, 24],
  lotD: [6, 24],
  setback: [1, 10],
  spacing: [0, 8],
  variety: [0, 1],
  landmarks: [0, 0.2],
  blockFill: [0, 1],
  elevation: [0, 1],
  trackDensity: [0, 1],
  sidewalkWidth: [0.5, 5],
  laneMarkingWidth: [0.06, 0.6],
  laneMarkingOffset: [-4, 4],
  laneMarkingDash: [1, 12],
  laneMarkingGap: [0.5, 12],
  cameraRadius: [12, 180],
  cameraPitch: [25, 85],
  cameraYaw: [-180, 180],
} as const satisfies Partial<Record<keyof Dials, readonly [number, number]>>;

/** Parse every shareable playground control without allowing invalid geometry or camera values through. */
export function parsePlaygroundQuery(search: string): PlaygroundQuery {
  const query = new URLSearchParams(search);
  const dials: Partial<Dials> = {};
  const number = (key: string): number | undefined => {
    const raw = query.get(key);
    if (raw === null) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  const boolean = (key: string): boolean | undefined => {
    const raw = query.get(key);
    if (raw === null) return undefined;
    return !["0", "false", "off", "no"].includes(raw.toLowerCase());
  };
  const setNumber = (dial: keyof typeof DIAL_RANGES, queryKey: string = dial) => {
    const value = number(queryKey);
    if (value === undefined) return;
    const [min, max] = DIAL_RANGES[dial];
    (dials as Record<string, unknown>)[dial] = Math.max(min, Math.min(max, value));
  };

  const seed = query.get("seed");
  if (seed !== null && seed.length > 0) dials.seed = seed;
  for (const dial of [
    "size",
    "gridness",
    "loopiness",
    "connectivity",
    "branching",
    "deadEnds",
    "winding",
    "segmentLength",
    "aspect",
    "roadWidth",
    "minCurveRadius",
    "boulevards",
    "lapLength",
    "arterialBias",
    "checkpoints",
    "lotW",
    "lotD",
    "setback",
    "spacing",
    "variety",
    "landmarks",
    "elevation",
    "trackDensity",
    "sidewalkWidth",
    "cameraRadius",
    "cameraPitch",
    "cameraYaw",
  ] as const) {
    setNumber(dial);
  }
  setNumber("blockFill", query.has("blockFill") ? "blockFill" : "fill");
  setNumber("laneMarkingWidth", query.has("laneMarkingWidth") ? "laneMarkingWidth" : "markingWidth");
  setNumber("laneMarkingOffset", query.has("laneMarkingOffset") ? "laneMarkingOffset" : "markingOffset");
  setNumber("laneMarkingDash", query.has("laneMarkingDash") ? "laneMarkingDash" : "markingDash");
  setNumber("laneMarkingGap", query.has("laneMarkingGap") ? "laneMarkingGap" : "markingGap");

  const sidewalks = boolean("sidewalks");
  if (sidewalks !== undefined) dials.sidewalks = sidewalks;
  const laneMarkings = boolean(query.has("laneMarkings") ? "laneMarkings" : "markings");
  if (laneMarkings !== undefined) dials.laneMarkings = laneMarkings;
  const junction = number("junction");
  if (junction !== undefined) {
    dials.focusJunction = Math.max(-1, Math.floor(junction));
    if (dials.focusJunction >= 0) {
      dials.cameraRadius ??= DEFAULTS.cameraRadius;
      dials.cameraPitch ??= DEFAULTS.cameraPitch;
      dials.cameraYaw ??= DEFAULTS.cameraYaw;
    }
  }

  let cam: PlaygroundCam | null = null;
  const rawCam = query.get("cam");
  if (rawCam !== null) {
    const parts = rawCam.split(",").map(Number);
    if ((parts.length === 3 || parts.length === 4) && parts.every((value) => Number.isFinite(value))) {
      cam = {
        x: Math.max(-1000, Math.min(1000, parts[0]!)),
        z: Math.max(-1000, Math.min(1000, parts[1]!)),
        radius: Math.max(12, Math.min(180, parts[2]!)),
        pitch: Math.max(25, Math.min(85, parts[3] ?? DEFAULTS.cameraPitch)),
        yaw: DEFAULTS.cameraYaw,
      };
    }
  }

  const rawView = query.get("view");
  const rawMode = query.get("mode");
  return {
    dials,
    cam,
    view: rawView === "map" || rawView === "3d" ? rawView : null,
    mode: rawMode === "city" || rawMode === "circuit" || rawMode === "race" ? rawMode : null,
    inspect: boolean("inspect") === true,
    capture: boolean("capture") === true,
  };
}

const EMPTY_QUERY = parsePlaygroundQuery("");

function Playground() {
  // SSR and the first client render must match. Apply location-derived state after hydration, then
  // boot Three.js; the default city is never mounted or declared capture-ready for a query capture.
  const [query, setQuery] = useState<PlaygroundQuery>(EMPTY_QUERY);
  const [queryReady, setQueryReady] = useState(false);
  const [mode, setMode] = useState<Mode>("city");
  const [view, setView] = useState<View>("3d");
  const [dials, setDials] = useState<Dials>(DEFAULTS);
  const [worldReady, setWorldReady] = useState(false);
  const viewerHost = useRef<HTMLDivElement>(null);
  const worldRef = useRef<PlaygroundWorldHandle | null>(null);
  const builtOnce = useRef(false);
  const set = (patch: Partial<Dials>) => setDials((d) => ({ ...d, ...patch }));

  useEffect(() => {
    const parsed = parsePlaygroundQuery(window.location.search);
    const parsedMode = parsed.mode ?? "city";
    setQuery(parsed);
    setMode(parsedMode);
    setView(parsed.view ?? "3d");
    // A shared URL carries whichever dials it names; the rest come from the mode's preset, so
    // `?mode=circuit` still lands on a circuit instead of a city wearing a circuit label.
    setDials({ ...DEFAULTS, ...PRESETS[parsedMode], ...parsed.dials });
    setQueryReady(true);
  }, []);

  const result = useMemo(() => growPlayground(mode, dials), [mode, dials]);

  // Boot the 3D viewer once (client-only; three.js loads lazily).
  useEffect(() => {
    if (!queryReady) return;
    const host = viewerHost.current;
    if (host === null) return;
    let cancelled = false;
    void import("../live/playgroundWorld")
      .then(({ createPlaygroundWorld }) => {
        if (cancelled) return;
        worldRef.current = createPlaygroundWorld(host);
        setWorldReady(true);
      })
      .catch((error: unknown) => {
        document.documentElement.dataset.jgCapture = "error";
        document.documentElement.dataset.jgCaptureError = error instanceof Error ? error.message : String(error);
        setView("map");
      });
    return () => {
      cancelled = true;
      worldRef.current?.dispose();
      worldRef.current = null;
    };
  }, [queryReady]);

  // Rebuild the 3D model on every regeneration. The first build grows in;
  // slider drags rebuild instantly so the feedback stays immediate.
  useEffect(() => {
    if (!worldReady) return;
    const world = worldRef.current;
    if (world === null) return;
    const city = result.city ?? { network: result.network, lots: [], plots: [], parks: [] };
    const focusIndex = Math.max(-1, Math.min(result.network.junctions.length - 1, Math.floor(dials.focusJunction)));
    const focus = focusIndex >= 0 ? result.network.junctions[focusIndex] : undefined;
    const camera =
      focus !== undefined
        ? { x: focus.x, z: focus.z, radius: dials.cameraRadius, pitch: dials.cameraPitch, yaw: dials.cameraYaw }
        : query.cam ?? undefined;
    let cancelled = false;
    document.documentElement.dataset.jgCapture = "pending";
    void world.setCity(city, {
      seed: dials.seed,
      heightScale: mode === "circuit" ? 0.5 : 1,
      animate: !query.capture && !builtOnce.current,
      mode,
      elevation: dials.elevation,
      extent: dials.size,
      camera,
      sidewalks: dials.sidewalks,
      sidewalkWidth: dials.sidewalkWidth,
      laneMarkings: dials.laneMarkings,
      laneMarkingWidth: dials.laneMarkingWidth,
      laneMarkingOffset: dials.laneMarkingOffset,
      laneMarkingDash: dials.laneMarkingDash,
      laneMarkingGap: dials.laneMarkingGap,
      ...(result.route === null ? {} : { route: result.route }),
    }).then(() => {
      if (!cancelled) document.documentElement.dataset.jgCapture = "ready";
    }).catch((error: unknown) => {
      if (cancelled) return;
      document.documentElement.dataset.jgCapture = "error";
      document.documentElement.dataset.jgCaptureError = error instanceof Error ? error.message : String(error);
    });
    builtOnce.current = true;
    return () => {
      cancelled = true;
    };
  }, [worldReady, result, mode, query]);

  const rpc = `{"method":"generate_streets","seed":"${dials.seed}","mode":"${result.topology}","halfX":${dials.size},"halfZ":${dials.size},"center":{"x":0,"y":0,"z":0},"params":${JSON.stringify(playgroundStreetRules(dials))}}`;
  const lap = result.route;

  return (
    <Page>
      {!query.inspect && (
        <PageHero
          eyebrow="Playground"
          title="One slider set: a city, a circuit, or a street race through the city"
          blurb="This is the live street generator that ships in @jgengine/core, rendered in full 3D: streets, frontage building lots, a sealed-off racing lap. The three buttons are presets over the same dials — a city and a race track are opposite corners of one space, and a street race is a section of the city with barriers dropped in. Every drag regrows it deterministically — same seed and sliders, same world, in the browser, in the editor, and in a shipped game."
        />
      )}
      <div className={query.inspect ? "fixed inset-0 z-50 bg-[#0b1017]" : "mx-auto grid max-w-6xl gap-6 px-6 pb-24 lg:grid-cols-[320px_1fr]"}>
        <div className={query.inspect ? "hidden" : "space-y-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5"}>
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Preset — moves the shared sliders</p>
            <div className="flex gap-2">
              {(["city", "circuit", "race"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    set(PRESETS[m]);
                  }}
                  className={`flex-1 rounded-full px-2 py-1.5 text-xs transition ${
                    mode === m ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[0.04] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={dials.seed}
              onChange={(e) => set({ seed: e.target.value })}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-sm text-emerald-300 outline-none focus:border-emerald-400/50"
              aria-label="Seed"
            />
            <button
              type="button"
              onClick={() => set({ seed: randomSeed() })}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm transition hover:border-emerald-400/40"
              title="Random seed"
            >
              🎲
            </button>
          </div>
          <GroupLabel>Layout — every mode, every slider</GroupLabel>
          <Slider label="World half-size" value={dials.size} min={140} max={400} step={20} onChange={(v) => set({ size: v })} />
          <Slider label="Block size" value={dials.segmentLength} min={50} max={160} step={5} onChange={(v) => set({ segmentLength: v })} />
          <Slider label="Block aspect" value={dials.aspect} min={1} max={2.5} step={0.1} onChange={(v) => set({ aspect: v })} />
          <Slider label="Road width" value={dials.roadWidth} min={6} max={16} step={0.5} onChange={(v) => set({ roadWidth: v })} />
          <Slider label="Loopiness (0 = city tree, 1 = circuit)" value={dials.loopiness} min={0} max={1} step={0.05} onChange={(v) => set({ loopiness: v })} />
          <Slider label="Dead ends" value={dials.deadEnds} min={0} max={1} step={0.05} onChange={(v) => set({ deadEnds: v })} />
          <Slider label="Gridness" value={dials.gridness} min={0} max={1} step={0.05} onChange={(v) => set({ gridness: v })} />
          <Slider label="Connectivity" value={dials.connectivity} min={0} max={1} step={0.05} onChange={(v) => set({ connectivity: v })} />
          <Slider label="Branching" value={dials.branching} min={0} max={1} step={0.05} onChange={(v) => set({ branching: v })} />
          <Slider label="Boulevards" value={dials.boulevards} min={0} max={0.6} step={0.05} onChange={(v) => set({ boulevards: v })} />
          <Slider label="Winding" value={dials.winding} min={0} max={0.8} step={0.05} onChange={(v) => set({ winding: v })} />
          <Slider label="Min curve radius" value={dials.minCurveRadius} min={6} max={60} step={1} onChange={(v) => set({ minCurveRadius: v })} />
          <Slider label="Elevation" value={dials.elevation} min={0} max={1} step={0.05} onChange={(v) => set({ elevation: v })} />
          <Slider label="Track density" value={dials.trackDensity} min={0} max={1} step={0.05} onChange={(v) => set({ trackDensity: v })} />
          <GroupLabel>Paving</GroupLabel>
          <Toggle label="Sidewalks" value={dials.sidewalks} onChange={(sidewalks) => set({ sidewalks })} />
          {dials.sidewalks && (
            <Slider label="Sidewalk width" value={dials.sidewalkWidth} min={0.5} max={5} step={0.1} onChange={(sidewalkWidth) => set({ sidewalkWidth })} />
          )}
          <Toggle label="Lane markings" value={dials.laneMarkings} onChange={(laneMarkings) => set({ laneMarkings })} />
          {dials.laneMarkings && (
            <>
              <Slider label="Marking width" value={dials.laneMarkingWidth} min={0.06} max={0.6} step={0.02} onChange={(laneMarkingWidth) => set({ laneMarkingWidth })} />
              <Slider label="Marking offset" value={dials.laneMarkingOffset} min={-4} max={4} step={0.25} onChange={(laneMarkingOffset) => set({ laneMarkingOffset })} />
              <Slider label="Dash length" value={dials.laneMarkingDash} min={1} max={12} step={0.5} onChange={(laneMarkingDash) => set({ laneMarkingDash })} />
              <Slider label="Dash gap" value={dials.laneMarkingGap} min={0.5} max={12} step={0.5} onChange={(laneMarkingGap) => set({ laneMarkingGap })} />
            </>
          )}
          {mode !== "circuit" && (
            <>
              <GroupLabel>Plots and buildings</GroupLabel>
              <Slider label="Lot frontage" value={dials.lotW} min={8} max={24} step={1} onChange={(v) => set({ lotW: v })} />
              <Slider label="Lot depth" value={dials.lotD} min={6} max={24} step={1} onChange={(v) => set({ lotD: v })} />
              <Slider label="Sidewalk setback" value={dials.setback} min={1} max={10} step={1} onChange={(v) => set({ setback: v })} />
              <Slider label="Plot spacing" value={dials.spacing} min={0} max={8} step={0.5} onChange={(v) => set({ spacing: v })} />
              <Slider label="Plot variety" value={dials.variety} min={0} max={1} step={0.05} onChange={(v) => set({ variety: v })} />
              <Slider label="Landmarks" value={dials.landmarks} min={0} max={0.2} step={0.01} onChange={(v) => set({ landmarks: v })} />
              <Slider label="Block fill" value={dials.blockFill} min={0} max={1} step={0.05} onChange={(v) => set({ blockFill: v })} />
            </>
          )}
          {mode === "race" && (
            <>
              <GroupLabel>Street race — the lap lifted out of the city</GroupLabel>
              <Slider label="Lap length (m)" value={dials.lapLength} min={400} max={6000} step={100} onChange={(v) => set({ lapLength: v })} />
              <Slider label="Arterial bias" value={dials.arterialBias} min={0} max={1} step={0.05} onChange={(v) => set({ arterialBias: v })} />
              <Slider label="Checkpoints" value={dials.checkpoints} min={4} max={24} step={1} onChange={(v) => set({ checkpoints: v })} />
            </>
          )}
          {view === "3d" && result.network.junctions.length > 0 && (
            <>
              <Slider label="Focus junction (-1 = free)" value={Math.min(dials.focusJunction, result.network.junctions.length - 1)} min={-1} max={result.network.junctions.length - 1} step={1} onChange={(focusJunction) => set({ focusJunction })} />
              {dials.focusJunction >= 0 && (
                <>
                  <Slider label="Camera distance" value={dials.cameraRadius} min={12} max={180} step={2} onChange={(cameraRadius) => set({ cameraRadius })} />
                  <Slider label="Camera pitch" value={dials.cameraPitch} min={25} max={85} step={1} onChange={(cameraPitch) => set({ cameraPitch })} />
                  <Slider label="Camera yaw" value={dials.cameraYaw} min={-180} max={180} step={5} onChange={(cameraYaw) => set({ cameraYaw })} />
                </>
              )}
            </>
          )}
          <div className="space-y-1 text-xs leading-relaxed text-slate-500">
            <p>
              These sliders grow a <span className="font-mono text-emerald-300">{result.topology}</span> —{" "}
              <span className="text-emerald-300">{result.network.streets.length}</span> streets,{" "}
              <span className="text-emerald-300">{result.network.loops}</span> independent loops. Loopiness decides which; the
              preset buttons only move it.
            </p>
            {mode === "city" && (
              <p>
                <span className="text-emerald-300">{result.city?.lotContent?.length ?? result.city?.lots.length ?? 0}</span>{" "}
                buildings on street-fronting plots.
              </p>
            )}
            {mode === "circuit" && (
              <p>
                Track density <span className="text-emerald-300">{dials.trackDensity}</span> folds the lap into its footprint: 0
                keeps an open, flowing loop; 1 fills the interior with parallel corridors and switchbacks.
              </p>
            )}
            {mode === "race" &&
              (lap === null ? (
                <p className="text-amber-300/80">
                  No drivable cycle in this city — raise Loopiness or Connectivity until a lap can close.
                </p>
              ) : (
                <p>
                  <span className="text-emerald-300">{Math.round(lap.length)} m</span> lap ·{" "}
                  <span className="text-emerald-300">{lap.corners.length}</span> corners · runs on{" "}
                  <span className="text-emerald-300">{lap.edges.length}</span> of {result.network.edges.length} city streets ·{" "}
                  <span className="text-emerald-300">{lap.seals.length}</span> side streets sealed off.
                </p>
              ))}
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-black/30 p-3">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Bake this exact layout into a game</p>
            <code className="block max-h-28 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-slate-400">
              bun packages/editor/src/mcp/cli.ts --game &lt;id&gt; --rpc '{rpc}' --save
            </code>
          </div>
        </div>
        <div className={query.inspect ? "absolute inset-0 overflow-hidden bg-[#0b1017]" : "relative min-h-[420px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b1017] lg:min-h-[560px]"}>
          <div
            ref={viewerHost}
            className={`absolute inset-0 transition-opacity duration-500 ${
              view === "3d" && worldReady ? "opacity-100" : "opacity-0"
            } ${view === "3d" ? "" : "hidden"}`}
            aria-label="3D city preview"
          />
          {view === "map" && (
            <div className="absolute inset-0">
              <StreetsSvg network={result.network} city={result.city} route={result.route} size={dials.size} />
            </div>
          )}
          {view === "3d" && !worldReady && (
            <p className="absolute inset-0 grid place-items-center font-mono text-xs text-slate-600">
              loading three.js…
            </p>
          )}
          <div className="absolute right-3 top-3 flex gap-1 rounded-full border border-white/10 bg-ink/80 p-1 backdrop-blur-sm">
            {(["3d", "map"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-full px-3 py-1 font-mono text-xs uppercase transition ${
                  view === v ? "bg-emerald-400/15 text-emerald-300" : "text-slate-500 hover:text-slate-200"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          {view === "3d" && (
            <p className="pointer-events-none absolute bottom-3 left-3 font-mono text-[10px] text-slate-600">
              {dials.focusJunction >= 0 ? `junction ${Math.floor(dials.focusJunction)} · ` : ""}drag to orbit · scroll to zoom
            </p>
          )}
        </div>
      </div>
    </Page>
  );
}
