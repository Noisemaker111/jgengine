import { useEffect } from "react";
import { devtools } from "@jgengine/core/devtools/devtools";
import { fallbackSeamsSnapshot } from "@jgengine/core/devtools/fallbackSeams";
import { textureErrorsSnapshot } from "@jgengine/core/devtools/textureErrors";
import { MOVEMENT_TUNING } from "@jgengine/core/movement/movementModel";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { PlayableGame } from "../registry";
import { collisionDebug } from "./collisionDebug";
import { readStoredOverrides } from "./devtoolsOverrides";
import { buildLeanReport, buildFullReport } from "./devtoolsReports";

/** Keeps saved overrides and diagnostic registration live while the visual panel is closed. @internal */
export function DevtoolsRuntime({ ctx, playable }: { ctx: GameContext; playable: PlayableGame }) {
  useEffect(() => {
    devtools.logs.captureConsole();
    (globalThis as { __JG_DEVTOOLS?: unknown }).__JG_DEVTOOLS = {
      snapshot: () => buildLeanReport(playable),
      snapshotFull: () => buildFullReport(playable),
      controls: devtools.controls,
      discover: devtools.discover,
      frame: devtools.frame,
      profile: devtools.profile,
      collisionDebug,
    };
  }, [playable]);

  useEffect(() => {
    devtools.discover.scanTable("game", playable);
    devtools.discover.scanTable("engine", { movement: MOVEMENT_TUNING });
  }, [playable]);

  useEffect(() => {
    const stored = readStoredOverrides(playable.game.name);
    if (stored === null) return;
    const appliedEnables = new Set<string>();
    const appliedValues = new Set<string>();
    const applyLateRegistrations = () => {
      const discovered = new Map(devtools.discover.list().map((entry) => [entry.id, entry]));
      const needEnable = stored.enabled.filter(
        (id) => !appliedEnables.has(id) && discovered.get(id)?.enabled === false,
      );
      const needValue = Object.entries(stored.values).filter(
        ([name]) => !appliedValues.has(name) && devtools.controls.get(name) !== null,
      );
      if (needEnable.length === 0 && needValue.length === 0) return;
      for (const id of needEnable) appliedEnables.add(id);
      for (const [name] of needValue) appliedValues.add(name);
      devtools.overrides.apply({ enabled: needEnable, values: Object.fromEntries(needValue) });
    };
    applyLateRegistrations();
    return devtools.signal.subscribe(applyLateRegistrations);
  }, [playable]);

  useEffect(() => {
    const disposers = [
      devtools.probes.register("entities", () => ctx.scene.entity.list().length),
      devtools.probes.register("objects", () => ctx.scene.object.list().length),
      devtools.probes.register("fallbacks", () => fallbackSeamsSnapshot()),
      devtools.probes.register("textureErrors", () => textureErrorsSnapshot()),
    ];
    return () => {
      for (const dispose of disposers) dispose();
    };
  }, [ctx]);

  return null;
}
