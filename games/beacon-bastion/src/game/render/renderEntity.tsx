/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { useGameContext } from "@jgengine/ui/provider";

import { CREEP_CATALOG } from "../entities/enemies/catalog";
import { techMeshDraw } from "./techMesh";

function TechBody({ entity }: { entity: SceneEntity }) {
  const ctx = useGameContext();
  return <EngineDrawMount create={() => techMeshDraw(ctx, entity)!} deps={[entity.id, entity.name]} />;
}

/** Tech draws its own procedural body; everything else (workers, the town hall, buildings) uses its catalog model. */
export function renderEntity(entity: SceneEntity): ReactNode {
  if (CREEP_CATALOG[entity.name] !== undefined) return <TechBody entity={entity} />;
  return null;
}
