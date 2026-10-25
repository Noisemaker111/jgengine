import { useEffect } from "react";

import { useGameContext } from "@jgengine/react/provider";
import type { PlacedBuildItem } from "@llmville/game/build/build";
import { cardinalToRotationY } from "@llmville/game/world/cardinal";
import type { PlacedRack } from "@/infrastructure/infrastructure";

interface DesiredObject {
  catalogId: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

function desiredObjects(
  racks: readonly PlacedRack[],
  placedBuildItems: readonly PlacedBuildItem[],
): Map<string, DesiredObject> {
  const desired = new Map<string, DesiredObject>();
  for (const rack of racks) {
    desired.set(rack.id, {
      catalogId: rack.rackType,
      x: rack.x,
      y: rack.y,
      z: rack.z,
      rotationY: rack.rotationY,
    });
  }
  for (const item of placedBuildItems) {
    desired.set(item.id, {
      catalogId: item.itemId,
      x: item.x,
      y: item.y,
      z: item.z,
      rotationY: cardinalToRotationY(item.direction),
    });
  }
  return desired;
}

export function useSceneObjectSync(
  racks: readonly PlacedRack[],
  placedBuildItems: readonly PlacedBuildItem[],
): void {
  const ctx = useGameContext();

  useEffect(() => {
    const desired = desiredObjects(racks, placedBuildItems);

    for (const instanceId of ctx.scene.object.ids()) {
      if (!desired.has(instanceId)) ctx.scene.object.remove(instanceId);
    }

    for (const [instanceId, next] of desired) {
      const existing = ctx.scene.object.get(instanceId);
      if (existing === null) {
        ctx.scene.object.place(next.catalogId, next.x, next.y, next.z, {
          instanceId,
          rotation: next.rotationY,
          onExisting: "replace",
        });
        continue;
      }
      if (existing.catalogId !== next.catalogId) {
        ctx.scene.object.remove(instanceId);
        ctx.scene.object.place(next.catalogId, next.x, next.y, next.z, {
          instanceId,
          rotation: next.rotationY,
        });
        continue;
      }
      const [x, y, z] = existing.position;
      if (x !== next.x || y !== next.y || z !== next.z) {
        ctx.scene.object.move(instanceId, next.x, next.y, next.z);
      }
      if (existing.rotationY !== next.rotationY) {
        ctx.scene.object.rotate(instanceId, next.rotationY);
      }
    }
  }, [ctx, racks, placedBuildItems]);
}
