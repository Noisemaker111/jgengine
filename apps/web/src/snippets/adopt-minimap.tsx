import { Minimap } from "@jgengine/core/map/map.view";
import { cam, units } from "./myWorld";

// units are YOUR objects. Nothing is copied into a jgengine store.
export const map = () => {
  const markers = units.map((u) => ({ id: u.id, position: [u.x, 0, u.z] as const, kind: u.team }));
  return <Minimap markers={markers} center={[cam.x, cam.z]} facingYaw={cam.yaw} worldRadius={60} />;
};
