import { memo, useEffect, useMemo, useState } from "react";

import type { EditorSession } from "@jgengine/core/editor/index";
import { editableTerrainFromSnapshot } from "@jgengine/core/world/terraform";
import { resolveScatter, type ScatterInstance, type ScatterTerrain } from "@jgengine/core/world/scatterRegion";
import { useGameContext } from "@jgengine/react/provider";
import { InstancedScatter } from "@jgengine/shell/scatter";

import type { EditorHostApi } from "./session";

const MAX_INSTANCES = 20000;

/**
 * Deterministic instanced preview of every foliage/scatter region in the document, grounded on the
 * sculpt terrain (or the game's ground) and rebuilt whenever a region or its density changes. Renders
 * real per-species proxy models through the shared `InstancedScatter` primitive — the same renderer a
 * game uses to consume `resolveScatter` at runtime.
 * @internal — mounted by `EditorApp`; not a game-author entry point.
 */
export const ScatterPreview = memo(function ScatterPreview({ api }: { api: EditorHostApi }) {
  const ctx = useGameContext();
  const session: EditorSession = api.getSession();
  const [, setTick] = useState(0);
  useEffect(() => session.subscribe(() => setTick((value) => value + 1)), [session]);

  const state = session.getState();
  const snapshot = state.document.terrain ?? null;
  const baseGround = ctx.world.ground;

  const terrain = useMemo<ScatterTerrain>(() => {
    if (snapshot !== null) return editableTerrainFromSnapshot(snapshot, baseGround);
    return { sampleHeight: baseGround.sampleHeight, sampleNormal: baseGround.sampleNormal };
  }, [snapshot, baseGround]);

  const instances = useMemo<ScatterInstance[]>(
    () => resolveScatter(state.document, terrain),
    [state.document, terrain],
  );

  return <InstancedScatter instances={instances} maxInstances={MAX_INSTANCES} />;
});
