import { useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";

import type { RuntimeEntityState, RuntimePlayControl } from "@jgengine/core/editor/index";
import { useGameContext } from "@jgengine/react/provider";

import type { EditorHostApi } from "./session";
import { MICRO } from "./chromeStyles";

const PUBLISH_MS = 100;

function metaValues(meta: unknown): Record<string, unknown> | undefined {
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta as Record<string, unknown>)) {
    if (
      typeof value === "number" ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      value === null
    ) {
      out[key] = value;
    }
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

/**
 * Publishes live scene entities onto the editor reverse channel and gates `ctx.time` against the
 * host play-control (pause / step). Mount only in editor play mode.
 * @internal
 */
export function RuntimePlayPublisher({ api }: { api: EditorHostApi }) {
  const ctx = useGameContext();

  useEffect(() => {
    const publish = () => {
      const entities: RuntimeEntityState[] = ctx.scene.entity.list().map((entity) => {
        const values = metaValues(entity.meta);
        return {
          id: entity.id,
          position: { x: entity.position[0], y: entity.position[1], z: entity.position[2] },
          rotationY: entity.rotationY,
          ...(values === undefined ? {} : { values }),
        };
      });
      const play = api.getPlayControl();
      api.getLiveSync().pushRuntimeDelta({
        at: Date.now(),
        entities,
        tunables: {
          paused: play.paused,
          pendingSteps: play.pendingSteps,
          now: ctx.time.now(),
        },
      });
    };
    publish();
    const timer = setInterval(publish, PUBLISH_MS);
    return () => clearInterval(timer);
  }, [api, ctx]);

  useFrame(() => {
    const play = api.getPlayControl();
    if (!play.paused) {
      if (ctx.time.isPaused()) ctx.time.play();
      return;
    }
    if (play.pendingSteps > 0) {
      if (ctx.time.isPaused()) ctx.time.play();
      api.setPlayControl({ paused: true, pendingSteps: play.pendingSteps - 1 });
      return;
    }
    if (!ctx.time.isPaused()) ctx.time.pause();
  }, -1);

  useFrame(() => {
    const play = api.getPlayControl();
    if (play.paused && play.pendingSteps === 0 && !ctx.time.isPaused()) {
      ctx.time.pause();
    }
  }, 1);

  return null;
}

/**
 * Play-mode chrome: pause/step controls plus a compact reverse-channel entity inspector.
 * Transform nudges go through `runtime_set` (document write-back by default).
 * @internal
 */
export function RuntimePlayInspectorChrome({
  api,
  onExit,
}: {
  api: EditorHostApi;
  onExit: () => void;
}) {
  const [play, setPlay] = useState<RuntimePlayControl>(() => api.getPlayControl());
  const [summary, setSummary] = useState<{
    entityCount: number;
    entities: { id: string; hasPosition: boolean; valueKeys: string[] }[];
    tunableKeys: string[];
    play: RuntimePlayControl;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<string>("");

  useEffect(() => api.subscribePlayControl(setPlay), [api]);

  useEffect(() => {
    const tick = () => {
      const result = api.handle({ method: "runtime_summary" });
      if (result.ok) {
        setSummary(
          result.result as {
            entityCount: number;
            entities: { id: string; hasPosition: boolean; valueKeys: string[] }[];
            tunableKeys: string[];
            play: RuntimePlayControl;
          },
        );
      }
    };
    tick();
    const timer = setInterval(tick, PUBLISH_MS);
    return () => clearInterval(timer);
  }, [api]);

  useEffect(() => {
    if (selectedId === null) {
      setDetail("");
      return;
    }
    const got = api.handle({ method: "runtime_get", id: selectedId });
    if (!got.ok) {
      setDetail(got.error ?? "missing");
      return;
    }
    setDetail(JSON.stringify(got.result, null, 2));
  }, [api, selectedId, summary?.entityCount, play.pendingSteps, play.paused]);

  const pause = () => {
    api.handle({ method: "runtime_pause" });
  };
  const resume = () => {
    api.handle({ method: "runtime_resume" });
  };
  const step = () => {
    api.handle({ method: "runtime_step", frames: 1 });
  };

  const nudgeSelected = (axis: "x" | "z", delta: number) => {
    if (selectedId === null) return;
    const got = api.handle({ method: "runtime_get", id: selectedId });
    if (!got.ok) return;
    const entity = (got.result as { entity?: RuntimeEntityState }).entity;
    const position = entity?.position ?? { x: 0, y: 0, z: 0 };
    api.handle({
      method: "runtime_set",
      id: selectedId,
      position: {
        x: position.x + (axis === "x" ? delta : 0),
        y: position.y,
        z: position.z + (axis === "z" ? delta : 0),
      },
    });
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex flex-col">
      <div className="pointer-events-none flex justify-center pt-2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/75 px-3 py-1.5 text-[11px] text-neutral-100 shadow-lg shadow-black/40 backdrop-blur-md">
          <span className="text-neutral-300">{play.paused ? "❚❚ Paused" : "▶ Playing"}</span>
          <button
            type="button"
            className="rounded-md bg-white/[0.08] px-2 py-0.5 hover:bg-white/15"
            onClick={() => (play.paused ? resume() : pause())}
          >
            {play.paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            className="rounded-md bg-white/[0.08] px-2 py-0.5 hover:bg-white/15 disabled:opacity-40"
            onClick={step}
            disabled={!play.paused}
          >
            Step{play.pendingSteps > 0 ? ` (${play.pendingSteps})` : ""}
          </button>
          <button type="button" className="rounded-md bg-white/[0.08] px-2 py-0.5 hover:bg-white/15" onClick={onExit}>
            Editor (F2+E)
          </button>
        </div>
      </div>
      <aside className="pointer-events-auto ml-auto mt-2 mr-2 flex w-72 max-h-[70vh] flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#0d0f13]/95 text-[11px] text-neutral-200 shadow-2xl shadow-black/50 backdrop-blur-md">
        <div className="flex items-center border-b border-white/[0.06] px-3 py-2">
          <div className={MICRO}>Runtime</div>
          <div className="ml-auto text-neutral-500">{summary?.entityCount ?? 0} entities</div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {(summary?.entities ?? []).map((entity) => (
            <button
              key={entity.id}
              type="button"
              className={`mb-1 block w-full truncate rounded-md px-2 py-1 text-left ${selectedId === entity.id ? "bg-cyan-500/20 text-cyan-100" : "hover:bg-white/[0.06]"}`}
              onClick={() => setSelectedId(entity.id)}
            >
              {entity.id}
              {entity.valueKeys.length > 0 ? (
                <span className="ml-1 text-neutral-500">{entity.valueKeys.join(",")}</span>
              ) : null}
            </button>
          ))}
          {(summary?.entities.length ?? 0) === 0 ? (
            <div className="px-2 py-3 text-neutral-500">No live entities yet — play or push_runtime_delta.</div>
          ) : null}
        </div>
        {selectedId !== null ? (
          <div className="border-t border-white/[0.06] p-2">
            <div className="mb-1 flex gap-1">
              <button type="button" className="rounded-md bg-white/[0.07] px-2 py-1 hover:bg-white/15" onClick={() => nudgeSelected("x", -1)}>
                −X
              </button>
              <button type="button" className="rounded-md bg-white/[0.07] px-2 py-1 hover:bg-white/15" onClick={() => nudgeSelected("x", 1)}>
                +X
              </button>
              <button type="button" className="rounded-md bg-white/[0.07] px-2 py-1 hover:bg-white/15" onClick={() => nudgeSelected("z", -1)}>
                −Z
              </button>
              <button type="button" className="rounded-md bg-white/[0.07] px-2 py-1 hover:bg-white/15" onClick={() => nudgeSelected("z", 1)}>
                +Z
              </button>
            </div>
            <pre className="max-h-40 overflow-auto rounded-md border border-white/[0.06] bg-black/40 p-2 text-[10px] text-neutral-400">
              {detail}
            </pre>
            <div className="mt-1 text-[10px] text-neutral-500">Tweaks write back to the scene document (undoable).</div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
