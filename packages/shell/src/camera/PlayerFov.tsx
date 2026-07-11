import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { GameCameraConfig } from "@jgengine/core/game/playableGame";

import {
  composePlayerFov,
  loadPlayerFov,
  resolvePlayerFovBounds,
  savePlayerFov,
  type PlayerFovBounds,
} from "./fovPreference";

export interface PlayerFovState {
  fov: number;
  bounds: PlayerFovBounds;
  enabled: boolean;
  persist: boolean;
  setFov: (value: number) => void;
  compose: (poseFov: number, mode?: "relative" | "absolute") => number;
}

const PlayerFovContext = createContext<PlayerFovState | null>(null);

export function PlayerFovProvider({
  config,
  orthographic,
  children,
}: {
  config?: GameCameraConfig;
  orthographic: boolean;
  children: ReactNode;
}) {
  const bounds = useMemo(
    () =>
      resolvePlayerFovBounds({
        min: config?.playerFov?.min,
        max: config?.playerFov?.max,
        default: config?.playerFov?.default ?? config?.frustum?.fov,
      }),
    [config?.playerFov?.min, config?.playerFov?.max, config?.playerFov?.default, config?.frustum?.fov],
  );
  const persist = config?.playerFov?.persist !== false;
  const showControl = !orthographic && config?.playerFov?.control !== false;
  const [fov, setFovState] = useState(() =>
    persist ? loadPlayerFov(bounds) : bounds.defaultFov,
  );

  const setFov = useCallback(
    (value: number) => {
      setFovState(persist ? savePlayerFov(value, bounds) : savePlayerFov(value, bounds, null));
    },
    [bounds, persist],
  );

  const compose = useCallback(
    (poseFov: number, mode: "relative" | "absolute" = "relative") =>
      orthographic ? poseFov : composePlayerFov(fov, poseFov, mode, bounds),
    [bounds, fov, orthographic],
  );

  const value = useMemo<PlayerFovState>(
    () => ({
      fov,
      bounds,
      enabled: showControl,
      persist,
      setFov,
      compose,
    }),
    [bounds, compose, fov, persist, setFov, showControl],
  );

  return <PlayerFovContext.Provider value={value}>{children}</PlayerFovContext.Provider>;
}

export function usePlayerFov(): PlayerFovState {
  const value = useContext(PlayerFovContext);
  if (value === null) {
    const bounds = resolvePlayerFovBounds();
    return {
      fov: bounds.defaultFov,
      bounds,
      enabled: false,
      persist: false,
      setFov: () => undefined,
      compose: (poseFov) => poseFov,
    };
  }
  return value;
}

export function PlayerFovSlider() {
  const { fov, setFov, bounds, enabled } = usePlayerFov();
  if (!enabled) return null;
  return (
    <label className="pointer-events-auto absolute bottom-3 right-3 z-20 flex items-center gap-2 rounded-md bg-neutral-950/75 px-2.5 py-1.5 text-[11px] font-medium tracking-wide text-neutral-200 shadow-lg ring-1 ring-white/10 backdrop-blur-sm">
      <span className="text-neutral-400">FOV</span>
      <input
        type="range"
        min={bounds.min}
        max={bounds.max}
        step={1}
        value={fov}
        aria-label="Field of view"
        className="h-1 w-24 cursor-pointer accent-emerald-400"
        onChange={(event) => setFov(Number(event.target.value))}
      />
      <span className="w-7 tabular-nums text-neutral-100">{Math.round(fov)}</span>
    </label>
  );
}
