import { useCallback, useEffect, useMemo, useRef } from "react";

import { createAutoQuality } from "@jgengine/core/health/autoQuality";
import { installCrashHandlers } from "@jgengine/core/health/crashSeam";
import { createRuntimeHealth, type RuntimeHealth } from "@jgengine/core/health/runtimeHealth";
import {
  applyAutoGraphicsTier,
  readGraphicsQuality,
  type GraphicsProfileOverrides,
} from "@jgengine/core/settings/graphicsSettings";
import { SETTING_IDS, type GraphicsQuality, type SettingsStore } from "@jgengine/core/settings/settingsModel";

import type { PlayableGame } from "./registry";

const TIERS: readonly GraphicsQuality[] = ["low", "medium", "high", "ultra"];

function nowMs(): number {
  return performance.now();
}

/**
 * Wire the game's `health` config for one session: the crash seam (with window error and unhandled-rejection
 * handlers), the telemetry queue, and auto quality. Returns `null` health when the game set none. `onFrameMs`
 * takes each rendered frame; auto quality moves the tier through the settings store only while the player's
 * Auto quality setting is on, and a tier the player picks ends it.
 */
export function useRuntimeHealth(args: {
  playable: PlayableGame;
  settingsStore: SettingsStore;
  quality: GraphicsQuality;
  overrides: GraphicsProfileOverrides | undefined;
}): { health: RuntimeHealth | null; onFrameMs: ((frameMs: number) => void) | undefined } {
  const { playable, settingsStore, quality, overrides } = args;
  const config = playable.health;
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const health = useMemo(
    () => (config === undefined ? null : createRuntimeHealth({ game: playable.game.name, config, tier: () => qualityRef.current, now: nowMs })),
    [playable],
  );
  const autoConfig = config?.autoQuality;
  const auto = useMemo(
    () =>
      autoConfig === undefined
        ? null
        : createAutoQuality({ tiers: TIERS, initial: readGraphicsQuality(settingsStore), config: autoConfig, now: nowMs }),
    [playable, settingsStore],
  );
  const appliedByAuto = useRef<GraphicsQuality | null>(null);
  const lastQuality = useRef(quality);

  useEffect(() => {
    if (health === null) return;
    const uninstall = installCrashHandlers(health.crash, window);
    const flush = () => health.telemetry.flush();
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      uninstall();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [health]);

  useEffect(() => {
    const previous = lastQuality.current;
    lastQuality.current = quality;
    if (previous === quality) return;
    if (appliedByAuto.current === quality) {
      appliedByAuto.current = null;
      return;
    }
    auto?.setTier(quality);
    health?.tierChanged(previous, quality, "player");
  }, [quality, auto, health]);

  const onFrameMs = useCallback(
    (frameMs: number) => {
      health?.onFrame(frameMs);
      if (auto === null || !settingsStore.get(SETTING_IDS.graphicsAuto, true)) return;
      const change = auto.observe(frameMs);
      if (change === null) return;
      appliedByAuto.current = change.to;
      applyAutoGraphicsTier(settingsStore, change.to, overrides);
      health?.tierChanged(change.from, change.to, "auto");
    },
    [health, auto, settingsStore, overrides],
  );

  return { health, onFrameMs: health === null && auto === null ? undefined : onFrameMs };
}
