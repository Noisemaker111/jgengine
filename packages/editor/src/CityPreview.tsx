import { memo, useMemo } from "react";

import type { EditorSession } from "@jgengine/core/editor/index";
import { CITY_KIND } from "@jgengine/core/world/cityKind";
import { editableTerrainFromSnapshot } from "@jgengine/core/world/terraform";
import type { TerrainField } from "@jgengine/core/world/terrain";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";
import { useGameContext } from "@jgengine/react/provider";
import { registerBuiltinSceneKindRenderers } from "@jgengine/shell/scene/builtinSceneKindRenderers";
import { getSceneKindRenderer } from "@jgengine/shell/scene/sceneKindRenderers";

import type { EditorHostApi } from "./session";
import { useStoreSelector } from "./useStoreSelector";

/**
 * Live edit-mode preview of every `city` district volume, so slider drags (grid-ness, curviness,
 * branching, block size, …) re-synthesize streets/buildings/parks in the viewport without entering
 * play mode. Mounts the exact runtime renderer the shell registers for the kind — the preview IS the
 * game's rendering, grounded on the sculpt terrain (or the game's ground) like {@link ScatterPreview}.
 * @internal — mounted by `EditorApp`; not a game-author entry point.
 */
export const CityPreview = memo(function CityPreview({ api }: { api: EditorHostApi }) {
  registerBuiltinSceneKindRenderers();
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
