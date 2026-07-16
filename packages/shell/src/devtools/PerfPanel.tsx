import { useRef } from "react";

import { devtools, LONG_FRAME_MS, type LongFrameEvent, type PhaseStats } from "@jgengine/core/devtools/devtools";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { ms, SectionLabel, StatRow } from "./panelAtoms";
import { diagnose } from "./perfDiagnose";

const PHASE_BAR_BUDGET_MS = 16.7;

function FrameBars({ frames }: { frames: readonly number[] }) {
  return (
    <div className="flex h-10 items-end gap-px">
      {frames.map((frameMs, index) => (
        <div
          key={index}
          className={`w-1 rounded-full ${frameMs > LONG_FRAME_MS ? "bg-red-400" : "bg-cyan-400/70"}`}
          style={{ height: `${Math.min(100, (frameMs / (LONG_FRAME_MS * 2)) * 100)}%` }}
          title={`${frameMs.toFixed(1)}ms`}
        />
      ))}
    </div>
  );
}

function PhaseBars({ phases, avgSimMs }: { phases: readonly PhaseStats[]; avgSimMs: number }) {
  if (phases.length === 0) {
    return <div className="text-neutral-500">No phase samples yet.</div>;
  }
  const budget = Math.max(PHASE_BAR_BUDGET_MS, avgSimMs, ...phases.map((phase) => phase.avgMs));
  return (
    <div className="space-y-1">
      {phases.slice(0, 8).map((phase) => {
        const hot = phase.avgMs > 4 || phase.maxMs > 8;
        return (
          <div key={phase.name} className="space-y-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className={`truncate ${hot ? "text-amber-300" : "text-neutral-300"}`} title={phase.name}>
                {phase.name}
              </span>
              <span className={`shrink-0 font-mono ${hot ? "text-amber-300" : "text-neutral-100"}`}>
                {ms(phase.avgMs)}
                <span className="text-neutral-500"> avg</span>
                <span className="text-neutral-600"> · </span>
                {ms(phase.maxMs)}
                <span className="text-neutral-500"> max</span>
                <span className="text-neutral-600"> · </span>
                {phase.pctOfSim.toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={`h-full rounded-full ${hot ? "bg-gradient-to-r from-amber-400 to-amber-300" : "bg-gradient-to-r from-cyan-500 to-cyan-400/70"}`}
                style={{ width: `${Math.min(100, (phase.avgMs / budget) * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BudgetSplit({ simMs, outsideMs }: { simMs: number; outsideMs: number }) {
  const total = Math.max(1e-6, simMs + outsideMs);
  const simPct = (simMs / total) * 100;
  const outsideHot = outsideMs > simMs && outsideMs > 4;
  const simHot = simMs > 8;
  return (
    <div className="space-y-1">
      <div className="flex h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={`h-full ${simHot ? "bg-amber-400" : "bg-sky-400"}`} style={{ width: `${simPct}%` }} title={`sim ${ms(simMs)}`} />
        <div
          className={`h-full ${outsideHot ? "bg-red-500" : "bg-violet-400/80"}`}
          style={{ width: `${100 - simPct}%` }}
          title={`outside sim ${ms(outsideMs)}`}
        />
      </div>
      <div className="flex justify-between gap-2 font-mono text-[10px]">
        <span className={simHot ? "text-amber-300" : "text-sky-300"}>sim {ms(simMs)}</span>
        <span className={outsideHot ? "text-red-400" : "text-violet-300"}>outside {ms(outsideMs)}</span>
      </div>
      <div className="text-[10px] text-neutral-500">
        outside = render / React / GPU / GC / missed vsync — not measured inside the sim driver
      </div>
    </div>
  );
}

function LongFrameList({ events }: { events: readonly LongFrameEvent[] }) {
  if (events.length === 0) {
    return <div className="text-neutral-500">No long frames (&gt;{ms(LONG_FRAME_MS)}) captured yet.</div>;
  }
  const newest = [...events].reverse().slice(0, 12);
  return (
    <div className="jg-devtools-scroll max-h-40 space-y-1.5 overflow-auto">
      {newest.map((event, index) => (
        <div key={`${event.at}-${index}`} className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-red-400">{ms(event.frameMs)}</span>
            <span className="truncate text-amber-300" title={event.culprit}>
              {event.culprit}
            </span>
            <span className="shrink-0 text-neutral-500">{new Date(event.at).toLocaleTimeString()}</span>
          </div>
          <div className="mt-0.5 text-[10px] leading-snug text-neutral-300">{event.reason}</div>
          {event.phases.length > 0 ? (
            <div className="mt-0.5 font-mono text-[9px] text-neutral-500">
              {event.phases
                .slice(0, 4)
                .map((phase) => `${phase.name} ${phase.ms.toFixed(1)}`)
                .join(" · ")}
              {event.outsideMs >= 2 ? ` · outside ${event.outsideMs.toFixed(1)}` : ""}
            </div>
          ) : event.outsideMs >= 2 ? (
            <div className="mt-0.5 font-mono text-[9px] text-neutral-500">outside {event.outsideMs.toFixed(1)}</div>
          ) : null}
          {event.render !== null ? (
            <div className="mt-0.5 font-mono text-[9px] text-neutral-600">
              draws {event.render.drawCalls} · tris {event.render.triangles.toLocaleString()}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function PerfPanel({ ctx }: { ctx: GameContext }) {
  const rateRef = useRef<{ version: number; at: number; perSecond: number }>({ version: 0, at: 0, perSecond: 0 });
  const frame = devtools.frame.stats();
  const render = devtools.render.latest();
  const longs = devtools.frame.longFrames();
  const now = performance.now();
  const rate = rateRef.current;
  if (rate.at === 0) {
    rateRef.current = { version: ctx.version(), at: now, perSecond: 0 };
  } else if (now - rate.at >= 900) {
    const perSecond = ((ctx.version() - rate.version) / (now - rate.at)) * 1000;
    rateRef.current = { version: ctx.version(), at: now, perSecond };
  }
  const diagnosis = frame !== null ? diagnose(frame, longs) : null;
  return (
    <div className="jg-devtools-scroll max-h-[28rem] space-y-3 overflow-auto">
      {frame === null ? (
        <div className="text-neutral-400">Waiting for frames…</div>
      ) : (
        <>
          <FrameBars frames={frame.recentFrameMs} />
          <StatRow name="fps" value={frame.fps.toFixed(0)} alert={frame.fps < 50} />
          <StatRow name="frame avg / p95 / max" value={`${ms(frame.avgFrameMs)} / ${ms(frame.p95FrameMs)} / ${ms(frame.maxFrameMs)}`} alert={frame.p95FrameMs > LONG_FRAME_MS} />
          <StatRow name="sim avg / max" value={`${ms(frame.avgSimMs)} / ${ms(frame.maxSimMs)}`} alert={frame.avgSimMs > 8} />
          <StatRow name="outside avg / max" value={`${ms(frame.avgOutsideMs)} / ${ms(frame.maxOutsideMs)}`} alert={frame.avgOutsideMs > 12} />
          <StatRow name={`long frames (of ${frame.samples})`} value={String(frame.longFrames)} alert={frame.longFrames > 5} />
          {diagnosis !== null ? (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-snug text-amber-100">
              <span className="font-semibold text-amber-300">Why slow · </span>
              {diagnosis}
            </div>
          ) : (
            <div className="text-[10px] text-emerald-400/90">Frame budget healthy — no dominant hitch pattern.</div>
          )}
          <div className="space-y-1">
            <SectionLabel>frame budget</SectionLabel>
            <BudgetSplit simMs={frame.avgSimMs} outsideMs={frame.avgOutsideMs} />
          </div>
          <div className="space-y-1">
            <SectionLabel>sim phases (avg)</SectionLabel>
            <PhaseBars phases={frame.phases} avgSimMs={frame.avgSimMs} />
          </div>
        </>
      )}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>long frames</SectionLabel>
          {longs.length > 0 ? (
            <button
              type="button"
              className="rounded border border-neutral-700 px-1.5 py-0.5 text-[9px] text-neutral-400 hover:bg-neutral-800"
              onClick={() => devtools.frame.clearLongFrames()}
            >
              Clear
            </button>
          ) : null}
        </div>
        <LongFrameList events={longs} />
      </div>
      {render !== null ? (
        <div className="space-y-1">
          <SectionLabel>render sample</SectionLabel>
          <StatRow name="draw calls" value={String(render.drawCalls)} alert={render.drawCalls > 1000} />
          <StatRow name="triangles" value={render.triangles.toLocaleString()} />
          <StatRow name="geometries / textures" value={`${render.geometries} / ${render.textures}`} />
        </div>
      ) : null}
      <div className="space-y-1">
        <SectionLabel>probes</SectionLabel>
        <StatRow name="state notifies /s" value={rateRef.current.perSecond.toFixed(0)} alert={rateRef.current.perSecond > 90} />
        {Object.entries(devtools.probes.read()).map(([name, value]) => (
          <StatRow key={name} name={name} value={String(value)} />
        ))}
      </div>
      <div className="text-[9px] leading-snug text-neutral-600">
        Game code: measure("physics", () =&gt; …) inside onTick. Agents: snapshot().longFrames + frame.phases
      </div>
    </div>
  );
}
