/** A world-space point used across editor markers, volumes, and paths. */
export type EditorVec3 = { x: number; y: number; z: number };

/** Collision shape a volume is rendered and tested as. */
export type EditorVolumeShape = "sphere" | "cylinder" | "box";

/** A placeable point object in the scene — spawn, mob, chest, POI, etc. */
export interface EditorMarker {
  id: string;
  kind: string;
  position: EditorVec3;
  rotationY?: number;
  color?: string;
  label?: string;
  meta?: Record<string, unknown>;
}

/** A spatial region — zone, aggro range, capture area — placed in the scene. */
export interface EditorVolume {
  id: string;
  kind: string;
  shape: EditorVolumeShape;
  center: EditorVec3;
  radius?: number;
  height?: number;
  halfExtents?: EditorVec3;
  color?: string;
  label?: string;
  meta?: Record<string, unknown>;
}

/** A polyline of points — road, corridor, patrol route — placed in the scene. */
export interface EditorPath {
  id: string;
  kind: string;
  points: readonly EditorVec3[];
  width?: number;
  color?: string;
  label?: string;
  meta?: Record<string, unknown>;
}

/** A free-text annotation pinned to a world position for designers. */
export interface EditorNote {
  id: string;
  text: string;
  position: EditorVec3;
  color?: string;
  meta?: Record<string, unknown>;
}

/** The full authored scene: every marker, volume, path, and note for a game. */
export interface EditorDocument {
  version: 1;
  markers: EditorMarker[];
  volumes: EditorVolume[];
  paths: EditorPath[];
  annotations: EditorNote[];
}

/** Accepted shape for a game's `editorLayers` export: a document, partial data, or a factory. */
export type EditorLayersInput =
  | EditorDocument
  | Partial<Omit<EditorDocument, "version">>
  | (() => EditorDocument | Partial<Omit<EditorDocument, "version">>);

/** Per-kind show/hide flags for the editor's layer panel. */
export interface EditorKindVisibility {
  [kind: string]: boolean;
}

/** Standard marker kinds recognized with default colors and behavior. */
export const WELL_KNOWN_MARKER_KINDS = [
  "player_spawn",
  "mob",
  "boss",
  "vendor",
  "chest",
  "travel",
  "npc",
  "poi",
  "prop",
  "goal",
  "branch",
] as const;

/** Standard volume kinds recognized with default colors and behavior. */
export const WELL_KNOWN_VOLUME_KINDS = [
  "zone",
  "flatten",
  "cluster",
  "aggro",
  "leash",
  "discover",
  "capture",
  "prompt",
  "poi",
  "respawn_skip",
] as const;

/** Standard path kinds recognized with default colors and behavior. */
export const WELL_KNOWN_PATH_KINDS = ["road", "corridor", "branch", "route"] as const;
