import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef, type ComponentRef } from "react";
import { MOUSE } from "three";

type OrbitControlsImpl = NonNullable<ComponentRef<typeof OrbitControls>>;

import {
  resolveInspectionCameraConfig,
  resolveInspectionZoomToCursor,
  seedInspectionCamera,
  type InspectionCameraConfig,
} from "./inspectionCameraMath";

export interface GameInspectionCameraProps {
  config?: InspectionCameraConfig;
}

/** Model-viewer style rig (#207.7): left-drag orbit, middle/right-drag pan, scroll zoom toward a configurable anchor. Orbits a fixed `target`; never reads player/entity state. */
export function GameInspectionCamera({ config: configPatch }: GameInspectionCameraProps) {
  const config = resolveInspectionCameraConfig(configPatch);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const camera = useThree((state) => state.camera);
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;
    const seeded = seedInspectionCamera(config);
    camera.position.set(seeded.camera.x, seeded.camera.y, seeded.camera.z);
    camera.lookAt(seeded.target.x, seeded.target.y, seeded.target.z);
    controlsRef.current?.target.set(seeded.target.x, seeded.target.y, seeded.target.z);
    controlsRef.current?.update();
    seededRef.current = true;
  }, [camera, config]);

  useEffect(() => {
    if (!seededRef.current) return;
    const controls = controlsRef.current;
    if (controls === null) return;
    const previous = controls.target.clone();
    controls.target.set(config.target.x, config.target.y, config.target.z);
    camera.position.add(controls.target.clone().sub(previous));
    controls.update();
  }, [camera, config.target.x, config.target.y, config.target.z]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={config.dampingFactor}
      rotateSpeed={config.rotateSpeed}
      zoomSpeed={config.zoomSpeed}
      zoomToCursor={resolveInspectionZoomToCursor(config.anchor)}
      enablePan={config.pan}
      enableRotate
      enableZoom
      minDistance={config.minDistance}
      maxDistance={config.maxDistance}
      minPolarAngle={config.minPolarAngle}
      maxPolarAngle={config.maxPolarAngle}
      screenSpacePanning
      mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN }}
    />
  );
}
