/** @jsxImportSource @jgengine/core/ui/jsx */
import {
  EngineDrawMount,
  SceneObjectAttach,
  SceneObjectPortal,
  useSceneObjectAttach,
} from "@jgengine/core/frame/useEngineDraw.draw";
import type { EngineDraw } from "@jgengine/core/frame/engineLoop.draw";
import { useEffect, useMemo } from "@jgengine/core/ui/jsx";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";
import { ArrowHelper, BoxGeometry, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Vector3 } from "three";

import type { GridFootprint } from "@llmville/game/world/grid";
import { TILE_SIZE } from "@llmville/game/world/grid";
import { cardinalLabel, cardinalToRotationY } from "@llmville/game/world/cardinal";
import { worldLabels } from "../worldLabels";

const scratch = new Vector3();

/**
 * Dev overlay: footprint tile outline + forward arrow (+Z).
 * Enable with ?frames=1 or ?debug=frames in the URL.
 */
export function useShowAssetFrames(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("frames") === "1" || params.get("debug") === "frames";
}

interface AssetFrameGizmoProps {
  footprint?: GridFootprint | undefined;
  direction?: 0 | 1 | 2 | 3 | undefined;
  label?: string | undefined;
  showForwardArrow?: boolean | undefined;
}

function footprintEdgesDraw(width: number, depth: number): EngineDraw {
  const geometry = new BoxGeometry(width, 0.04, depth);
  const edges = new EdgesGeometry(geometry);
  geometry.dispose();
  const lineMaterial = new LineBasicMaterial({ color: 0x34d399 });
  const line = new LineSegments(edges, lineMaterial);
  line.position.set(0, 0.02, 0);
  return {
    mount(state) {
      state.scene.add(line);
    },
    dispose(state) {
      state.scene.remove(line);
      edges.dispose();
      lineMaterial.dispose();
    },
  };
}

export function AssetFrameGizmo({
  footprint,
  direction = 0,
  label,
  showForwardArrow = true,
}: AssetFrameGizmoProps) {
  const width = (footprint?.width ?? 1) * TILE_SIZE;
  const depth = (footprint?.depth ?? 1) * TILE_SIZE;
  const rotationY = cardinalToRotationY(direction);
  const facing = cardinalLabel(direction);
  const displayLabel = label ? `${label} · ${facing}` : facing;

  const gizmo = useMemo(() => new Group(), []);
  useSceneObjectAttach(gizmo);
  useEffect(() => {
    gizmo.rotation.y = rotationY;
  }, [gizmo, rotationY]);

  const forwardArrow = useMemo(() => {
    const arrow = new ArrowHelper(undefined, undefined, Math.min(depth * 0.45, 2.5), 0x38bdf8, 0.25, 0.15);
    arrow.position.set(0, 0.06, 0);
    return arrow;
  }, [depth]);

  const labelId = useMemo(() => `gizmo:${Math.random().toString(36).slice(2)}`, []);
  useEffect(() => {
    if (!label) { worldLabels.remove(labelId); return; }
    worldLabels.set({ id: labelId, text: displayLabel, color: "#e2e8f0", border: "#0f172ad9", mono: true, position: [gizmo.position.x, gizmo.position.y + 0.35, gizmo.position.z] });
  }, [labelId, label, displayLabel, gizmo]);
  useEffect(() => () => worldLabels.remove(labelId), [labelId]);
  useFrameTask(function gizmoLabel() {
    if (!label) return;
    gizmo.getWorldPosition(scratch);
    worldLabels.move(labelId, scratch.x, scratch.y + 0.35, scratch.z);
  });

  return (
    <SceneObjectPortal object={gizmo}>
      <EngineDrawMount create={() => footprintEdgesDraw(width, depth)} deps={[width, depth]} />
      {showForwardArrow && <SceneObjectAttach object={forwardArrow} />}
    </SceneObjectPortal>
  );
}
