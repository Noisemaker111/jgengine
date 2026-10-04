import type { Object3D } from "three";
import { parseModelHiddenNodes } from "@jgengine/core/editor/modelNodeVisibility";
import { resolveRigNode, type RigNodeDiagnostic } from "./rigNode";

/** Order and duplicate references do not change a model instance's visibility selection. @internal */
export function modelHiddenNodesKey(names: readonly string[] = []): string {
  return JSON.stringify([...new Set(names)].sort());
}

/** Apply visibility only to uniquely resolved nodes on an owned clone, retaining imported hidden state and rig hierarchy. @internal */
export function applyModelNodeVisibility(root: Object3D, names: readonly string[] = []): RigNodeDiagnostic[] {
  const diagnostics: RigNodeDiagnostic[] = [];
  for (const name of new Set(parseModelHiddenNodes(names))) {
    const resolved = resolveRigNode(root, name);
    if (resolved.node === undefined) diagnostics.push(resolved.diagnostic);
    else resolved.node.visible = false;
  }
  return diagnostics;
}
