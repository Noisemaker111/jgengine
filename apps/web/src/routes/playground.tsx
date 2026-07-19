import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { generateCity, type GeneratedCity } from "@jgengine/core/world/cityGenerator";
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
  landmarks: 0.06,
};

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

function StreetsSvg({ network, city, size }: { network: StreetNetwork; city: GeneratedCity | null; size: number }) {
  const view = size * 2 + 40;
  const toX = (x: number) => x + view / 2;
  const toZ = (z: number) => z + view / 2;
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
      {network.mode === "circuit" && network.streets[0] !== undefined ? (
        <g>
          <circle
            cx={toX(network.streets[0].points[0]![0])}
            cy={toZ(network.streets[0].points[0]![1])}
            r={7}
            fill="#fff"
            stroke="#0b1017"
            strokeWidth={2}
          />
          <text
            x={toX(network.streets[0].points[0]![0]) + (toX(network.streets[0].points[0]![0]) > view * 0.7 ? -12 : 12)}
            y={toZ(network.streets[0].points[0]![1]) + 4}
            fill="#f8fafc"
            fontSize={12}
            fontFamily="monospace"
            textAnchor={toX(network.streets[0].points[0]![0]) > view * 0.7 ? "end" : "start"}
          >
            START/FINISH
          </text>
        </g>
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
      const network = generateStreets(
        { seed: dials.seed, ...CIRCUIT_RULES, winding: dials.winding, segmentLength: dials.segmentLength },
        dials.size,
        dials.size,
      );
      return { network, city: null as GeneratedCity | null };
    }
    const city = generateCity(
      {
        seed: dials.seed,
        streets: {
          gridness: dials.gridness,
          connectivity: dials.connectivity,
          branching: dials.branching,
          winding: dials.winding,
          segmentLength: dials.segmentLength,
          boulevards: dials.boulevards,
        },
        lots: { footprint: { w: dials.lotW, d: dials.lotD }, setback: dials.setback },
        content: { landmarks: dials.landmarks },
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
    const city = result.city ?? { network: result.network, lots: [] };
    world.setCity(city, {
      seed: dials.seed,
      heightScale: mode === "circuit" ? 0.5 : 1,
      animate: !builtOnce.current,
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
      ? `{"method":"generate_streets","seed":"${dials.seed}","mode":"circuit","halfX":${dials.size},"halfZ":${dials.size},"center":{"x":0,"y":0,"z":0},"params":{"winding":${dials.winding},"segmentLength":${dials.segmentLength}}}`
      : `{"method":"generate_streets","seed":"${dials.seed}","mode":"net","halfX":${dials.size},"halfZ":${dials.size},"center":{"x":0,"y":0,"z":0},"params":{"gridness":${dials.gridness},"connectivity":${dials.connectivity},"branching":${dials.branching},"winding":${dials.winding},"segmentLength":${dials.segmentLength},"boulevards":${dials.boulevards}}}`;

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
                  if (m === "circuit" && dials.winding < 0.3) set({ winding: 0.5 });
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
          {mode === "city" ? (
            <>
              <Slider label="Gridness" value={dials.gridness} min={0} max={1} step={0.05} onChange={(v) => set({ gridness: v })} />
              <Slider label="Connectivity" value={dials.connectivity} min={0} max={1} step={0.05} onChange={(v) => set({ connectivity: v })} />
              <Slider label="Branching" value={dials.branching} min={0} max={1} step={0.05} onChange={(v) => set({ branching: v })} />
              <Slider label="Boulevards" value={dials.boulevards} min={0} max={0.6} step={0.05} onChange={(v) => set({ boulevards: v })} />
              <Slider label="Lot frontage" value={dials.lotW} min={8} max={24} step={1} onChange={(v) => set({ lotW: v })} />
              <Slider label="Lot depth" value={dials.lotD} min={6} max={24} step={1} onChange={(v) => set({ lotD: v })} />
              <Slider label="Sidewalk setback" value={dials.setback} min={1} max={10} step={1} onChange={(v) => set({ setback: v })} />
              <Slider label="Landmarks" value={dials.landmarks} min={0} max={0.2} step={0.01} onChange={(v) => set({ landmarks: v })} />
            </>
          ) : null}
          <div className="text-xs leading-relaxed text-slate-500">
            {mode === "city" ? (
              <>
                <span className="text-emerald-300">{result.network.streets.length}</span> streets ·{" "}
                <span className="text-emerald-300">{result.city?.lotContent?.length ?? result.city?.lots.length ?? 0}</span> buildings
              </>
            ) : (
              <>
                A closed circuit of <span className="text-emerald-300">{result.network.edges.length}</span> welded segments — the
                same engine, loopiness turned to 1.
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
