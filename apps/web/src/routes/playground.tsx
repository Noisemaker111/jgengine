import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { generateCity, type CityPlotTier, type GeneratedCity } from "@jgengine/core/world/cityGenerator";
import { trimPathAtJunctions } from "@jgengine/core/world/roads";
import { generateStreets, type StreetNetwork, type StreetNetworkRules } from "@jgengine/core/world/streetGenerator";
import { Page, PageHero } from "../components/Layout";
import type { PlaygroundWorldHandle } from "../live/playgroundWorld";
import { seo } from "../lib/seo";

export const Route = createFileRoute("/playground")({
  head: () =>
    seo({
      title: "Playground — grow a 3D city or a race circuit from one seed",
      description:
        "Live in-browser street generator: drag the sliders and watch a whole 3D city — streets, building lots, traffic — or a closed race circuit regrow deterministically from a seed. The same engine JGengine's editor bakes into scene documents.",
      path: "/playground",
    }),
  component: Playground,
});

type Mode = "city" | "circuit";
type View = "3d" | "map";

interface Dials {
  seed: string;
  size: number;
  gridness: number;
  connectivity: number;
  branching: number;
  winding: number;
  segmentLength: number;
  boulevards: number;
  lotW: number;
  lotD: number;
  setback: number;
  landmarks: number;
  blockFill: number;
  elevation: number;
  trackDensity: number;
}

const DEFAULTS: Dials = {
  seed: "vice-isle",
  size: 260,
  gridness: 0.85,
  connectivity: 0.6,
  branching: 0.25,
  winding: 0.15,
  segmentLength: 90,
  boulevards: 0.2,
  lotW: 12,
  lotD: 10,
  setback: 3,
  landmarks: 0.08,
  blockFill: 0.45,
  elevation: 0.35,
  trackDensity: 0.35,
};

/** City vs. circuit start their Elevation dial in different places — gentle hills vs. a rolling lap. */
const CITY_ELEVATION = 0.35;
const CIRCUIT_ELEVATION = 0.5;
/** Cap on road grade handed to the street rules (0..1). The generator clamps crest/dip steepness to it. */
const MAX_GRADE = 0.12;

const CIRCUIT_RULES: Omit<StreetNetworkRules, "seed"> = {
  gridness: 0,
  loopiness: 1,
  connectivity: 0,
  branching: 0,
  deadEnds: 0,
  segmentLength: 80,
  aspect: 1,
  winding: 0.55,
  minCurveRadius: 24,
  minTurnAngle: 10,
  maxTurnAngle: 100,
  width: 10,
  boulevards: 0,
};

const LEVEL_COLOR: Record<string, string> = {
  boulevard: "#f8fafc",
  avenue: "#cbd5e1",
  street: "#94a3b8",
  lane: "#475569",
};

/** Plot fill by size tier — grand plots (the landmark-scale parcels) pop in blue. */
const TIER_COLOR: Record<CityPlotTier, string> = {
  small: "#6ee7b7",
  medium: "#34d399",
  large: "#0d9488",
  grand: "#60a5fa",
};

/** Draw order: narrow levels first so wider roads overplot them and junctions read clean. */
const LEVEL_DRAW_ORDER: Record<string, number> = { lane: 0, street: 1, avenue: 2, boulevard: 3 };

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

