import { useSyncExternalStore } from "react";

import { formatTriangles } from "./StatusBar";
import type { PerfHistoryStore } from "./perfHistory";
import {
  latestPhases,
  samplesHaveFrameBudget,
  seriesAverage,
  seriesAverageDefined,
  sparklinePoints,
} from "./perfHistory";
import { NUMERIC } from "./theme";
import { EmptyState, IconButton } from "./ui";

const GRAPH_WIDTH = 560;
const GRAPH_HEIGHT = 96;

function Stat({ label, value, average }: { label: string; value: string; average?: string }) {
  return (
    <div className="min-w-24 rounded-[6px] border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-neutral-600">{label}</div>
      <div className={`text-[15px] font-medium text-neutral-100 ${NUMERIC}`}>{value}</div>
      {average !== undefined ? <div className={`text-[9px] text-neutral-500 ${NUMERIC}`}>avg {average}</div> : null}
    </div>
  );
}

function BudgetBar({ simMs, outsideMs }: { simMs: number; outsideMs: number }) {
  const total = Math.max(1e-6, simMs + outsideMs);
  const simPct = (simMs / total) * 100;
  return (
    <div className="mt-2 space-y-1">
      <div className="text-[9px] uppercase tracking-wider text-neutral-600">Frame budget (sim vs outside)</div>
      <div className="flex h-2 overflow-hidden rounded-[4px] border border-white/[0.07] bg-black/25">
        <div className="h-full bg-sky-400" style={{ width: `${simPct}%` }} title={`sim ${simMs.toFixed(2)} ms`} />
        <div
          className="h-full bg-amber-400/80"
          style={{ width: `${100 - simPct}%` }}
          title={`outside ${outsideMs.toFixed(2)} ms`}
        />
      </div>
      <div className={`flex justify-between text-[9px] text-neutral-500 ${NUMERIC}`}>
        <span className="text-sky-300">sim {simMs.toFixed(2)} ms</span>
        <span className="text-amber-300">outside {outsideMs.toFixed(2)} ms</span>
      </div>
      <div className="text-[9px] leading-snug text-neutral-600">
        Outside = frame − sim (render / React / GPU / GC). Same numbers as F2+D / debug_snapshot.
      </div>
    </div>
  );
}

/**
 * Profiler dock tab over the real {@link PerfProbe} sample history: frame-time graph, current and
 * average values, authoring-cost series when the probe reports one, sim/outside budget when
 * `devtools.frame` has recorded frames, and JS heap memory when the browser exposes
 * `performance.memory`. Series the host cannot measure are omitted entirely rather than fabricated.
 */
