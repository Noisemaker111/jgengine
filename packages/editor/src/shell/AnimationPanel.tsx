import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EditorSession } from "@jgengine/core/editor/index";
import { markerCatalogId } from "@jgengine/core/world/authoredObjects";

import type { EditorAssetEntry } from "../AssetBrowser";
import type { EditorHostApi } from "../session";
import type { EditorUiStore } from "../uiStore";
import { shallowArrayEqual, useStoreSelector } from "../useStoreSelector";
import {
  advancePreview,
  clipEntriesFromRef,
  initialClipPreviewState,
  MAX_PREVIEW_SPEED,
  MIN_PREVIEW_SPEED,
  scrubPreview,
  selectPreviewClip,
  setPreviewLoop,
  setPreviewSpeed,
  togglePreviewPlaying,
  type ClipPreviewSession,
  type ClipPreviewState,
} from "./clipPreview";
import { listScrubbablePaths, samplePathAt } from "./pathFlythrough";
import { FOCUS_RING, INPUT_CLS, NUMERIC } from "./theme";
import { EmptyState, IconButton } from "./ui";

/** Default world-units/sec when playing a path flythrough preview. */
const DEFAULT_PLAY_SPEED = 8;

/** Rigged asset entries (carry animation clips) for the clip-preview picker. */
function riggedAssets(assets: readonly EditorAssetEntry[]): EditorAssetEntry[] {
  return assets.filter((entry) => entry.url !== undefined && entry.clips !== undefined && entry.clips.length > 0);
}

/**
 * Animation dock with two modes:
 * - **Path** — scrub/play the editor orbit camera along authored scene polylines (real path points,
 *   no fabricated keyframes).
 * - **Clips** — preview a rigged asset's animation clips in the viewport (scrub, loop, speed) via the
 *   shell mixer, either a placed instance's asset or any rigged catalog asset.
 *
 * @internal
 */
