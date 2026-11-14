/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";

import type { SceneEntity } from "@jgengine/core/scene/entityStore";

import { ALIEN_KIND } from "../entities/aliens/catalog";
import { TenantMesh } from "./TenantMesh";

export function renderEntity(entity: SceneEntity): ReactNode {
  if (entity.name === ALIEN_KIND) return <TenantMesh entity={entity} />;
  return null;
}