export function ProfilerPanel({ history }: { history: PerfHistoryStore }) {
  const samples = useSyncExternalStore(history.subscribe, history.getSamples, history.getSamples);
  const paused = useSyncExternalStore(history.subscribe, history.isPaused, history.isPaused);

  const frameSeries = samples.map((sample) => sample.frameMs);
  const authoringSeries = samples.map((sample) => sample.authoringMs ?? 0);
  const memorySeries = samples.map((sample) => sample.memoryMb ?? 0);
  const simSeries = samples.map((sample) => sample.simMs ?? 0);
  const outsideSeries = samples.map((sample) => sample.outsideMs ?? 0);
  const hasAuthoring = authoringSeries.some((value) => value > 0);
  const hasMemory = samples.some((sample) => sample.memoryMb !== undefined);
  const hasBudget = samplesHaveFrameBudget(samples);
  const phases = latestPhases(samples);
  const latest = samples[samples.length - 1];
  const maxFrame = Math.max(33.4, ...frameSeries, ...(hasBudget ? [...simSeries, ...outsideSeries] : []));
  const maxMemory = hasMemory ? Math.max(16, ...memorySeries) : 0;
  const latestSim = latest?.simMs;
  const latestOutside = latest?.outsideMs;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-white/[0.06] px-2">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">Frame time</span>
        <span className={`text-[10px] text-neutral-600 ${NUMERIC}`}>{samples.length} samples · 500ms window</span>
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            icon={paused ? "play" : "pause"}
            label={paused ? "Resume sampling" : "Pause sampling"}
            size={12}
            active={paused}
            onClick={() => history.setPaused(!paused)}
          />
          <IconButton icon="trash" label="Clear samples" size={12} onClick={() => history.clear()} disabled={samples.length === 0} />
        </div>
      </div>
      {samples.length === 0 ? (
        <EmptyState
          icon="gauge"
          title="No samples yet"
          description="The in-viewport probe publishes a real frame sample every 500ms while the editor renders."
        />
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 overflow-auto p-3">
          <div className="min-w-0 flex-1">
            <svg
              viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
              preserveAspectRatio="none"
              className="h-full max-h-40 w-full rounded-[6px] border border-white/[0.07] bg-black/25"
              role="img"
              aria-label="Frame time graph"
            >
              {/* 16.7ms (60fps) and 33.3ms (30fps) budget guides. */}
              <line x1={0} x2={GRAPH_WIDTH} y1={GRAPH_HEIGHT - (16.7 / maxFrame) * GRAPH_HEIGHT} y2={GRAPH_HEIGHT - (16.7 / maxFrame) * GRAPH_HEIGHT} stroke="rgba(74,222,128,0.25)" strokeDasharray="4 4" />
              <line x1={0} x2={GRAPH_WIDTH} y1={GRAPH_HEIGHT - (33.3 / maxFrame) * GRAPH_HEIGHT} y2={GRAPH_HEIGHT - (33.3 / maxFrame) * GRAPH_HEIGHT} stroke="rgba(251,191,36,0.25)" strokeDasharray="4 4" />
              <polyline points={sparklinePoints(frameSeries, GRAPH_WIDTH, GRAPH_HEIGHT, maxFrame)} fill="none" stroke="#22d3ee" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              {hasBudget ? (
                <>
                  <polyline points={sparklinePoints(simSeries, GRAPH_WIDTH, GRAPH_HEIGHT, maxFrame)} fill="none" stroke="#38bdf8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  <polyline points={sparklinePoints(outsideSeries, GRAPH_WIDTH, GRAPH_HEIGHT, maxFrame)} fill="none" stroke="#fbbf24" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                </>
              ) : null}
              {hasAuthoring ? (
                <polyline points={sparklinePoints(authoringSeries, GRAPH_WIDTH, GRAPH_HEIGHT, maxFrame)} fill="none" stroke="#a78bfa" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ) : null}
            </svg>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-[9px] text-neutral-500">
              <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-cyan-400" /> frame ms</span>
              {hasBudget ? (
                <>
                  <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-sky-400" /> sim ms</span>
                  <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-amber-400" /> outside ms</span>
                </>
              ) : null}
              {hasAuthoring ? <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-violet-400" /> authoring ms</span> : null}
              <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-emerald-400/60" /> 60 fps budget</span>
              <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-amber-400/60" /> 30 fps budget</span>
            </div>
            {hasBudget && latestSim !== undefined && latestOutside !== undefined ? (
              <BudgetBar simMs={latestSim} outsideMs={latestOutside} />
            ) : (
              <div className="mt-2 text-[9px] leading-snug text-neutral-600">
                Sim / outside split appears when the runtime FrameDriver records frames (Play mode / live tick) —
                same source as debug_snapshot. Edit-only idle leaves this series omitted.
              </div>
            )}
            {phases.length > 0 ? (
              <div className="mt-3 space-y-1">
                <div className="text-[9px] uppercase tracking-wider text-neutral-600">Sim phases (avg)</div>
                <div className="flex flex-wrap gap-1.5">
                  {phases.map((phase) => (
                    <div
                      key={phase.name}
                      className={`rounded border border-white/[0.07] bg-white/[0.02] px-2 py-1 text-[10px] text-neutral-300 ${NUMERIC}`}
                    >
                      <span className="text-neutral-500">{phase.name}</span> {phase.avgMs.toFixed(2)} ms
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {hasMemory ? (
              <div className="mt-3">
                <div className="mb-1 text-[9px] uppercase tracking-wider text-neutral-600">JS heap (browser)</div>
                <svg
                  viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
                  preserveAspectRatio="none"
                  className="h-20 w-full rounded-[6px] border border-white/[0.07] bg-black/25"
                  role="img"
                  aria-label="JS heap memory graph"
                >
                  <polyline
                    points={sparklinePoints(memorySeries, GRAPH_WIDTH, GRAPH_HEIGHT, maxMemory)}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col gap-1.5">
            <Stat
              label="FPS"
              value={latest === undefined ? "—" : latest.active ? latest.fps.toFixed(0) : "idle"}
              average={`${seriesAverage(samples.map((sample) => sample.fps)).toFixed(0)}`}
            />
            <Stat
              label="Frame"
              value={latest === undefined ? "—" : `${latest.frameMs.toFixed(2)} ms`}
              average={`${seriesAverage(frameSeries).toFixed(2)} ms`}
            />
            {hasBudget ? (
              <>
                <Stat
                  label="Sim"
                  value={latestSim === undefined ? "—" : `${latestSim.toFixed(2)} ms`}
                  average={`${seriesAverageDefined(samples.map((sample) => sample.simMs)).toFixed(2)} ms`}
                />
                <Stat
                  label="Outside"
                  value={latestOutside === undefined ? "—" : `${latestOutside.toFixed(2)} ms`}
                  average={`${seriesAverageDefined(samples.map((sample) => sample.outsideMs)).toFixed(2)} ms`}
                />
              </>
            ) : null}
            <Stat label="Draw calls" value={latest === undefined ? "—" : String(latest.drawCalls)} />
            <Stat label="Triangles" value={latest === undefined ? "—" : formatTriangles(latest.triangles)} />
            {hasAuthoring ? (
              <Stat
                label="Authoring"
                value={`${(latest?.authoringMs ?? 0).toFixed(1)} ms`}
                average={`${seriesAverage(authoringSeries).toFixed(1)} ms`}
              />
            ) : null}
            {hasMemory ? (
              <Stat
                label="Heap"
                value={`${(latest?.memoryMb ?? 0).toFixed(1)} MB`}
                average={`${seriesAverage(memorySeries).toFixed(1)} MB`}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
