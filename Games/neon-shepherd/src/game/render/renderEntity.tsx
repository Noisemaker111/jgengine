import type { ReactNode } from "react";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { creatureById } from "../entities/creatures/catalog";
import { SHEPHERD_ENTITY_ID } from "../entities/shepherd/catalog";
import { VEHICLE_TYPES, type VehicleTypeId } from "../vehicles/catalog";
import { CreatureMesh } from "./CreatureMesh";
import { ShepherdMesh } from "./ShepherdMesh";
import { VehicleMesh } from "./VehicleMesh";

export function renderEntity(entity: SceneEntity): ReactNode {
  if (entity.name === SHEPHERD_ENTITY_ID) return <ShepherdMesh />;
  if (creatureById(entity.name) !== undefined) return <CreatureMesh entity={entity} />;
  if (VEHICLE_TYPES[entity.name as VehicleTypeId] !== undefined) return <VehicleMesh entity={entity} />;
  return null;
}
