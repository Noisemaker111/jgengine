export type TemplateVariant = "standalone" | "in-repo";

/** A marker as it appears in an authored `editor.scene.json` — only the fields the scaffold reads. */
export interface EditorSceneMarker {
  id?: string;
  kind?: string;
  position?: { x: number; y: number; z: number };
  meta?: { on?: string; action?: string } & Record<string, unknown>;
  [key: string]: unknown;
}

/** The subset of an authored scene document the scaffold inspects when promoting a folder. */
export interface EditorSceneDoc {
  version?: number;
  markers?: EditorSceneMarker[];
  [key: string]: unknown;
}

/** The landform starts `create --landform` offers; core's `terrain/terrainGenerator` grows them. */
export const LANDFORM_START_NAMES = ["glacial-valley", "dunes", "coast"] as const;

/** One landform start name. */
export type LandformStartName = (typeof LANDFORM_START_NAMES)[number];

export interface TemplateOptions {
  id: string;
  shape?: "shared-world-builder" | undefined;
  name: string;
  variant: TemplateVariant;
  engineVersion: string;
  /** Exact CLI version used to create the project; independent of the SDK version. */
  cliVersion?: string;
  /**
   * An authored scene document to bake in as `src/editor.scene.json` instead of the starter scene —
   * the "promote a scene folder into a game" path (`jgengine create --from-scene`). The generated
   * scene test is tailored to what this document actually ships.
   */
  scene?: EditorSceneDoc | undefined;
  /** Additionally scaffold world.ts + game/assets.ts + game/models.ts (every 3d template). */
  world?: boolean;
  /** Ship the authored scene document + editor wiring. Default true; `create --no-editor` drops it. */
  editor?: boolean;
  player?: string | undefined;
  ground?: "flat" | "terrain";
  sceneMode?: "empty" | "starter";
  /** The user's words for the game (`create --brief`), written into PLAN.md and the README. */
  brief?: string | undefined;
  /** `"2d"` scaffolds a board game with no 3D scene, editor document, or models (`create --template 2d`). Default `"3d"`. */
  dimension?: "2d" | "3d";
  /** Grow the scene's terrain from this landform start on first load instead of the starter hills (`create --landform`). */
  landform?: LandformStartName | undefined;
}

export interface TemplateFile {
  path: string;
  contents: string;
}
