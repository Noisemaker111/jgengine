import { createContext, useContext } from "react";
import type * as THREE from "three";

import { detectHumanoidRig } from "@jgengine/core/anim/skeletonStandard";

/**
 * The entity whose own body the first-person camera looks out of, or `null` when no body is drawn
 * in first person. The shell provides it; a model instance bound to that entity collapses its head.
 */
export const FirstPersonBodyContext = createContext<string | null>(null);

/** True when `instanceId` is the body the first-person camera sits in. */
export function useFirstPersonBody(instanceId: string | undefined): boolean {
  const body = useContext(FirstPersonBodyContext);
  return instanceId !== undefined && body === instanceId;
}

const COLLAPSED = 1e-3;

/**
 * The head bone of a humanoid rig the skeleton standard maps, or `null`. Scaling it to nothing
 * folds the head, hair and face into the neck, so a camera at eye height sees the body's arms,
 * hands and held items without looking out through the inside of the skull.
 */
export function humanoidHead(scene: THREE.Object3D): THREE.Object3D | null {
  const names: string[] = [];
  scene.traverse((node) => {
    if (node.name.length > 0) names.push(node.name);
  });
  const head = detectHumanoidRig(names)?.slots.head;
  return head === undefined ? null : (scene.getObjectByName(head) ?? null);
}

/** Folds a head bone away for this frame; the animation writes its pose first, so call it after. */
export function collapseHead(head: THREE.Object3D): void {
  head.scale.setScalar(COLLAPSED);
}
