import { useCallback, useEffect, useState } from "react";

import { cn } from "@/components/ui/cn";
import type { ReadyWorldViewModel } from "@/runtime/worldViewModel";
import { subscribePlayerPosition } from "@/runtime/playerPosition";
import {
  buildFpsChartPath,
  formatPerformanceDiagnosticReport,
  frameMsToEffectiveFps,
  FPS_HISTORY_SECONDS,
  FRAME_TIME_RING_SIZE,
  inferPerformanceDiagnosis,
  resolveFpsHistoryIndexAtX,
  setPerformanceDiagnosticContext,
  togglePerformanceDiagnosticVisible,
  usePerformanceDiagnosticSnapshot,
  usePerformanceDiagnosticVisible,
} from "@/runtime/runtimePerformanceDiagnostics";
import {
  PROFILE_RING_SIZE,
  type PerformanceProfileOffender,
  usePerformanceProfileOffenders,
} from "@/runtime/runtimePerformanceProfiler";
import { UI_LAYER } from "@/runtime/uiLayers";

const CHART_WIDTH = 280;
const CHART_HEIGHT = 72;
const CHART_MAX_FPS = 120;

interface PerformanceDiagnosticOverlayProps {
  world: ReadyWorldViewModel;
  className?: string;
}

interface ChartHoverState {
  secondsAgo: number;
  fps: number;
  x: number;
  y: number;
}

function formatNumber(value: number, digits = 1): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function fpsTone(fps: number): string {
  if (fps >= 55) return "text-emerald-300";
  if (fps >= 30) return "text-amber-300";
  return "text-rose-300";
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[11px] leading-tight">
      <span className="text-white/55">{label}</span>
      <span className="font-mono text-white/90">{value}</span>
    </div>
  );
}

function ProfileOffenderRow({
  row,
  maxAvgMs,
}: {
  row: PerformanceProfileOffender;
  maxAvgMs: number;
}) {
  const barPct = maxAvgMs > 0 ? Math.min(100, (row.avgMs / maxAvgMs) * 100) : 0;
  const callsLabel = row.callsPerFrame > 1.05 ? ` ×${row.callsPerFrame.toFixed(0)}` : "";

  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between gap-2 text-[10px] leading-tight">
        <span className="truncate text-white/80">
          {row.label}
          {callsLabel}
        </span>
        <span className="shrink-0 font-mono text-white/65">
          {formatNumber(row.avgMs, 2)}ms · {formatNumber(row.sharePct, 0)}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-white/10">
        <div
          className="h-full rounded bg-brand-teal/75"
          style={{ width: `${barPct}%` }}
        />
      </div>
      <p className="text-[9px] text-white/35">
        p95 {formatNumber(row.p95Ms, 2)}ms · max {formatNumber(row.maxMs, 2)}ms
      </p>
    </div>
  );
}

function overlayButtonClass(active = false): string {
  return cn(
    "rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors",
    active
      ? "border-brand-teal/60 bg-brand-teal/20 text-brand-teal"
      : "border-white/15 bg-white/8 text-white/80 hover:border-white/25 hover:bg-white/12",
  );
}

