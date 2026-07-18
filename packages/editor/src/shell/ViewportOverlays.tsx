import { memo, useEffect, useMemo, useRef, useState } from "react";

import type { EditorDocument } from "@jgengine/core/editor/index";

import { classifyEditorPerf } from "../perfPill";
import type { EditorHostApi } from "../session";
import { getCameraTelemetry } from "./cameraTelemetry";
import { Icon } from "./icons";
import { formatTriangles, usePerfSample } from "./StatusBar";
import { FOCUS_RING, NUMERIC } from "./theme";
import { IconButton } from "./ui";

const OVERLAY_CARD =
  "rounded-[7px] border border-white/[0.08] bg-[#0e1014]/85 shadow-lg shadow-black/40 backdrop-blur-md";

/**
 * Top-left viewport performance readout backed by the real in-canvas {@link PerfProbe} samples.
 * Rows without data (no sample yet) simply don't render — nothing is fabricated.
 */
export const PerformanceOverlay = memo(function PerformanceOverlay({ api }: { api: EditorHostApi }) {
  const perf = usePerfSample(api);
  if (perf === null) return null;
  const tone = classifyEditorPerf(perf);
  // A throttled render-on-demand window reports huge frame gaps and a reset draw counter;
  // show placeholders instead of implying a 2,000ms frame.
  const stale = tone === "idle" && perf.drawCalls === 0;
  const rows: [string, string][] = [
    ["FPS", tone === "idle" ? "idle" : perf.fps.toFixed(0)],
    ["Frame", stale ? "—" : `${perf.frameMs.toFixed(2)} ms`],
    ["Draw calls", stale ? "—" : String(perf.drawCalls)],
    ["Tris", stale ? "—" : formatTriangles(perf.triangles)],
  ];
  if (perf.authoringMs !== undefined && perf.authoringMs > 0) {
    rows.push(["Authoring", `${perf.authoringMs.toFixed(1)} ms`]);
  }
  return (
    <div className={`pointer-events-auto absolute left-2.5 top-2.5 z-30 w-36 p-2 ${OVERLAY_CARD}`}>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <span className="text-[10px] text-neutral-500">{label}</span>
            <span
              className={`text-right text-[10px] ${NUMERIC} ${
                label === "FPS" ? (tone === "busy" ? "text-rose-300" : tone === "healthy" ? "text-emerald-300" : "text-neutral-400") : "text-neutral-300"
              }`}
            >
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

const AXES: { axis: "x" | "y" | "z"; color: string }[] = [
  { axis: "x", color: "#f87171" },
  { axis: "y", color: "#4ade80" },
  { axis: "z", color: "#60a5fa" },
];

const WIDGET_SIZE = 84;
const WIDGET_RADIUS = 30;

/**
 * Bottom-left orientation axis widget. Reads the camera basis published by the in-canvas probe on
 * its own rAF loop and mutates SVG attributes directly, so orbiting never rerenders React.
 */
export const OrientationWidget = memo(function OrientationWidget() {
  const svgRef = useRef<SVGSVGElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const telemetry = getCameraTelemetry();
    let lastVersion = -1;
    let frame = 0;
    const center = WIDGET_SIZE / 2;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (telemetry.version === lastVersion) return;
      lastVersion = telemetry.version;
      const svg = svgRef.current;
      if (svg === null) return;
      const basis: Record<"x" | "y" | "z", { sx: number; sy: number; depth: number }> = {
        x: { sx: telemetry.rightX, sy: telemetry.upX, depth: telemetry.forwardX },
        y: { sx: telemetry.rightY, sy: telemetry.upY, depth: telemetry.forwardY },
        z: { sx: telemetry.rightZ, sy: telemetry.upZ, depth: telemetry.forwardZ },
      };
      for (const { axis } of AXES) {
        const line = svg.querySelector<SVGLineElement>(`[data-axis-line="${axis}"]`);
        const dot = svg.querySelector<SVGCircleElement>(`[data-axis-dot="${axis}"]`);
        const text = svg.querySelector<SVGTextElement>(`[data-axis-label="${axis}"]`);
        if (line === null || dot === null || text === null) continue;
        const { sx, sy, depth } = basis[axis];
        const endX = center + sx * WIDGET_RADIUS;
        const endY = center - sy * WIDGET_RADIUS;
        line.setAttribute("x2", endX.toFixed(1));
        line.setAttribute("y2", endY.toFixed(1));
        dot.setAttribute("cx", endX.toFixed(1));
        dot.setAttribute("cy", endY.toFixed(1));
        text.setAttribute("x", (center + sx * (WIDGET_RADIUS + 8)).toFixed(1));
        text.setAttribute("y", (center - sy * (WIDGET_RADIUS + 8) + 3).toFixed(1));
        const toward = depth < 0;
        const opacity = toward ? "1" : "0.45";
        line.setAttribute("opacity", opacity);
        dot.setAttribute("opacity", opacity);
        text.setAttribute("opacity", opacity);
      }
      const readout = readoutRef.current;
      if (readout !== null) {
        const az = ((telemetry.azimuth * 180) / Math.PI + 360) % 360;
        const el = (telemetry.elevation * 180) / Math.PI;
        readout.textContent = `${az.toFixed(0)}° az · ${el.toFixed(0)}° el`;
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className={`pointer-events-auto absolute bottom-2.5 left-2.5 z-30 flex flex-col items-center p-1.5 ${OVERLAY_CARD}`}>
      <svg ref={svgRef} width={WIDGET_SIZE} height={WIDGET_SIZE} viewBox={`0 0 ${WIDGET_SIZE} ${WIDGET_SIZE}`} aria-label="Camera orientation axes" role="img">
        <circle cx={WIDGET_SIZE / 2} cy={WIDGET_SIZE / 2} r={WIDGET_RADIUS + 3} fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.06)" />
        {AXES.map(({ axis, color }) => (
          <g key={axis}>
            <line data-axis-line={axis} x1={WIDGET_SIZE / 2} y1={WIDGET_SIZE / 2} x2={WIDGET_SIZE / 2} y2={WIDGET_SIZE / 2} stroke={color} strokeWidth={1.5} />
            <circle data-axis-dot={axis} cx={WIDGET_SIZE / 2} cy={WIDGET_SIZE / 2} r={2.5} fill={color} />
            <text data-axis-label={axis} x={WIDGET_SIZE / 2} y={WIDGET_SIZE / 2} textAnchor="middle" fontSize={8} fill={color} className="uppercase">
              {axis}
            </text>
          </g>
        ))}
      </svg>
      <div ref={readoutRef} className={`text-[9px] text-neutral-500 ${NUMERIC}`} />
    </div>
  );
});

/**
 * Top-right collapsible viewport utility panel: real per-kind object counts from the live document
 * plus camera framing actions. Deliberately not a minimap — no fake imagery.
 */
export function ViewportUtilityPanel({
  document,
  api,
  selectionCount,
}: {
  document: EditorDocument;
  api: EditorHostApi;
  selectionCount: number;
}) {
  const [open, setOpen] = useState(true);
  const counts = useMemo(() => {
    const byKind = new Map<string, number>();
    const bump = (kind: string) => byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
    for (const marker of document.markers) bump(marker.kind);
    for (const volume of document.volumes) bump(volume.kind);
    for (const path of document.paths) bump(path.kind);
    for (let index = 0; index < document.annotations.length; index += 1) bump("note");
    return [...byKind.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [document]);

  return (
    <div className={`pointer-events-auto absolute right-2.5 top-2.5 z-30 w-44 ${OVERLAY_CARD}`}>
      <div className="flex h-7 items-center gap-1.5 px-2">
        <Icon name="layers" size={12} className="text-neutral-500" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Scene overview</span>
        <button
          type="button"
          aria-label={open ? "Collapse scene overview" : "Expand scene overview"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={`ml-auto flex h-5 w-5 items-center justify-center rounded-[4px] text-neutral-500 transition-colors hover:bg-white/[0.07] hover:text-neutral-200 ${FOCUS_RING}`}
        >
          <Icon name={open ? "chevronDown" : "chevronRight"} size={10} />
        </button>
      </div>
      {open ? (
        <div className="border-t border-white/[0.06] p-2">
          {counts.length === 0 ? (
            <div className="py-1 text-[10px] text-neutral-600">No authored objects yet.</div>
          ) : (
            <div className="space-y-0.5">
              {counts.map(([kind, count]) => (
                <div key={kind} className="flex items-center justify-between text-[10px]">
                  <span className="truncate text-neutral-400">{kind}</span>
                  <span className={`text-neutral-300 ${NUMERIC}`}>{count}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 flex gap-1">
            <button
              type="button"
              onClick={() => api.handle({ method: "camera_frame" })}
              className={`flex-1 rounded-[5px] border border-white/[0.07] bg-[#191d24] px-2 py-1 text-[10px] text-neutral-300 transition-colors hover:bg-[#1f242d] ${FOCUS_RING}`}
            >
              Frame all
            </button>
            <IconButton
              icon="target"
              label="Frame selection"
              disabled={selectionCount === 0}
              onClick={() => {
                const id = api.getSession().getState().selection[0];
                if (id !== undefined) api.handle({ method: "camera_goto", id });
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
