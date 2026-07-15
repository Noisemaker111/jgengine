import type { ReactNode } from "react";

import type { SceneEntity } from "@jgengine/core/scene/entityStore";

import { ALIEN_KIND } from "../entities/aliens/catalog";
import { AlienMesh } from "./AlienMesh";

export function renderEntity(entity: SceneEntity): ReactNode {
  if (entity.name === ALIEN_KIND) return <AlienMesh entity={entity} />;
  return null;
}
