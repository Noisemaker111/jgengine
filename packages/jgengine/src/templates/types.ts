export type TemplateVariant = "standalone" | "in-repo";

export interface EditorSceneMarker {
  id?: string;
  kind?: string;
  position?: { x: number; y: number; z: number };
  meta?: { on?: string; action?: string } & Record<string, unknown>;
  [key: string]: unknown;
}

export interface EditorSceneDoc {
  version?: number;
  markers?: EditorSceneMarker[];
  [key: string]: unknown;
}

export const LANDFORM_START_NAMES = ["glacial-valley", "dunes", "coast"] as const;

export type LandformStartName = (typeof LANDFORM_START_NAMES)[number];

export interface TemplateOptions {
  id: string;
  shape?: "shared-world-builder" | undefined;
  name: string;
  variant: TemplateVariant;
  engineVersion: string;
  cliVersion?: string;
  /**
   * An authored scene document to bake in as `src/editor.scene.json` instead of the starter scene —
   * the "promote a scene folder into a game" path (`jgengine create --from-scene`). The generated
   * scene test is tailored to what this document actually ships.
   */
  scene?: EditorSceneDoc | undefined;
  world?: boolean;
  editor?: boolean;
  player?: string | undefined;
  ground?: "flat" | "terrain";
  sceneMode?: "empty" | "starter";
  brief?: string | undefined;
  dimension?: "2d" | "3d";
  /** Grow the scene's terrain from this landform start on first load instead of the starter hills (`create --landform`). */
  landform?: LandformStartName | undefined;
}

export interface TemplateFile {
  path: string;
  contents: string;
}
