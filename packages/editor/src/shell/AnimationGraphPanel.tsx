import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { AnimCondition, AnimParamValue, AnimState, AnimTransition } from "@jgengine/core/anim/animGraph";
import type { EditorSession } from "@jgengine/core/editor/index";
import { markerCatalogId } from "@jgengine/core/world/authoredObjects";

import type { EditorAssetEntry } from "../AssetBrowser";
import {
  animationMetaPatch,
  clearAnimGraph,
  effectiveAnimGraph,
  readAnimationSetting,
  setTransitionDuration,
  storeAnimGraph,
  type AnimationSetting,
} from "../modelAnimationAuthoring";
import type { EditorUiStore } from "../uiStore";
import { shallowArrayEqual, useStoreSelector } from "../useStoreSelector";
import {
  graphParamControls,
  graphTriggers,
  MAX_PREVIEW_SECONDS,
  recordTrigger,
  simulateGraphPreview,
  type GraphPreviewFrame,
  type GraphPreviewTrigger,
} from "./animGraphPreview";
import { initialClipPreviewState } from "./clipPreview";
import { FOCUS_RING, INPUT_CLS, NUMERIC } from "./theme";
import { EmptyState, IconButton } from "./ui";

const SOURCE_LABEL = {
  authored: "Stored on this placement",
  locomotion: "Built from the placement's states and one-shots",
  auto: "Derived from the rig's clip names",
} as const;

function conditionText(condition: AnimCondition): string {
  return `${condition.param} ${condition.op} ${String(condition.value)}`;
}

function stateClips(state: AnimState): string {
  if (state.kind === "clip") return state.clip;
  if (state.kind === "blend1D") return state.points.map((point) => `${point.clip}@${point.at}`).join(" · ");
  return state.points.map((point) => `${point.clip}@${point.at[0]},${point.at[1]}`).join(" · ");
}

/**
 * Graph mode of the Animation dock: the selected placement's animation graph (layers, states,
 * transitions), a scrubbed preview driven by the headless graph runtime and shown on the rig in the
 * viewport, trigger buttons that record presses on the timeline, and crossfade editing that stores
 * the graph on the placement as an undoable edit.
 *
 * @internal
 */
export function AnimationGraphPanel({
  session,
  ui,
  rigged,
}: {
  session: EditorSession;
  ui: EditorUiStore;
  rigged: readonly EditorAssetEntry[];
}) {
  const selection = useStoreSelector(session, (state) => state.selection, shallowArrayEqual);
  const markers = useStoreSelector(session, (state) => state.document.markers);
  const target = useMemo(() => {
    for (const id of selection) {
      const marker = markers.find((entry) => entry.id === id);
      if (marker === undefined) continue;
      const catalogId = markerCatalogId(marker);
      const asset = catalogId === null ? undefined : rigged.find((entry) => entry.id === catalogId);
      if (asset?.url !== undefined && asset.clips !== undefined) return { marker, asset };
    }
    return null;
  }, [selection, markers, rigged]);

  if (target === null) {
    return (
      <EmptyState
        icon="film"
        title="Animation graph"
        badge="Placed rig"
        description="Select a placed instance of a rigged asset to see the graph it plays: layers, states and transitions, with a scrubbed preview on the rig in the viewport."
      />
    );
  }
  return <GraphInspector key={target.marker.id} session={session} ui={ui} marker={target.marker} asset={target.asset} />;
}

