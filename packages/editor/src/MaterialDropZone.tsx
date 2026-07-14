import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";

import { MATERIAL_DRAG_MIME } from "./AssetBrowser";
import type { EditorHostApi } from "./session";

const SELECT_TAGS = ["jgEditorId", "jgEntityId", "jgObjectId"] as const;
const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/**
 * Viewport half of drag-drop material assignment: drop a material chip (dragged from the asset
 * browser's palette) onto a tagged object to assign it, or onto bare ground/terrain to paint that
 * material at the drop point. No-op when the drag payload isn't a material id.
 * @internal — mounted by `EditorApp`'s world overlay.
 */
export function MaterialDropZone({ api }: { api: EditorHostApi }) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const planeHit = new THREE.Vector3();

    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer === null || !event.dataTransfer.types.includes(MATERIAL_DRAG_MIME)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    };

    const onDrop = (event: DragEvent) => {
      const materialId = event.dataTransfer?.getData(MATERIAL_DRAG_MIME) ?? "";
      if (materialId.length === 0) return;
      event.preventDefault();

      const rect = canvas.getBoundingClientRect();
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);

      for (const hit of raycaster.intersectObjects(scene.children, true)) {
        if (!(hit.object as THREE.Mesh).isMesh || hit.object.visible === false) continue;
        let node: THREE.Object3D | null = hit.object;
        let taggedId: string | null = null;
        let gizmoHit = false;
        while (node !== null && taggedId === null && !gizmoHit) {
          if (node.type.startsWith("TransformControls")) gizmoHit = true;
          for (const tag of SELECT_TAGS) {
            const id = node.userData[tag];
            if (typeof id === "string") {
              taggedId = id;
              break;
            }
          }
          node = node.parent;
        }
        if (gizmoHit) continue;
        if (taggedId !== null) {
          api.handle({ method: "assign_material", ids: [taggedId], materialId });
          return;
        }
        break;
      }

      const terrain = api.getSession().getState().document.terrain;
      if (terrain === undefined) return;
      if (raycaster.ray.intersectPlane(GROUND_PLANE, planeHit) === null) return;
      api.handle({ method: "paint_terrain", surface: materialId, x: planeHit.x, z: planeHit.z });
    };

    canvas.addEventListener("dragover", onDragOver);
    canvas.addEventListener("drop", onDrop);
    return () => {
      canvas.removeEventListener("dragover", onDragOver);
      canvas.removeEventListener("drop", onDrop);
    };
  }, [gl, camera, scene, api]);

  return null;
}