function StreetsSvg({ network, city, size }: { network: StreetNetwork; city: GeneratedCity | null; size: number }) {
  // Fit the view to what actually grew: organic outlines make each seed's silhouette (and center
  // of mass) unique, so a fixed square viewBox would waste half the panel or clip the city.
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const street of network.streets) {
    for (const [x, z] of street.points) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
  if (!Number.isFinite(minX)) {
    minX = -size;
    maxX = size;
    minZ = -size;
    maxZ = size;
  }
  const pad = 30;
  const view = Math.max(maxX - minX, maxZ - minZ) + pad * 2;
  const toX = (x: number) => x - (minX + maxX) / 2 + view / 2;
  const toZ = (z: number) => z - (minZ + maxZ) / 2 + view / 2;

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

  // Streets sorted narrow→wide so wider roads overplot narrower ones and every junction reads as
  // one clean surface; center dashes are trimmed out of junction aprons instead of sailing through.
  const drawOrder = network.streets
    .map((_, i) => i)
    .sort((a, b) => (LEVEL_DRAW_ORDER[network.streets[a]!.level] ?? 1) - (LEVEL_DRAW_ORDER[network.streets[b]!.level] ?? 1));
  const junctionInputs = network.junctions.map((j) => ({ x: j.x, z: j.z, arms: j.arms }));

  return (
    <svg viewBox={`0 0 ${view} ${view}`} className="h-full w-full">
      {city?.parks.map((park, i) => (
        <polygon
          key={`p${i}`}
          points={park.map(([x, z]) => `${toX(x)},${toZ(z)}`).join(" ")}
          fill="#14532d"
          opacity={0.45}
        />
      ))}
      {drawOrder.map((i) => {
        const street = network.streets[i]!;
        return (
          <polyline
            key={`s${i}`}
            points={street.points.map(([x, z]) => `${toX(x)},${toZ(z)}`).join(" ")}
            fill="none"
            stroke={LEVEL_COLOR[street.level] ?? "#94a3b8"}
            strokeWidth={street.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
      {network.streets.flatMap((street, i) =>
        street.width >= 8
          ? trimPathAtJunctions(street.points, street.width, junctionInputs).map((sub, k) => (
              <polyline
                key={`m${i}:${k}`}
                points={sub.path.map(([x, z]) => `${toX(x)},${toZ(z)}`).join(" ")}
                fill="none"
                stroke="#facc15"
                strokeWidth={0.7}
                strokeDasharray="6 5"
                opacity={0.8}
              />
            ))
          : [],
      )}
      {city?.plots.map((plot, i) => (
        <polygon
          key={`l${i}`}
          points={plot.polygon.map(([x, z]) => `${toX(x)},${toZ(z)}`).join(" ")}
          fill={TIER_COLOR[plot.tier]}
          opacity={plot.tier === "grand" ? 0.8 : 0.55}
          stroke="#0b1017"
          strokeWidth={0.5}
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
    </svg>
  );
}

function Playground() {
  const [mode, setMode] = useState<Mode>("city");
  const [view, setView] = useState<View>("3d");
  const [dials, setDials] = useState<Dials>(DEFAULTS);
  const [worldReady, setWorldReady] = useState(false);
  const viewerHost = useRef<HTMLDivElement>(null);
  const worldRef = useRef<PlaygroundWorldHandle | null>(null);
  const builtOnce = useRef(false);
  const set = (patch: Partial<Dials>) => setDials((d) => ({ ...d, ...patch }));

  const result = useMemo(() => {
    if (mode === "circuit") {
      // Built as a standalone const (not an inline literal) so the extra `elevation`/`maxGrade` dials
      // pass through cleanly whether or not the core rules type has adopted them yet.
      const circuitRules = {
        seed: dials.seed,
        ...CIRCUIT_RULES,
        winding: dials.winding,
        segmentLength: dials.segmentLength,
        compactness: dials.trackDensity,
        elevation: dials.elevation,
        maxGrade: MAX_GRADE,
      };
      const network = generateStreets(circuitRules, dials.size, dials.size);
      return { network, city: null as GeneratedCity | null };
    }
    const cityStreets = {
      gridness: dials.gridness,
      connectivity: dials.connectivity,
      branching: dials.branching,
      winding: dials.winding,
      segmentLength: dials.segmentLength,
      boulevards: dials.boulevards,
      elevation: dials.elevation,
      maxGrade: MAX_GRADE,
    };
    const city = generateCity(
      {
        seed: dials.seed,
        streets: cityStreets,
        lots: { footprint: { w: dials.lotW, d: dials.lotD }, setback: dials.setback },
        content: { landmarks: dials.landmarks, blockFill: dials.blockFill },
      },
      dials.size,
      dials.size,
    );
    return { network: city.network, city };
  }, [mode, dials]);

  // Boot the 3D viewer once (client-only; three.js loads lazily).
  useEffect(() => {
    const host = viewerHost.current;
    if (host === null) return;
    let cancelled = false;
    void import("../live/playgroundWorld")
      .then(({ createPlaygroundWorld }) => {
        if (cancelled) return;
        worldRef.current = createPlaygroundWorld(host);
        setWorldReady(true);
      })
      .catch(() => {
        setView("map");
      });
    return () => {
      cancelled = true;
      worldRef.current?.dispose();
      worldRef.current = null;
    };
  }, []);

  // Rebuild the 3D model on every regeneration. The first build grows in;
  // slider drags rebuild instantly so the feedback stays immediate.
  useEffect(() => {
    if (!worldReady) return;
    const world = worldRef.current;
    if (world === null) return;
    const city = result.city ?? { network: result.network, lots: [], plots: [], parks: [] };
    world.setCity(city, {
      seed: dials.seed,
      heightScale: mode === "circuit" ? 0.5 : 1,
      animate: !builtOnce.current,
      mode,
      elevation: dials.elevation,
      extent: dials.size,
    });
    builtOnce.current = true;
    // Screenshot tooling (jgengine-verify) waits for this flag; give the
    // first build's grow animation time to settle before declaring ready.
    const readyTimer = window.setTimeout(() => {
      document.documentElement.dataset.jgCapture = "ready";
    }, 3400);
    return () => window.clearTimeout(readyTimer);
  }, [worldReady, result, mode, dials.seed]);

  const rpc =
    mode === "circuit"
      ? `{"method":"generate_streets","seed":"${dials.seed}","mode":"circuit","halfX":${dials.size},"halfZ":${dials.size},"center":{"x":0,"y":0,"z":0},"params":{"winding":${dials.winding},"segmentLength":${dials.segmentLength},"compactness":${dials.trackDensity},"elevation":${dials.elevation},"maxGrade":${MAX_GRADE}}}`
      : `{"method":"generate_streets","seed":"${dials.seed}","mode":"net","halfX":${dials.size},"halfZ":${dials.size},"center":{"x":0,"y":0,"z":0},"params":{"gridness":${dials.gridness},"connectivity":${dials.connectivity},"branching":${dials.branching},"winding":${dials.winding},"segmentLength":${dials.segmentLength},"boulevards":${dials.boulevards},"elevation":${dials.elevation},"maxGrade":${MAX_GRADE}}}`;

  return (
    <Page>
      <PageHero
        eyebrow="Playground"
        title="Grow a city — or a race circuit — from one seed"
        blurb="This is the live street generator that ships in @jgengine/core, rendered in full 3D: streets, frontage building lots, traffic. Every drag regrows the whole city deterministically — same seed and sliders, same city, in the browser, in the editor, and in a shipped game."
      />
      <div className="mx-auto grid max-w-6xl gap-6 px-6 pb-24 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="flex gap-2">
            {(["city", "circuit"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  if (m === "circuit") set({ winding: dials.winding < 0.3 ? 0.5 : dials.winding, elevation: CIRCUIT_ELEVATION });
                  else set({ elevation: CITY_ELEVATION });
                }}
                className={`flex-1 rounded-full px-3 py-1.5 text-sm capitalize transition ${
                  mode === m ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[0.04] text-slate-400 hover:text-slate-200"
                }`}
              >
                {m === "city" ? "City" : "Race circuit"}
              </button>
            ))}
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
          <Slider label="World half-size" value={dials.size} min={140} max={400} step={20} onChange={(v) => set({ size: v })} />
          <Slider label="Block size" value={dials.segmentLength} min={50} max={160} step={5} onChange={(v) => set({ segmentLength: v })} />
          <Slider label="Winding" value={dials.winding} min={0} max={0.8} step={0.05} onChange={(v) => set({ winding: v })} />
          <Slider label="Elevation" value={dials.elevation} min={0} max={1} step={0.05} onChange={(v) => set({ elevation: v })} />
          {mode === "city" ? (
            <>
              <Slider label="Gridness" value={dials.gridness} min={0} max={1} step={0.05} onChange={(v) => set({ gridness: v })} />
              <Slider label="Connectivity" value={dials.connectivity} min={0} max={1} step={0.05} onChange={(v) => set({ connectivity: v })} />
              <Slider label="Branching" value={dials.branching} min={0} max={1} step={0.05} onChange={(v) => set({ branching: v })} />
              <Slider label="Boulevards" value={dials.boulevards} min={0} max={0.6} step={0.05} onChange={(v) => set({ boulevards: v })} />
              <Slider label="Lot frontage" value={dials.lotW} min={8} max={24} step={1} onChange={(v) => set({ lotW: v })} />
              <Slider label="Lot depth" value={dials.lotD} min={6} max={24} step={1} onChange={(v) => set({ lotD: v })} />
              <Slider label="Sidewalk setback" value={dials.setback} min={1} max={10} step={1} onChange={(v) => set({ setback: v })} />
              <Slider label="Grand plots" value={dials.landmarks} min={0} max={0.2} step={0.01} onChange={(v) => set({ landmarks: v })} />
              <Slider label="Block fill" value={dials.blockFill} min={0} max={1} step={0.05} onChange={(v) => set({ blockFill: v })} />
            </>
          ) : (
            <Slider label="Track density" value={dials.trackDensity} min={0} max={1} step={0.05} onChange={(v) => set({ trackDensity: v })} />
          )}
          <div className="text-xs leading-relaxed text-slate-500">
            {mode === "city" ? (
              <>
                <span className="text-emerald-300">{result.network.streets.length}</span> streets ·{" "}
                <span className="text-emerald-300">{result.city?.lotContent?.length ?? result.city?.lots.length ?? 0}</span> buildings
              </>
            ) : (
              <>
                A closed circuit of <span className="text-emerald-300">{result.network.edges.length}</span> welded segments — the
                same engine, loopiness at 1. Track density{" "}
                <span className="text-emerald-300">{dials.trackDensity}</span> folds the lap into its footprint: 0 keeps an open,
                flowing loop; 1 fills the interior with parallel corridors and switchbacks.
              </>
            )}
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-black/30 p-3">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Bake this exact layout into a game</p>
            <code className="block max-h-28 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-slate-400">
              bun packages/editor/src/mcp/cli.ts --game &lt;id&gt; --rpc '{rpc}' --save
            </code>
          </div>
        </div>
        <div className="relative min-h-[420px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b1017] lg:min-h-[560px]">
          <div
            ref={viewerHost}
            className={`absolute inset-0 transition-opacity duration-500 ${
              view === "3d" && worldReady ? "opacity-100" : "opacity-0"
            } ${view === "3d" ? "" : "hidden"}`}
            aria-label="3D city preview"
          />
          {view === "map" && (
            <div className="absolute inset-0">
              <StreetsSvg network={result.network} city={result.city} size={dials.size} />
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
              drag to orbit · scroll to zoom
            </p>
          )}
        </div>
      </div>
    </Page>
  );
}
