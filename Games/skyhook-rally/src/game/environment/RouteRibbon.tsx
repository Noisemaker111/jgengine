import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGameContext } from "@jgengine/react/provider";
import { usePlayer } from "@jgengine/react/hooks";
import { BufferGeometry, Float32BufferAttribute, InstancedMesh, Line, LineBasicMaterial, MeshBasicMaterial, Object3D, SphereGeometry } from "three";

import { GRAVITY, RIBBON_STEPS, RIBBON_STEP_SECONDS } from "../physics/constants";
import { predictTrajectory } from "../physics/swing";
import { getBridge } from "../runtime/bridge";
import { BANNER_TEAL, RING_GLOW } from "./palette";

const dummy = new Object3D();
const PARKED_Y = -9999;

/**
 * Two live-updated visuals, both driven straight from the flight bridge each
 * frame: the taut rope while attached, and a faint dotted arc previewing
 * where `predictTrajectory` says the courier would fly if released right now
 * (or is already flying, once released).
 */
export function RouteRibbon() {
  const ctx = useGameContext();
  const { userId } = usePlayer();
  const dotsRef = useRef<InstancedMesh>(null);

  const dotGeometry = useMemo(() => new SphereGeometry(0.18, 6, 6), []);
  const dotMaterial = useMemo(() => new MeshBasicMaterial({ color: RING_GLOW, transparent: true, opacity: 0.75 }), []);
  const ropeGeometry = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(6), 3));
    return geometry;
  }, []);
  const ropeMaterial = useMemo(() => new LineBasicMaterial({ color: BANNER_TEAL }), []);
  const ropeLine = useMemo(() => new Line(ropeGeometry, ropeMaterial), [ropeGeometry, ropeMaterial]);

  useEffect(
    () => () => {
      dotGeometry.dispose();
      dotMaterial.dispose();
      ropeGeometry.dispose();
      ropeMaterial.dispose();
    },
    [dotGeometry, dotMaterial, ropeGeometry, ropeMaterial],
  );

  useFrame(() => {
    const bridge = getBridge();
    const entity = ctx.scene.entity.get(userId);
    const dots = dotsRef.current;
    if (entity === null || dots === null) return;

    if (bridge.frozen) {
      for (let i = 0; i < RIBBON_STEPS; i += 1) {
        dummy.position.set(0, PARKED_Y, 0);
        dummy.updateMatrix();
        dots.setMatrixAt(i, dummy.matrix);
      }
      dots.instanceMatrix.needsUpdate = true;
      ropeLine.visible = false;
      return;
    }

    const position = { x: entity.position[0], y: entity.position[1], z: entity.position[2] };
    const points = predictTrajectory(position, bridge.velocity, GRAVITY, RIBBON_STEP_SECONDS, RIBBON_STEPS);
    points.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      const fade = 0.22 - i * (0.16 / RIBBON_STEPS);
      dummy.scale.setScalar(Math.max(0.05, fade));
      dummy.updateMatrix();
      dots.setMatrixAt(i, dummy.matrix);
    });
    dots.instanceMatrix.needsUpdate = true;

    if (bridge.attached && bridge.anchor !== null) {
      ropeLine.visible = true;
      const posAttr = ropeGeometry.getAttribute("position") as Float32BufferAttribute;
      posAttr.setXYZ(0, position.x, position.y, position.z);
      posAttr.setXYZ(1, bridge.anchor.x, bridge.anchor.y, bridge.anchor.z);
      posAttr.needsUpdate = true;
    } else {
      ropeLine.visible = false;
    }
  });

  return (
    <group>
      <instancedMesh ref={dotsRef} args={[dotGeometry, dotMaterial, RIBBON_STEPS]} />
      <primitive object={ropeLine} />
    </group>
  );
}
