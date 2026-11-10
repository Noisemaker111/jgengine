/**
 * R3F placement preview — runs each frame while a build draft is active.
 * Rules live in build.ts (`computePlacementPreview`).
 */

import { computePlacementPreview, type BuildPlacementPreview, type PlacedBuildItem } from "@llmville/game/build/build";
import type { BuildDirection, BuildItemId } from "@llmville/game/build/catalog";
import type { PlacementCellPolicy } from "@llmville/game/datacenter/claims";
import type { PlacedRack } from "@/infrastructure/infrastructure";
import { useEffect, useRef } from "@jgengine/core/ui/jsx";
import { Vector3 } from "three";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";
import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";

const placementDirectionVector = new Vector3();

export function BuildPlacementPreviewController({
  enabled,
  placementDraftItemId,
  placementDraftDirection,
  racks,
  placedBuildItems,
  placementCellPolicy,
  onPlacementPreviewChange,
}: {
  enabled: boolean;
  placementDraftItemId: BuildItemId | null;
  placementDraftDirection: BuildDirection;
  racks: readonly PlacedRack[];
  placedBuildItems: readonly PlacedBuildItem[];
  placementCellPolicy: PlacementCellPolicy;
  onPlacementPreviewChange: (preview: BuildPlacementPreview | null) => void;
}) {
  const host = useEngineHost();
  const lastPreviewKey = useRef<string>("none");

  useEffect(() => {
    if (enabled) return;
    onPlacementPreviewChange(null);
    lastPreviewKey.current = "none";
  }, [enabled, onPlacementPreviewChange]);

  useFrameTask(function buildPlacementPreview() {
    if (!enabled || placementDraftItemId === null) return;

    const camera = host.frame.camera;
    camera.getWorldDirection(placementDirectionVector);
    const preview = computePlacementPreview(
      { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      {
        x: placementDirectionVector.x,
        y: placementDirectionVector.y,
        z: placementDirectionVector.z,
      },
      {
        itemId: placementDraftItemId,
        direction: placementDraftDirection,
        racks,
        placedBuildItems,
        cellPolicy: placementCellPolicy,
      },
    );

    const previewKey = `${preview.x.toFixed(3)}:${preview.z.toFixed(3)}:${preview.y.toFixed(3)}:${preview.isValid ? "1" : "0"}`;
    if (previewKey === lastPreviewKey.current) return;

    lastPreviewKey.current = previewKey;
    onPlacementPreviewChange(preview);
  });

  return null;
}
