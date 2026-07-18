import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EditorSession } from "@jgengine/core/editor/index";

import type { EditorHostApi } from "../session";
import { useStoreSelector } from "../useStoreSelector";
import { listScrubbablePaths, samplePathAt } from "./pathFlythrough";
import { FOCUS_RING, INPUT_CLS, NUMERIC } from "./theme";
import { EmptyState, IconButton } from "./ui";

/** Default world-units/sec when playing a path flythrough preview. */
const DEFAULT_PLAY_SPEED = 8;

/**
 * Animation dock: path flythrough scrubber over authored scene polylines.
 *
 * Scope (honest, no fake NLE):
 * - Scrub / play the editor orbit camera along document paths via {@link EditorHostApi.setFocusTarget}.
 * - Uses real path points + `@jgengine/core` path-follow sampling — not invented keyframes.
 * - Out of scope: clip authoring, keyframe curves, scene-kind param animation, director cinematics
 *   stored outside the scene document.
 */
export function AnimationPanel({ session, api }: { session: EditorSession; api: EditorHostApi }) {
  const paths = useStoreSelector(session, (state) => state.document.paths);
  const scrubbable = useMemo(() => listScrubbablePaths(paths), [paths]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const playRef = useRef({ playing: false, loop: true, progress: 0, pathId: null as string | null });

  const selected =
    scrubbable.find((entry) => entry.id === selectedId) ?? scrubbable[0] ?? null;
  const selectedPath = selected === null ? undefined : paths.find((path) => path.id === selected.id);

  useEffect(() => {
    if (selected !== null && selectedId !== selected.id) setSelectedId(selected.id);
    if (selected === null && selectedId !== null) setSelectedId(null);
  }, [selected, selectedId]);

  useEffect(() => {
    playRef.current = {
      playing,
      loop,
      progress,
      pathId: selected?.id ?? null,
    };
  }, [playing, loop, progress, selected?.id]);

  const applyProgress = useCallback(
    (next: number, pathId: string) => {
      const path = session.getState().document.paths.find((entry) => entry.id === pathId);
      if (path === undefined) return;
      const sample = samplePathAt(path, next);
      if (sample === null) return;
      playRef.current.progress = next;
      setProgress(next);
      api.setFocusTarget({ x: sample.x, y: sample.y, z: sample.z });
    },
    [api, session],
  );

  const onSelectPath = useCallback(
    (id: string) => {
      playRef.current.playing = false;
      setPlaying(false);
      setSelectedId(id);
      playRef.current.pathId = id;
      applyProgress(0, id);
      session.dispatch({ type: "select", ids: [id] });
    },
    [applyProgress, session],
  );

  const onScrub = useCallback(
    (value: number) => {
      if (selected === null) return;
      playRef.current.playing = false;
      setPlaying(false);
      applyProgress(value, selected.id);
    },
    [applyProgress, selected],
  );

  useEffect(() => {
    if (!playing || selected === null || selected.length <= 0) return;
    playRef.current.playing = true;
    playRef.current.pathId = selected.id;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const current = playRef.current;
      if (!current.playing || current.pathId === null) return;
      const path = session.getState().document.paths.find((entry) => entry.id === current.pathId);
      if (path === undefined) {
        playRef.current.playing = false;
        setPlaying(false);
        return;
      }
      const sample = samplePathAt(path, current.progress);
      if (sample === null || sample.length <= 0) {
        playRef.current.playing = false;
        setPlaying(false);
        return;
      }
      let next = current.progress + (DEFAULT_PLAY_SPEED * dt) / sample.length;
      if (next >= 1) {
        if (current.loop) {
          next = next % 1;
        } else {
          applyProgress(1, path.id);
          playRef.current.playing = false;
          setPlaying(false);
          return;
        }
      }
      applyProgress(next, path.id);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      playRef.current.playing = false;
    };
  }, [playing, selected, applyProgress, session]);

  if (scrubbable.length === 0) {
    return (
      <EmptyState
        icon="film"
        title="Path flythrough"
        badge="Scoped"
        description="Scope: scrub the orbit camera along authored scene paths (routes, roads, patrols). Draw a path with 2+ points via Add → path/road, then open this tab. Keyframe clip authoring and scene-kind param animation are not in scope."
      />
    );
  }

  const lengthLabel =
    selected === null ? "—" : selected.length < 10 ? `${selected.length.toFixed(1)} m` : `${Math.round(selected.length)} m`;
  const distance =
    selected === null || selected.length <= 0 ? 0 : progress * selected.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-white/[0.06] px-2">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">Path flythrough</span>
        <span className={`text-[10px] text-neutral-600 ${NUMERIC}`}>
          {scrubbable.length} path{scrubbable.length === 1 ? "" : "s"} · camera follows scrub
        </span>
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            icon={playing ? "pause" : "play"}
            label={playing ? "Pause flythrough" : "Play flythrough"}
            size={12}
            active={playing}
            disabled={selected === null || selected.length <= 0}
            onClick={() => setPlaying((value) => !value)}
          />
          <button
            type="button"
            className={`rounded-[5px] border px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors ${FOCUS_RING} ${
              loop
                ? "border-cyan-400/30 bg-cyan-500/15 text-cyan-200"
                : "border-white/[0.07] bg-white/[0.02] text-neutral-500 hover:text-neutral-300"
            }`}
            aria-pressed={loop}
            aria-label={loop ? "Loop on" : "Loop off"}
            onClick={() => setLoop((value) => !value)}
          >
            Loop
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 gap-3 overflow-auto p-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-wider text-neutral-600">Path</span>
            <select
              className={`${INPUT_CLS} h-8 px-2 text-[12px]`}
              value={selected?.id ?? ""}
              aria-label="Flythrough path"
              onChange={(event) => onSelectPath(event.target.value)}
            >
              {scrubbable.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label} · {entry.kind} · {entry.pointCount} pts
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-neutral-600">
              <span>Progress</span>
              <span className={NUMERIC}>
                {(progress * 100).toFixed(0)}% · {distance.toFixed(1)} / {lengthLabel.replace(" m", "")} m
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={progress}
              aria-label="Flythrough progress"
              disabled={selected === null || selected.length <= 0}
              className={`h-2 w-full accent-cyan-400 ${FOCUS_RING}`}
              onChange={(event) => onScrub(Number(event.target.value))}
            />
          </label>
          <p className="text-[10px] leading-relaxed text-neutral-600">
            Scope: real path points only — no fabricated keyframes. Play moves the orbit focus along the polyline at{" "}
            {DEFAULT_PLAY_SPEED} u/s. Edit points in the viewport or inspector.
          </p>
        </div>
        <div className="flex w-40 shrink-0 flex-col gap-1.5">
          <Meta label="Kind" value={selected?.kind ?? "—"} />
          <Meta label="Points" value={selected === null ? "—" : String(selected.pointCount)} />
          <Meta label="Length" value={lengthLabel} />
          <Meta
            label="At"
            value={
              selectedPath === undefined
                ? "—"
                : (() => {
                    const sample = samplePathAt(selectedPath, progress);
                    if (sample === null) return "—";
                    return `${sample.x.toFixed(1)}, ${sample.y.toFixed(1)}, ${sample.z.toFixed(1)}`;
                  })()
            }
          />
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[6px] border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-neutral-600">{label}</div>
      <div className={`truncate text-[12px] font-medium text-neutral-100 ${NUMERIC}`}>{value}</div>
    </div>
  );
}
