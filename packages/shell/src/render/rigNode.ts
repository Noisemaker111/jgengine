import type { Object3D } from "three";

/** A missing or nonunique node reference that a rig author can repair. */
export interface RigNodeDiagnostic {
  code: "missing-node" | "ambiguous-node";
  message: string;
}

/** A node on this model instance, or a diagnostic instead of an arbitrary attachment target. */
export type RigNodeResolution =
  | { node: Object3D; matchedBy: "runtime" | "authored"; diagnostic?: undefined }
  | { node: undefined; matchedBy?: undefined; diagnostic: RigNodeDiagnostic };

/**
 * Resolves a bone or attachment slot by its exact runtime name first, then by the original
 * imported name preserved as `userData.name`. GLTFLoader sanitizes names such as `handslot.r`
 * to `handslotr`; authored references remain usable without renaming the animated hierarchy.
 * Both lookups require a unique target. Call on model load or slot changes, not each frame,
 * and keep the result with that model instance rather than reusing a cached asset's node.
 *
 * @capability imported-rig-node resolve original imported bone and slot names with ambiguity diagnostics
 */
export function resolveRigNode(rig: Object3D, name: string): RigNodeResolution {
  const exact: Object3D[] = [];
  const authored: Object3D[] = [];
  rig.traverse((node) => {
    if (node.name === name) exact.push(node);
    if (node.userData.name === name) authored.push(node);
  });
  const matches = exact.length > 0 ? exact : authored;
  const matchedBy = exact.length > 0 ? "runtime" : "authored";
  if (matches.length === 1) return { node: matches[0]!, matchedBy };
  if (matches.length > 1) return {
    node: undefined,
    diagnostic: { code: "ambiguous-node", message: `bone/slot "${name}" matches ${matches.length} ${matchedBy} names on this rig. Choose a unique runtime node name or repair duplicate imported names; no node was selected.` },
  };
  return {
    node: undefined,
    diagnostic: { code: "missing-node", message: `bone/slot "${name}" was not found by runtime or original imported name on this rig. Check the model's node names and configure a supported slot.` },
  };
}
