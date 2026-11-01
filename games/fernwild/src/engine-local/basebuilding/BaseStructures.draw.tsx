// framework-ok: only Fernwild uses this; the second adopter extracts it (#2837)
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { BaseBuilding, StructurePlan, StructureWorldBox } from "./baseBuilding";

/** Props for {@link BaseStructures}. */
export interface BaseStructuresProps {
  building: BaseBuilding;
  /** Base colour of a piece, usually by tier. */
  colorOf: (pieceId: string) => string;
  /** The build ghost to show this frame, read every frame. */
  ghost?: () => StructurePlan | null;
  validColor?: string;
  invalidColor?: string;
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

function BoxMesh({ box, material, solid = true }: { box: StructureWorldBox; material: THREE.Material; solid?: boolean }) {
  return (
    <mesh
      geometry={UNIT_BOX}
      material={material}
      position={box.center as [number, number, number]}
      rotation-y={box.rotationY}
      scale={[box.halfExtents[0] * 2, box.halfExtents[1] * 2, box.halfExtents[2] * 2]}
      castShadow={solid}
      receiveShadow={solid}
    />
  );
}

/**
 * Draws a base-building model: every placed piece as its solid boxes, darkened as it loses health, plus
 * the build ghost tinted valid or invalid. Re-renders only when the model's version moves or the ghost
 * changes.
 *
 * @capability base-structures-draw render placed base pieces and the snap build ghost
 */
export function BaseStructures({ building, colorOf, ghost, validColor = "#34d399", invalidColor = "#f87171" }: BaseStructuresProps) {
  const [version, setVersion] = useState(building.version());
  const [plan, setPlan] = useState<StructurePlan | null>(null);
  const planKey = useRef("");
  const materials = useRef(new Map<string, THREE.MeshStandardMaterial>());

  useFrame(() => {
    const now = building.version();
    if (now !== version) setVersion(now);
    const next = ghost?.() ?? null;
    const key = next === null ? "" : `${next.pieceId}|${next.position.map((value) => value.toFixed(2)).join(",")}|${next.rotationY.toFixed(3)}|${next.valid}`;
    if (key !== planKey.current) {
      planKey.current = key;
      setPlan(next);
    }
  });

  const materialFor = (color: string): THREE.MeshStandardMaterial => {
    let material = materials.current.get(color);
    if (material === undefined) {
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
      materials.current.set(color, material);
    }
    return material;
  };

  const pieces = useMemo(() => {
    return building.list().map((piece) => {
      const max = building.piece(piece.pieceId)?.health ?? piece.health;
      const ratio = max > 0 ? piece.health / max : 1;
      // Quantised so a chipped wall reuses a handful of materials instead of one per hit point.
      const shade = 0.55 + 0.45 * Math.round(ratio * 4) / 4;
      const color = `#${new THREE.Color(colorOf(piece.pieceId)).multiplyScalar(shade).getHexString()}`;
      return { id: piece.id, boxes: building.worldBoxes(piece), material: materialFor(color) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building, version, colorOf]);

  const ghostMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4, depthWrite: false, emissiveIntensity: 0.5 }),
    [],
  );
  const ghostColor = plan?.valid === true ? validColor : invalidColor;
  ghostMaterial.color.set(ghostColor);
  ghostMaterial.emissive.set(ghostColor);

  return (
    <group>
      {pieces.map((piece) => (
        <group key={piece.id}>
          {piece.boxes.map((box, index) => (
            <BoxMesh key={index} box={box} material={piece.material} />
          ))}
        </group>
      ))}
      {plan === null
        ? null
        : building.worldBoxes(plan).map((box, index) => <BoxMesh key={`ghost${index}`} box={box} material={ghostMaterial} solid={false} />)}
    </group>
  );
}
