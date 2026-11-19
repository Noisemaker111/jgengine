/** @jsxImportSource @jgengine/core/ui/jsx */
import { memo, useMemo } from "@jgengine/core/ui/jsx";

import type { EditorSession } from "@jgengine/core/editor/index";
import { CITY_KIND } from "@jgengine/core/city/cityKind";
import { editableTerrainFromSnapshot } from "@jgengine/core/terrain/terraform";
import type { TerrainField } from "@jgengine/core/terrain/terrain";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";
import { useGameContext } from "@jgengine/ui/provider";
import { registerAllSceneKindRenderers } from "@jgengine/core/scene/allSceneKindRenderers.draw";
import { getSceneKindRenderer } from "@jgengine/core/scene/sceneKindRenderers.draw";

import type { EditorHostApi } from "./session";
import { useStoreSelector } from "./useStoreSelector";

/** @internal — mounted by `EditorApp`; not a game-author entry point. */
export const CityPreview = memo(function CityPreview({ api }: { api: EditorHostApi }) {
  registerAllSceneKindRenderers();
  const ctx = useGameContext();
  const session: EditorSession = api.getSession();

  const volumes = useStoreSelector(session, (state) => state.document.volumes);
  const snapshot = useStoreSelector(session, (state) => state.document.terrain ?? null);
  const baseGround = ctx.world.ground;

  const field = useMemo<TerrainField>(() => {
    if (snapshot !== null) {
      const editable = editableTerrainFromSnapshot(snapshot, baseGround);
      return { ...baseGround, sampleHeight: editable.sampleHeight, sampleNormal: editable.sampleNormal };
    }
    return baseGround;
  }, [snapshot, baseGround]);

  const objects = useMemo<SceneKindObject[]>(
    () =>
      volumes
        .filter((volume) => volume.kind === CITY_KIND)
        .map((volume) => ({
          id: volume.id,
          kind: volume.kind,
          center: volume.center,
          ...(volume.halfExtents === undefined ? {} : { halfExtents: volume.halfExtents }),
          ...(volume.radius === undefined ? {} : { radius: volume.radius }),
          ...(volume.meta === undefined ? {} : { meta: volume.meta }),
        })),
    [volumes],
  );

  const renderer = getSceneKindRenderer(CITY_KIND);
  const document = useStoreSelector(session, (state) => state.document);
  if (renderer === undefined || objects.length === 0) return null;
  return <>{renderer({ objects, context: { document, field } })}</>;
});
