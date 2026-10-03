import type { ModelConfig } from "../game/playableGame";
import { parseMaterialAssignments, validateMaterialAsset, validateMaterialAssignments, type MaterialAsset, type MaterialAssignment, type MaterialSelector } from "../material/materialAsset";
import type { EditorDocument } from "./types";

/** Validate and copy a material asset at the editor boundary. */
export function parseEditorMaterialAsset(value: unknown): MaterialAsset {
  const errors = validateMaterialAsset(value).filter((item) => item.severity === "error");
  if (errors.length > 0) throw new TypeError(errors.map((item) => `${item.path}: ${item.message}`).join("; "));
  return structuredClone(value) as MaterialAsset;
}

/**
 * Read named assignments from authored marker metadata without inferring whole-model overrides.
 * @capability authored-material-slots read validated material assignments from editor marker metadata
 */
export function authoredMaterialAssignments(meta: Record<string, unknown> | undefined): MaterialAssignment[] {
  return meta?.materialAssignments === undefined ? [] : parseMaterialAssignments(meta.materialAssignments);
}

/** Compare selector meaning independently of serialized property order. @internal */
export function sameMaterialSelector(a: MaterialSelector, b: MaterialSelector): boolean {
  return a.mesh === b.mesh && a.slot === b.slot && a.slotIndex === b.slotIndex;
}

/** Apply authored references; document assets and selectors override model defaults of the same identity. */
export function modelWithAuthoredMaterials(model: ModelConfig | undefined, document: Pick<EditorDocument, "markers" | "materialAssets">, instanceId: string): ModelConfig | undefined {
  if (model === undefined) return model;
  const marker = document.markers.find((item) => item.id === instanceId);
  const assignments = authoredMaterialAssignments(marker?.meta);
  const modelAssignments = model.materialAssignments ?? [];
  if (assignments.length === 0 && modelAssignments.length === 0) return model;
  const assetsById = new Map((model.materialAssets ?? []).map((asset) => [asset.id, asset]));
  for (const asset of document.materialAssets ?? []) assetsById.set(asset.id, asset);
  const assets = [...assetsById.values()];
  const resolvedAssignments = [...modelAssignments.filter((item) => !assignments.some((authored) => sameMaterialSelector(item.selector, authored.selector))), ...assignments];
  const errors = validateMaterialAssignments(resolvedAssignments, assets).filter((item) => item.severity === "error");
  if (errors.length > 0) throw new TypeError(errors.map((item) => `${item.path}: ${item.message}`).join("; "));
  return { ...model, materialAssets: assets, materialAssignments: resolvedAssignments };
}
