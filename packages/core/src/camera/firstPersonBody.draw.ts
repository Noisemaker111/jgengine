import { createContext, useContext } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import { detectHumanoidRig } from "@jgengine/core/anim/skeletonStandard";

export const FirstPersonBodyContext = createContext<string | null>(null);

let drawFirstPersonBody: string | null = null;

export function noteFirstPersonBody(instanceId: string | null): void {
  drawFirstPersonBody = instanceId;
}

export function firstPersonBodyInstance(): string | null {
  return drawFirstPersonBody;
}

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

export function collapseHead(head: THREE.Object3D): void {
  head.scale.setScalar(COLLAPSED);
}

const headWorld = new THREE.Vector3();
const eyeWorld = new THREE.Vector3();
const eyeLocal = new THREE.Vector3();
const headLocal = new THREE.Vector3();

export function keepHeadUnderEye(body: THREE.Object3D, head: THREE.Object3D, eye: THREE.Object3D, rest: THREE.Vector3): void {
  body.position.copy(rest);
  const parent = body.parent;
  if (parent === null) return;
  head.getWorldPosition(headWorld);
  eye.getWorldPosition(eyeWorld);
  eyeLocal.set(eyeWorld.x, headWorld.y, eyeWorld.z);
  parent.worldToLocal(eyeLocal);
  parent.worldToLocal(headLocal.copy(headWorld));
  body.position.add(eyeLocal.sub(headLocal));
}