export function AnimationPanel({
  session,
  api,
  ui,
  assets,
}: {
  session: EditorSession;
  api: EditorHostApi;
  ui: EditorUiStore;
  assets: readonly EditorAssetEntry[];
}) {
  const rigged = useMemo(() => riggedAssets(assets), [assets]);
  // Default to clips only when the scene has rigged assets but no scrubbable path yet.
  const paths = useStoreSelector(session, (state) => state.document.paths);
  const [mode, setMode] = useState<"path" | "clips">(() =>
    rigged.length > 0 && listScrubbablePaths(paths).length === 0 ? "clips" : "path",
  );

  // Tear down the viewport preview when the panel unmounts; leaving clip mode tears down in the
  // tab click below.
  useEffect(
    () => () => {
      if (ui.getState().clipPreview !== null) ui.patch({ clipPreview: null });
    },
    [ui],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-white/[0.06] px-2">
        <div className="flex items-center gap-0.5" role="tablist" aria-label="Animation mode">
          {(
            [
              ["path", "Path flythrough"],
              ["clips", "Clip preview"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              className={`rounded-[5px] px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors ${FOCUS_RING} ${
                mode === id ? "bg-cyan-500/15 text-cyan-200" : "text-neutral-500 hover:text-neutral-300"
              }`}
              onClick={() => {
                if (id !== "clips" && ui.getState().clipPreview !== null) ui.patch({ clipPreview: null });
                setMode(id);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {mode === "path" ? (
        <PathFlythrough session={session} api={api} />
      ) : (
        <ClipPreview session={session} ui={ui} rigged={rigged} />
      )}
    </div>
  );
}

/** Clip-preview mode: pick a rigged asset (placed instance or catalog) and play its clips in the viewport. */
function ClipPreview({
  session,
  ui,
  rigged,
}: {
  session: EditorSession;
  ui: EditorUiStore;
  rigged: readonly EditorAssetEntry[];
}) {
  const preview = useStoreSelector(ui, (state) => state.clipPreview);
  const selection = useStoreSelector(session, (state) => state.selection, shallowArrayEqual);

  // A placed marker in the selection that resolves to a rigged catalog asset — offer to preview it.
  const selectedRigged = useMemo(() => {
    const document = session.getState().document;
    for (const id of selection) {
      const marker = document.markers.find((entry) => entry.id === id);
      if (marker === undefined) continue;
      const catalogId = markerCatalogId(marker);
      if (catalogId === null) continue;
      const asset = rigged.find((entry) => entry.id === catalogId);
      if (asset !== undefined) return asset;
    }
    return null;
  }, [selection, rigged, session]);

  const startPreview = useCallback(
    (asset: EditorAssetEntry) => {
      if (asset.url === undefined || asset.clips === undefined) return;
      const firstClip = asset.clips[0] ?? null;
      ui.patch({
        clipPreview: {
          source: { assetId: asset.id, label: asset.label, url: asset.url, clips: asset.clips },
          driver: initialClipPreviewState(firstClip),
          duration: 0,
        },
      });
    },
    [ui],
  );

  const updateDriver = useCallback(
    (next: ClipPreviewState) => {
      const current = ui.getState().clipPreview;
      if (current === null) return;
      ui.patch({ clipPreview: { ...current, driver: next } });
    },
    [ui],
  );

  // While playing with a known clip duration, advance the driver each frame (freerunning mixer + slider in sync).
  const previewRef = useRef<ClipPreviewSession | null>(preview);
  previewRef.current = preview;
  const playing = preview?.driver.playing ?? false;
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const current = previewRef.current;
      if (current === null || !current.driver.playing) return;
      const next = advancePreview(current.driver, dt, current.duration);
      if (next !== current.driver) ui.patch({ clipPreview: { ...current, driver: next } });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, ui, preview?.duration, preview?.source.assetId]);

  if (rigged.length === 0) {
    return (
      <EmptyState
        icon="film"
        title="Clip preview"
        badge="Rigged assets"
        description="Preview animation clips in the viewport. No rigged assets in this game's catalog — imported/catalog models carrying animation clips (▶ badge in the Content Browser) show up here."
      />
    );
  }

  const source = preview?.source ?? null;
  const driver = preview?.driver ?? null;
  const duration = preview?.duration ?? 0;
  const clipEntries = clipEntriesFromRef(source);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-white/[0.06] px-2">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">Clip preview</span>
        <span className={`text-[10px] text-neutral-600 ${NUMERIC}`}>
          {rigged.length} rigged asset{rigged.length === 1 ? "" : "s"} · viewport playback
        </span>
        {selectedRigged !== null && selectedRigged.id !== source?.assetId ? (
          <button
            type="button"
            className={`ml-auto rounded-[5px] border border-cyan-400/30 bg-cyan-500/15 px-2 py-0.5 text-[10px] text-cyan-200 transition-colors hover:bg-cyan-500/25 ${FOCUS_RING}`}
            onClick={() => startPreview(selectedRigged)}
            title={`Preview the selected placement's rig (${selectedRigged.label})`}
          >
            Preview selection
          </button>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3">
        <label className="flex flex-col gap-1">
          <span className="text-[9px] uppercase tracking-wider text-neutral-600">Rigged asset</span>
          <select
            className={`${INPUT_CLS} h-8 px-2 text-[12px]`}
            value={source?.assetId ?? ""}
            aria-label="Preview asset"
            onChange={(event) => {
              const asset = rigged.find((entry) => entry.id === event.target.value);
              if (asset !== undefined) startPreview(asset);
            }}
          >
            <option value="" disabled>
              Select a rigged asset…
            </option>
            {rigged.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.label} · {asset.clips?.length ?? 0} clips
              </option>
            ))}
          </select>
        </label>

        {source === null || driver === null ? (
          <p className="text-[10px] leading-relaxed text-neutral-600">
            Pick a rigged asset above (or select a placed instance and press “Preview selection”) to play its clips at
            the camera focus point.
          </p>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-[9px] uppercase tracking-wider text-neutral-600">Clip</span>
              <select
                className={`${INPUT_CLS} h-8 px-2 text-[12px]`}
                value={driver.clipName ?? ""}
                aria-label="Preview clip"
                onChange={(event) => updateDriver(selectPreviewClip(driver, event.target.value))}
              >
                {clipEntries.map((entry) => (
                  <option key={entry.name} value={entry.name}>
                    {entry.name}
                    {entry.role === null ? "" : ` · ${entry.role}`}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-2">
              <IconButton
                icon={driver.playing ? "pause" : "play"}
                label={driver.playing ? "Pause clip" : "Play clip"}
                size={14}
                active={driver.playing}
                disabled={driver.clipName === null}
                onClick={() => updateDriver(togglePreviewPlaying(driver))}
              />
              <button
                type="button"
                className={`rounded-[5px] border px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors ${FOCUS_RING} ${
                  driver.loop
                    ? "border-cyan-400/30 bg-cyan-500/15 text-cyan-200"
                    : "border-white/[0.07] bg-white/[0.02] text-neutral-500 hover:text-neutral-300"
                }`}
                aria-pressed={driver.loop}
                aria-label={driver.loop ? "Loop on" : "Loop off"}
                onClick={() => updateDriver(setPreviewLoop(driver, !driver.loop))}
              >
                Loop
              </button>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-[9px] uppercase tracking-wider text-neutral-600">Speed</span>
                <input
                  type="range"
                  min={MIN_PREVIEW_SPEED}
                  max={MAX_PREVIEW_SPEED}
                  step={0.05}
                  value={driver.speed}
                  aria-label="Playback speed"
                  className={`h-2 w-24 accent-cyan-400 ${FOCUS_RING}`}
                  onChange={(event) => updateDriver(setPreviewSpeed(driver, Number(event.target.value)))}
                />
                <span className={`w-8 text-right text-[10px] text-neutral-400 ${NUMERIC}`}>{driver.speed.toFixed(2)}×</span>
              </div>
            </div>

            <label className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-neutral-600">
                <span>Scrub</span>
                <span className={NUMERIC}>
                  {driver.time.toFixed(2)}
                  {duration > 0 ? ` / ${duration.toFixed(2)}` : ""} s
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={duration > 0 ? duration : 1}
                step={0.01}
                value={Math.min(driver.time, duration > 0 ? duration : 1)}
                aria-label="Clip time"
                disabled={driver.clipName === null || duration <= 0}
                className={`h-2 w-full accent-cyan-400 ${FOCUS_RING}`}
                onChange={(event) => updateDriver(scrubPreview(driver, Number(event.target.value)))}
              />
            </label>
            <p className="text-[10px] leading-relaxed text-neutral-600">
              Plays the selected clip on {source.label} at the camera focus point. Same mixer the game runs at play
              time. Authoring lives in the inspector’s Animation section on a placed instance.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** Path flythrough mode: scrub the orbit camera along authored scene polylines. */
function PathFlythrough({ session, api }: { session: EditorSession; api: EditorHostApi }) {
  const paths = useStoreSelector(session, (state) => state.document.paths);
  const scrubbable = useMemo(() => listScrubbablePaths(paths), [paths]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const playRef = useRef({ playing: false, loop: true, progress: 0, pathId: null as string | null });

  // selectedId is raw intent; a removed path falls back to the first scrubbable one at read time.
  const selected = scrubbable.find((entry) => entry.id === selectedId) ?? scrubbable[0] ?? null;
  const selectedPath = selected === null ? undefined : paths.find((path) => path.id === selected.id);

  playRef.current = {
    playing,
    loop,
    progress,
    pathId: selected?.id ?? null,
  };

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
        description="Scope: scrub the orbit camera along authored scene paths (routes, roads, patrols). Draw a path with 2+ points via Add → path/road, then open this tab. Switch to Clip preview above to play a rigged asset's animations."
      />
    );
  }

  const lengthLabel =
    selected === null ? "—" : selected.length < 10 ? `${selected.length.toFixed(1)} m` : `${Math.round(selected.length)} m`;
  const distance = selected === null || selected.length <= 0 ? 0 : progress * selected.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-white/[0.06] px-2">
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
