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

export interface TemplateOptions {
  id: string;
  name: string;
  variant: TemplateVariant;
  engineVersion: string;
  /**
   * An authored scene document to bake in as `src/editor.scene.json` instead of the starter scene —
   * the "promote a scene folder into a game" path (`jgengine create --from-scene`). The generated
   * scene test is tailored to what this document actually ships.
   */
  scene?: EditorSceneDoc;
}

export interface TemplateFile {
  path: string;
  contents: string;
}