export function PerformanceDiagnosticOverlay({ world, className }: PerformanceDiagnosticOverlayProps) {
  const visible = usePerformanceDiagnosticVisible();
  const snapshot = usePerformanceDiagnosticSnapshot();
  const offenders = usePerformanceProfileOffenders();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [chartHover, setChartHover] = useState<ChartHoverState | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "F3") return;
      if (
        event.target instanceof HTMLInputElement
        || event.target instanceof HTMLTextAreaElement
        || (event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      togglePerformanceDiagnosticVisible();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const syncContext = (position: { x: number; z: number }) => {
      setPerformanceDiagnosticContext({
        gameId: world.routeGameId,
        rackCount: world.racks.length,
        presenceCount: world.worldPresences.length,
        playerX: position.x,
        playerZ: position.z,
      });
    };
    syncContext(world.engine.getState().player.position);
    const unsubscribe = subscribePlayerPosition(world.engine, syncContext);
    return () => {
      unsubscribe();
      setPerformanceDiagnosticContext(null);
    };
  }, [
    world.engine,
    world.racks.length,
    world.routeGameId,
    world.worldPresences.length,
  ]);

  useEffect(() => {
    if (copyState === "idle") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const copyReport = useCallback(async () => {
    const report = formatPerformanceDiagnosticReport(snapshot);
    try {
      await navigator.clipboard.writeText(report);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }, [snapshot]);

  const updateChartHover = useCallback((clientX: number, clientY: number, rect: DOMRect) => {
    const x = ((clientX - rect.left) / rect.width) * CHART_WIDTH;
    const historyIndex = resolveFpsHistoryIndexAtX(snapshot.fpsHistory.length, x, CHART_WIDTH);
    if (historyIndex === null) {
      setChartHover(null);
      return;
    }

    const fps = snapshot.fpsHistory[historyIndex];
    const secondsAgo = snapshot.fpsHistory.length - historyIndex;
    const clampedFps = Math.min(fps, CHART_MAX_FPS);
    setChartHover({
      secondsAgo,
      fps,
      x: (x / CHART_WIDTH) * rect.width,
      y: rect.height - (clampedFps / CHART_MAX_FPS) * rect.height,
    });
  }, [snapshot.fpsHistory]);

  if (!visible) return null;

  const chartPath = buildFpsChartPath(snapshot.fpsHistory, CHART_WIDTH, CHART_HEIGHT, CHART_MAX_FPS);
  const chartFillPath = chartPath
    ? `${chartPath
      .split(" ")
      .map((point, index) => `${index === 0 ? "M" : "L"}${point}`)
      .join(" ")} L${CHART_WIDTH},${CHART_HEIGHT} L0,${CHART_HEIGHT} Z`
    : "";
  const historyLabel = snapshot.fpsHistory.length > 0
    ? `${snapshot.fpsHistory.length}s / ${FPS_HISTORY_SECONDS}s`
    : `collecting…`;
  const frameStats = snapshot.frameTimeStats;
  const effectiveFps = frameMsToEffectiveFps(frameStats.p50Ms);
  const smoothedMisleading = effectiveFps > 0 && snapshot.fps - effectiveFps >= 15;
  const jankTotal = frameStats.sampleCount;
  const jankOver60Pct = jankTotal > 0 ? (frameStats.over60FpsBudget / jankTotal) * 100 : 0;
  const jankOver30Pct = jankTotal > 0 ? (frameStats.over30FpsBudget / jankTotal) * 100 : 0;
  const topOffender = offenders[0]?.label ?? null;
  const maxOffenderAvgMs = offenders[0]?.avgMs ?? 1;
  const visibleOffenders = offenders.filter((row) => row.avgMs >= 0.02).slice(0, 10);

  return (
    <div
      data-ui-layer="performance-diagnostics"
      className={cn(
        "pointer-events-auto max-h-[calc(100vh-2rem)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-white/10 bg-[#0b1210]/92 p-3 font-mono text-white shadow-lg backdrop-blur-sm",
        className,
      )}
      style={{ zIndex: UI_LAYER.hudRaised }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-teal">Diagnostics</p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={overlayButtonClass(copyState === "copied")}
            onClick={() => void copyReport()}
          >
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy report"}
          </button>
          <p className="text-[10px] text-white/45">F3</p>
        </div>
      </div>

      <p className="mb-2 rounded border border-white/8 bg-black/30 px-2 py-1.5 text-[10px] leading-snug text-white/70">
        {inferPerformanceDiagnosis(snapshot, topOffender)}
      </p>

      <div className="mb-3 rounded border border-white/8 bg-black/35 p-2">
        <div className="mb-2 flex items-center justify-between text-[10px] text-white/45">
          <span className="font-bold uppercase tracking-wide text-white/55">Frame offenders</span>
          <span>last {PROFILE_RING_SIZE} frames</span>
        </div>
        {visibleOffenders.length > 0 ? (
          <div className="space-y-2">
            {visibleOffenders.map((row) => (
              <ProfileOffenderRow key={row.id} row={row} maxAvgMs={maxOffenderAvgMs} />
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-white/40">Collecting per-section timings…</p>
        )}
      </div>

      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className={cn("text-3xl font-bold leading-none", fpsTone(effectiveFps))}>
            {formatNumber(effectiveFps, 0)}
            <span className="ml-1 text-sm font-normal text-white/50">fps eff.</span>
          </p>
          <p className={cn("mt-1 text-[11px]", smoothedMisleading ? "text-amber-300/90" : "text-white/55")}>
            {formatNumber(snapshot.fps, 0)} smoothed · {formatNumber(snapshot.frameMs, 1)} ms frame
          </p>
        </div>
        <div className="text-right text-[10px] leading-snug text-white/55">
          <p>min {formatNumber(snapshot.fpsMin, 0)}</p>
          <p>avg {formatNumber(snapshot.fpsAvg, 0)}</p>
          <p>max {formatNumber(snapshot.fpsMax, 0)}</p>
        </div>
      </div>

      <div className="mb-3 rounded border border-white/8 bg-black/35 p-2">
        <div className="mb-1 flex items-center justify-between text-[10px] text-white/45">
          <span>FPS — last {FPS_HISTORY_SECONDS}s</span>
          <span>{historyLabel}</span>
        </div>
        <div
          className="relative"
          onMouseLeave={() => setChartHover(null)}
          onMouseMove={(event) => updateChartHover(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())}
        >
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            className="h-[4.5rem] w-full cursor-crosshair"
            role="img"
            aria-label={`FPS chart over the last ${FPS_HISTORY_SECONDS} seconds`}
          >
            {[30, 60, 90, 120].map((mark) => {
              const y = CHART_HEIGHT - (mark / CHART_MAX_FPS) * CHART_HEIGHT;
              return (
                <g key={mark}>
                  <line x1={0} y1={y} x2={CHART_WIDTH} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                  <text x={4} y={y - 2} fill="rgba(255,255,255,0.35)" fontSize={8}>
                    {mark}
                  </text>
                </g>
              );
            })}
            {chartFillPath ? (
              <path d={chartFillPath} fill="rgba(95,194,168,0.18)" stroke="none" />
            ) : null}
            {chartPath ? (
              <polyline
                fill="none"
                stroke="#5fc2a8"
                strokeWidth={1.75}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={chartPath}
              />
            ) : (
              <text x={CHART_WIDTH / 2} y={CHART_HEIGHT / 2} fill="rgba(255,255,255,0.35)" fontSize={10} textAnchor="middle">
                Waiting for samples…
              </text>
            )}
          </svg>
          {chartHover ? (
            <>
              <div
                className="pointer-events-none absolute top-0 bottom-0 w-px bg-white/35"
                style={{ left: chartHover.x }}
              />
              <div
                className="pointer-events-none absolute rounded border border-white/15 bg-[#0b1210]/95 px-1.5 py-0.5 text-[10px] text-white/85 shadow"
                style={{
                  left: Math.min(Math.max(chartHover.x - 36, 0), CHART_WIDTH - 72),
                  top: Math.max(chartHover.y - 28, 0),
                }}
              >
                {chartHover.secondsAgo}s ago · {formatNumber(chartHover.fps, 0)} fps
              </div>
            </>
          ) : null}
        </div>
        <p className="mt-1 text-[10px] text-white/40">Hover chart to inspect a second</p>
      </div>

      <div className="space-y-1.5 border-t border-white/8 pt-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">
          Frame time — last {frameStats.sampleCount}/{FRAME_TIME_RING_SIZE} frames
        </p>
        <StatRow label="p50 / p95 / p99" value={`${formatNumber(frameStats.p50Ms, 1)} / ${formatNumber(frameStats.p95Ms, 1)} / ${formatNumber(frameStats.p99Ms, 1)} ms`} />
        <StatRow label="Worst frame" value={`${formatNumber(frameStats.worstMs, 1)} ms`} />
        <StatRow
          label="Missed 60 fps budget"
          value={`${frameStats.over60FpsBudget} (${formatNumber(jankOver60Pct, 0)}%)`}
        />
        <StatRow
          label="Missed 30 fps budget"
          value={`${frameStats.over30FpsBudget} (${formatNumber(jankOver30Pct, 0)}%)`}
        />
        <StatRow label="Severe spikes (>50ms)" value={String(frameStats.overSevere)} />
        {snapshot.worstFpsDips.length > 0 ? (
          <StatRow
            label="Worst seconds"
            value={snapshot.worstFpsDips
              .map((dip) => `${dip.secondsAgo}s ${formatNumber(dip.fps, 0)}`)
              .join(" · ")}
          />
        ) : null}
      </div>

      <div className="mt-2 space-y-1.5 border-t border-white/8 pt-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">Renderer</p>
        <StatRow label="Draw calls" value={String(snapshot.render.calls)} />
        <StatRow label="Triangles" value={snapshot.render.triangles.toLocaleString()} />
        <StatRow label="Geometries" value={String(snapshot.render.geometries)} />
        <StatRow label="Textures" value={String(snapshot.render.textures)} />
      </div>

      <div className="mt-2 space-y-1.5 border-t border-white/8 pt-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">Display</p>
        <StatRow
          label="Viewport"
          value={`${snapshot.display.width}×${snapshot.display.height} @${formatNumber(snapshot.display.dpr, 2)}x`}
        />
        <StatRow label="Pointer lock" value={snapshot.display.pointerLocked ? "yes" : "no"} />
        <StatRow label="Tab visible" value={snapshot.display.tabVisible ? "yes" : "no"} />
        {snapshot.jsHeapMb !== null ? (
          <StatRow
            label="JS heap"
            value={
              snapshot.jsHeapLimitMb !== null
                ? `${formatNumber(snapshot.jsHeapMb, 0)} / ${formatNumber(snapshot.jsHeapLimitMb, 0)} MB`
                : `${formatNumber(snapshot.jsHeapMb, 0)} MB`
            }
          />
        ) : null}
      </div>

      {snapshot.context ? (
        <div className="mt-2 space-y-1.5 border-t border-white/8 pt-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">World</p>
          <StatRow label="Racks" value={String(snapshot.context.rackCount)} />
          <StatRow label="Presences" value={String(snapshot.context.presenceCount)} />
          <StatRow
            label="Player"
            value={`${formatNumber(snapshot.context.playerX, 1)}, ${formatNumber(snapshot.context.playerZ, 1)}`}
          />
          <StatRow label="Game" value={snapshot.context.gameId.slice(0, 8)} />
        </div>
      ) : null}
    </div>
  );
}