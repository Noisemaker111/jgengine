import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { BOAT_ENTITY_ID } from "../world/catalogIds";
import { BoatMesh } from "./BoatMesh";
import { HarborPropMesh } from "./HarborPropMesh";

export function renderTidewayEntity(entity: SceneEntity) {
  return entity.name === BOAT_ENTITY_ID ? <BoatMesh entity={entity} /> : null;
}

export function renderTidewayObject(object: SceneObject) {
  return <HarborPropMesh object={object} />;
}