function GraphInspector({
  session,
  ui,
  marker,
  asset,
}: {
  session: EditorSession;
  ui: EditorUiStore;
  marker: { id: string; label?: string; meta?: Record<string, unknown> };
  asset: EditorAssetEntry;
}) {
  const clips = asset.clips ?? [];
  const setting = readAnimationSetting(marker.meta);
  const effective = useMemo(() => effectiveAnimGraph(setting, clips), [JSON.stringify(setting), clips]);
  const graph = effective?.graph ?? null;
  const controls = useMemo(() => (graph === null ? [] : graphParamControls(graph)), [graph]);
  const triggerNames = useMemo(() => (graph === null ? [] : graphTriggers(graph)), [graph]);

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [params, setParams] = useState<Record<string, AnimParamValue>>({});
  const [triggers, setTriggers] = useState<GraphPreviewTrigger[]>([]);
  const durations = useStoreSelector(ui, (state) => state.clipPreview?.clipDurations);

  const frame: GraphPreviewFrame | null = useMemo(() => {
    if (graph === null) return null;
    const merged: Record<string, AnimParamValue> = {};
    for (const control of controls) merged[control.name] = params[control.name] ?? (control.kind === "boolean" ? false : 0);
    return simulateGraphPreview({ graph, durations: durations ?? {}, time, params: merged, triggers });
  }, [graph, controls, params, triggers, time, durations]);

  useEffect(() => {
    if (asset.url === undefined) return;
    const current = ui.getState().clipPreview;
    const sameAsset = current?.source.assetId === asset.id;
    ui.patch({
      clipPreview: {
        source: { assetId: asset.id, label: asset.label, url: asset.url, clips },
        driver: initialClipPreviewState(null),
        duration: 0,
        ...(sameAsset && current?.clipDurations !== undefined ? { clipDurations: current.clipDurations } : {}),
      },
    });
    return () => {
      if (ui.getState().clipPreview?.source.assetId === asset.id) ui.patch({ clipPreview: null });
    };
  }, [asset.id, asset.url, asset.label, clips, ui]);

  useEffect(() => {
    const current = ui.getState().clipPreview;
    if (current === null || current.source.assetId !== asset.id) return;
    if (graph === null || frame === null) {
      if (current.graphPose !== undefined) ui.patch({ clipPreview: { ...current, graphPose: undefined } });
      return;
    }
    ui.patch({ clipPreview: { ...current, graphPose: { graph, clips: frame.clips } } });
  }, [graph, frame, asset.id, ui, durations]);

  const timeRef = useRef(time);
  timeRef.current = time;
  useEffect(() => {
    if (!playing) return;
    let handle = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = timeRef.current + Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (next >= MAX_PREVIEW_SECONDS) {
        setTime(MAX_PREVIEW_SECONDS);
        setPlaying(false);
        return;
      }
      setTime(next);
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing]);

  const commit = (next: AnimationSetting | undefined) =>
    session.dispatch(
      { type: "setMarker", id: marker.id, patch: { meta: { ...marker.meta, ...animationMetaPatch(next) } } },
      { coalesce: `animation:${marker.id}` },
    );

  if (graph === null || effective === null || frame === null) {
    return (
      <EmptyState
        icon="film"
        title="No graph"
        badge={marker.label ?? marker.id}
        description="This placement plays no graph: its animation is off, a single clip, or the rig has no idle clip. Pick Custom or Auto in the inspector's Animation section."
      />
    );
  }

  const weights = new Map(frame.clips.map((clip) => [`${clip.layer}:${clip.clip}`, clip.weight]));
  const trigger = (name: string) => setTriggers((current) => recordTrigger(current, name, timeRef.current));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-white/[0.06] px-2">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">{marker.label ?? marker.id}</span>
        <span className="text-[10px] text-neutral-600">
          {asset.label} · {SOURCE_LABEL[effective.source]}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {effective.source === "authored" ? (
            <button type="button" className={SMALL_BUTTON} onClick={() => commit(clearAnimGraph(setting))} title="Drop the stored graph">
              Use derived graph
            </button>
          ) : (
            <button type="button" className={SMALL_BUTTON} onClick={() => commit(storeAnimGraph(setting, graph))} title="Store this graph on the placement">
              Store graph
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-auto p-3">
        <div className="flex w-64 shrink-0 flex-col gap-2">
          <div className="flex items-center gap-2">
            <IconButton icon={playing ? "pause" : "play"} label={playing ? "Pause preview" : "Play preview"} size={14} active={playing} onClick={() => setPlaying((value) => !value)} />
            <button
              type="button"
              className={SMALL_BUTTON}
              onClick={() => {
                setPlaying(false);
                setTime(0);
                setTriggers([]);
              }}
            >
              Reset
            </button>
            <span className={`ml-auto text-[10px] text-neutral-400 ${NUMERIC}`}>{time.toFixed(2)} s</span>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-wider text-neutral-600">Scrub</span>
            <input
              type="range"
              min={0}
              max={MAX_PREVIEW_SECONDS}
              step={0.01}
              value={time}
              aria-label="Graph preview time"
              className={`h-2 w-full accent-cyan-400 ${FOCUS_RING}`}
              onChange={(event) => {
                setPlaying(false);
                setTime(Number(event.target.value));
              }}
            />
            <TriggerTicks triggers={triggers} />
          </label>
          {controls.map((control) =>
            control.kind === "boolean" ? (
              <label key={control.name} className="flex items-center gap-2 text-[11px] text-neutral-300">
                <input
                  type="checkbox"
                  checked={params[control.name] === true}
                  aria-label={`Parameter ${control.name}`}
                  onChange={(event) => setParams((current) => ({ ...current, [control.name]: event.target.checked }))}
                />
                {control.name}
              </label>
            ) : (
              <label key={control.name} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-neutral-600">
                  <span>{control.name}</span>
                  <span className={NUMERIC}>{Number(params[control.name] ?? 0).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={control.min}
                  max={control.max}
                  step={(control.max - control.min) / 200}
                  value={Number(params[control.name] ?? 0)}
                  aria-label={`Parameter ${control.name}`}
                  className={`h-2 w-full accent-cyan-400 ${FOCUS_RING}`}
                  onChange={(event) => setParams((current) => ({ ...current, [control.name]: Number(event.target.value) }))}
                />
              </label>
            ),
          )}
          {triggerNames.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-[9px] uppercase tracking-wider text-neutral-600">Triggers at the playhead</span>
              <div className="flex flex-wrap gap-1">
                {triggerNames.map((name) => (
                  <button key={name} type="button" className={SMALL_BUTTON} onClick={() => trigger(name)}>
                    {name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {frame.events.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] uppercase tracking-wider text-neutral-600">Clip events</span>
              {frame.events.slice(-6).map((event, index) => (
                <span key={index} className={`text-[10px] text-amber-200/80 ${NUMERIC}`}>
                  {event.at.toFixed(2)} s · {event.name} ({event.clip})
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {graph.layers.map((layer) => (
            <section key={layer.id} className="rounded-[6px] border border-white/[0.07] bg-white/[0.02]" aria-label={`Layer ${layer.id}`}>
              <header className="flex items-center gap-2 border-b border-white/[0.06] px-2.5 py-1.5">
                <span className="text-[11px] font-medium text-neutral-100">{layer.id}</span>
                <span className="text-[10px] text-neutral-500">entry {layer.entry}</span>
                {layer.mask !== undefined ? <Chip>mask {layer.mask.join(", ")}</Chip> : null}
                {layer.additive === true ? <Chip>additive</Chip> : null}
                {layer.weight !== undefined ? <Chip>weight {layer.weight}</Chip> : null}
                <span className="ml-auto text-[10px] text-cyan-200">▶ {frame.states[layer.id]}</span>
              </header>
              <div className="grid grid-cols-2 gap-3 p-2.5">
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] uppercase tracking-wider text-neutral-600">States</span>
                  {Object.entries(layer.states).map(([name, state]) => {
                    const active = frame.states[layer.id] === name;
                    const clipsOfState = state.kind === "clip" ? [state.clip] : state.points.map((point) => point.clip);
                    const weight = clipsOfState.reduce((sum, clip) => sum + (weights.get(`${layer.id}:${clip}`) ?? 0), 0);
                    return (
                      <div
                        key={name}
                        className={`rounded-[5px] border px-2 py-1 ${active ? "border-cyan-400/40 bg-cyan-500/10" : "border-white/[0.05]"}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-neutral-100">{name}</span>
                          <span className="text-[10px] text-neutral-500">{state.kind}</span>
                          <span className={`ml-auto text-[10px] text-neutral-400 ${NUMERIC}`}>{weight > 0 ? weight.toFixed(2) : ""}</span>
                        </div>
                        <div className="truncate text-[10px] text-neutral-500" title={stateClips(state)}>
                          {stateClips(state)}
                        </div>
                        <div className="mt-1 h-1 rounded bg-white/[0.05]">
                          <div className="h-1 rounded bg-cyan-400/70" style={{ width: `${Math.round(Math.min(1, weight) * 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] uppercase tracking-wider text-neutral-600">Transitions</span>
                  {layer.transitions.length === 0 ? <span className="text-[10px] text-neutral-600">None</span> : null}
                  {layer.transitions.map((transition, index) => (
                    <TransitionRow
                      key={index}
                      transition={transition}
                      onTrigger={transition.trigger === undefined ? undefined : () => trigger(transition.trigger!)}
                      onDuration={(duration) => commit(setTransitionDuration(setting, graph, layer.id, index, duration))}
                    />
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

const SMALL_BUTTON = `rounded-[5px] border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] text-neutral-300 transition-colors hover:bg-white/[0.07] ${FOCUS_RING}`;

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-[4px] bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-neutral-400">{children}</span>;
}

function TriggerTicks({ triggers }: { triggers: readonly GraphPreviewTrigger[] }) {
  if (triggers.length === 0) return null;
  return (
    <div className="relative h-3" aria-label="Recorded triggers">
      {triggers.map((entry, index) => (
        <span
          key={index}
          title={`${entry.name} at ${entry.at.toFixed(2)} s`}
          className="absolute top-0 h-3 w-0.5 bg-amber-300/80"
          style={{ left: `${(entry.at / MAX_PREVIEW_SECONDS) * 100}%` }}
        />
      ))}
    </div>
  );
}

function TransitionRow({
  transition,
  onTrigger,
  onDuration,
}: {
  transition: AnimTransition;
  onTrigger: (() => void) | undefined;
  onDuration: (duration: number) => void;
}) {
  const [draft, setDraft] = useState(String(transition.duration ?? 0.2));
  useEffect(() => setDraft(String(transition.duration ?? 0.2)), [transition.duration]);
  const label = `${transition.from} → ${transition.to}`;
  return (
    <div className="flex items-center gap-1.5 rounded-[5px] border border-white/[0.05] px-2 py-1">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] text-neutral-100">{label}</div>
        <div className="truncate text-[10px] text-neutral-500">
          {[
            transition.trigger === undefined ? null : `trigger ${transition.trigger}`,
            ...(transition.when ?? []).map(conditionText),
            transition.exitTime === undefined ? null : `exit ${transition.exitTime}`,
          ]
            .filter((part) => part !== null)
            .join(" · ") || "always"}
        </div>
      </div>
      <input
        className={`${INPUT_CLS} h-6 w-14 px-1 text-right text-[11px] ${NUMERIC}`}
        value={draft}
        aria-label={`Crossfade seconds for ${label}`}
        inputMode="decimal"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const value = Number(draft);
          if (Number.isFinite(value) && value !== (transition.duration ?? 0.2)) onDuration(value);
          else setDraft(String(transition.duration ?? 0.2));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
      />
      <span className="text-[9px] text-neutral-600">s</span>
      {onTrigger !== undefined ? <IconButton icon="play" label={`Trigger ${transition.trigger}`} size={11} onClick={onTrigger} /> : null}
    </div>
  );
}
