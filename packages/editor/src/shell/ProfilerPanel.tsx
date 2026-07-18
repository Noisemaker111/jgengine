import { useSyncExternalStore } from "react";

import { formatTriangles } from "./StatusBar";
import type { PerfHistoryStore } from "./perfHistory";
import { seriesAverage, sparklinePoints } from "./perfHistory";
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

/**
 * Profiler dock tab over the real {@link PerfProbe} sample history: frame-time graph, current and
 * average values, and authoring-cost series when the probe reports one. Series the host cannot
 * measure (CPU/GPU split, memory) are omitted entirely rather than fabricated.
 */
export function ProfilerPanel({ history }: { history: PerfHistoryStore }) {
  const samples = useSyncExternalStore(history.subscribe, history.getSamples, history.getSamples);
  const paused = useSyncExternalStore(history.subscribe, history.isPaused, history.isPaused);

  const frameSeries = samples.map((sample) => sample.frameMs);
  const authoringSeries = samples.map((sample) => sample.authoringMs ?? 0);
  const hasAuthoring = authoringSeries.some((value) => value > 0);
  const latest = samples[samples.length - 1];
  const maxFrame = Math.max(33.4, ...frameSeries);

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
              {hasAuthoring ? (
                <polyline points={sparklinePoints(authoringSeries, GRAPH_WIDTH, GRAPH_HEIGHT, maxFrame)} fill="none" stroke="#a78bfa" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ) : null}
            </svg>
            <div className="mt-1 flex items-center gap-3 text-[9px] text-neutral-500">
              <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-cyan-400" /> frame ms</span>
              {hasAuthoring ? <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-violet-400" /> authoring ms</span> : null}
              <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-emerald-400/60" /> 60 fps budget</span>
              <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-amber-400/60" /> 30 fps budget</span>
            </div>
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
            <Stat label="Draw calls" value={latest === undefined ? "—" : String(latest.drawCalls)} />
            <Stat label="Triangles" value={latest === undefined ? "—" : formatTriangles(latest.triangles)} />
            {hasAuthoring ? (
              <Stat
                label="Authoring"
                value={`${(latest?.authoringMs ?? 0).toFixed(1)} ms`}
                average={`${seriesAverage(authoringSeries).toFixed(1)} ms`}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
