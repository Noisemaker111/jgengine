import { useThree } from "@react-three/fiber";
import { memo, useEffect } from "react";
import * as THREE from "three";

import { ASSET_DRAG_MIME, decodeAssetDragPayload } from "./AssetBrowser";
import { decodeLibraryDragPayload, LIBRARY_DRAG_MIME, type LibraryDropTarget } from "./libraryDrag";
import type { EditorHostApi } from "./session";

const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/**
 * Viewport drop target for content-browser assets. Drops call `place_asset` at the ground hit
 * (or the host focus target when the ray misses); a shared-library card goes to `library`'s handler,
 * which pulls the asset first. No-op when the payload is not an asset drag.
 * @internal — mounted by `EditorApp`'s world overlay.
 */
export const AssetDropZone = memo(function AssetDropZone({ api, library }: { api: EditorHostApi; library?: LibraryDropTarget | undefined }) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const planeHit = new THREE.Vector3();

    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer === null) return;
      const types = event.dataTransfer.types;
      if (!types.includes(ASSET_DRAG_MIME) && !(library !== undefined && types.includes(LIBRARY_DRAG_MIME))) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    };

    const groundAt = (clientX: number, clientY: number): { x: number; y: number; z: number } => {
      const rect = canvas.getBoundingClientRect();
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      for (const hit of raycaster.intersectObjects(scene.children, true)) {
        if (!(hit.object as THREE.Mesh).isMesh || hit.object.visible === false) continue;
        if (hit.object.type.startsWith("TransformControls")) continue;
        return { x: hit.point.x, y: hit.point.y, z: hit.point.z };
      }
      if (raycaster.ray.intersectPlane(GROUND_PLANE, planeHit) !== null) {
        return { x: planeHit.x, y: planeHit.y, z: planeHit.z };
      }
      return api.getFocusTarget() ?? { x: 0, y: 0, z: 0 };
    };

    const onDrop = (event: DragEvent) => {
      const libraryPayload = decodeLibraryDragPayload(event.dataTransfer?.getData(LIBRARY_DRAG_MIME) ?? "");
      if (libraryPayload !== null && library?.handler != null) {
        event.preventDefault();
        library.handler(libraryPayload, groundAt(event.clientX, event.clientY));
        return;
      }
      const entry = decodeAssetDragPayload(event.dataTransfer?.getData(ASSET_DRAG_MIME) ?? "");
      if (entry === null) return;
      event.preventDefault();
      const position = groundAt(event.clientX, event.clientY);
      api.handle({
        method: "place_asset",
        id: entry.id,
        kind: entry.kind === "model" ? "prop" : entry.kind,
        x: position.x,
        y: position.y,
        z: position.z,
      });
    };

    canvas.addEventListener("dragover", onDragOver);
    canvas.addEventListener("drop", onDrop);
    return () => {
      canvas.removeEventListener("dragover", onDragOver);
      canvas.removeEventListener("drop", onDrop);
    };
  }, [gl, camera, scene, api, library]);

  return null;
});
