import type { EditorDocument, EditorMarker, EditorPath, EditorVolume } from "@jgengine/core/editor/index";

import { CAPTURE_RADIUS_METERS } from "./game/run/captureTension";
import {
  BORDER_NODE_INDEX,
  MAIN_CORRIDOR_WIDTH,
  canyonBranches,
  mainNodes,
  mainPolyline,
} from "./game/world/canyon";

function vec(point: readonly [number, number, number]): { x: number; y: number; z: number } {
  return { x: point[0], y: point[1], z: point[2] };
}

const BRANCH_COLOR: Record<string, string> = {
  fork: "#4ade80",
  shortcut: "#facc15",
  deadend: "#f87171",
};

export function buildCanyonChaseEditorLayers(): EditorDocument {
  const start = mainPolyline[0]!;
  const border = mainPolyline[BORDER_NODE_INDEX]!;

  const markers: EditorMarker[] = [
    {
      id: "car_start",
      kind: "player_spawn",
      position: vec(start),
      label: "Car start",
      color: "#22d3ee",
    },
    {
      id: "border_goal",
      kind: "goal",
      position: vec(border),
      label: "Border arch",
      color: "#f472b6",
    },
    ...mainNodes.map((node) => ({
      id: node.id,
      kind: "poi" as const,
      position: vec(node.position),
      label: `Main ${node.index}`,
      color: "#94a3b8",
      meta: { index: node.index },
    })),
    ...canyonBranches.map((branch) => {
      const mouth = branch.waypoints[0]!;
      return {
        id: `branch_mouth_${branch.id}`,
        kind: "branch" as const,
        position: vec(mouth),
        label: branch.label,
        color: BRANCH_COLOR[branch.kind] ?? "#facc15",
        meta: {
          branchId: branch.id,
          kind: branch.kind,
          fromIndex: branch.fromIndex,
          toIndex: branch.toIndex,
        },
      };
    }),
  ];

  const paths: EditorPath[] = [
    {
      id: "main_corridor",
      kind: "corridor",
      points: mainPolyline.map(vec),
      width: MAIN_CORRIDOR_WIDTH,
      label: "Main corridor",
      color: "#38bdf8",
      meta: { width: MAIN_CORRIDOR_WIDTH },
    },
    ...canyonBranches.map((branch) => ({
      id: `branch_${branch.id}`,
      kind: "branch" as const,
      points: branch.waypoints.map(vec),
      width: branch.width,
      label: branch.label,
      color: BRANCH_COLOR[branch.kind] ?? "#facc15",
      meta: { branchId: branch.id, kind: branch.kind },
    })),
  ];

  const volumes: EditorVolume[] = [
    {
      id: "capture_radius",
      kind: "capture",
      shape: "cylinder",
      center: vec(start),
      radius: CAPTURE_RADIUS_METERS,
      height: 8,
      label: "Capture radius (at truck)",
      color: "#f472b6",
      meta: {
        radius: CAPTURE_RADIUS_METERS,
        note: "Runtime follows the truck; shown at start for scale",
      },
    },
  ];

  return {
    version: 1,
    markers,
    volumes,
    paths,
    annotations: [],
  };
}

export const editorLayers = buildCanyonChaseEditorLayers;
