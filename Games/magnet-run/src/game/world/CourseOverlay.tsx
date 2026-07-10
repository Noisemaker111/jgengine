import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";

import { useGameContext } from "@jgengine/react/provider";

import { sectors } from "../course/sectors";
import { trainLineList } from "../course/trainLines";
import { CEILING_Y, FLOOR_Y, LANE_WIDTH, TRAIN_ROOF_Y, laneX, worldZFor } from "../systems/constants";
import { PALETTE, POLARITY_COLOR } from "../systems/palette";
import { isTrainOnTrack, trainWindowAt } from "../systems/trains";

const STRIP_THICKNESS = 0.06;

function StripPlate({ sectorIndex, fromZ, toZ, lane, surface, polarity }: {
  sectorIndex: number;
  fromZ: number;
  toZ: number;
  lane: 0 | 1 | 2;
  surface: "floor" | "ceiling";
  polarity: "red" | "blue";
}) {
  const length = toZ - fromZ;
  const z = worldZFor(sectorIndex, (fromZ + toZ) / 2);
  const y = surface === "floor" ? FLOOR_Y + STRIP_THICKNESS / 2 : CEILING_Y - STRIP_THICKNESS / 2;
  return (
    <mesh position={[laneX(lane), y, z]}>
      <boxGeometry args={[LANE_WIDTH * 0.86, STRIP_THICKNESS, Math.max(0.2, length - 0.3)]} />
      <meshStandardMaterial
        color={POLARITY_COLOR[polarity]}
        emissive={POLARITY_COLOR[polarity]}
        emissiveIntensity={0.5}
        metalness={0.3}
        roughness={0.4}
      />
    </mesh>
  );
}

function GatePlate({ sectorIndex, z, lane, surface, requires, width }: {
  sectorIndex: number;
  z: number;
  lane: 0 | 1 | 2;
  surface: "floor" | "ceiling";
  requires: "red" | "blue";
  width: number;
}) {
  const worldZ = worldZFor(sectorIndex, z);
  const y = surface === "floor" ? 1.3 : CEILING_Y - 1.3;
  return (
    <group position={[laneX(lane), y, worldZ]}>
      <mesh>
        <boxGeometry args={[LANE_WIDTH * 0.94, 2.4, Math.max(0.15, width)]} />
        <meshStandardMaterial color={PALETTE.cautionStripe} transparent opacity={0.22} />
      </mesh>
      <mesh>
        <boxGeometry args={[LANE_WIDTH * 0.94, 0.14, Math.max(0.2, width + 0.05)]} />
        <meshStandardMaterial color={POLARITY_COLOR[requires]} emissive={POLARITY_COLOR[requires]} emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

function TrainCar({ lineIndex }: { lineIndex: number }) {
  const ctx = useGameContext();
  const meshRef = useRef<Mesh>(null);
  const line = trainLineList[lineIndex]!;

  useFrame(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    const now = ctx.time.now();
    const window = trainWindowAt(line, now);
    const onTrack = isTrainOnTrack(line, window);
    mesh.visible = onTrack;
    if (!onTrack) return;
    const midZ = (window.headZ + window.tailZ) / 2;
    mesh.position.set(laneX(line.lane), TRAIN_ROOF_Y - 0.5, midZ);
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[LANE_WIDTH * 0.92, 2.0, line.length - 1]} />
      <meshStandardMaterial color={POLARITY_COLOR[line.roofPolarity]} metalness={0.6} roughness={0.35} />
    </mesh>
  );
}

export function CourseOverlay() {
  return (
    <group>
      {sectors.flatMap((sector) =>
        sector.strips.map((segment, i) => (
          <StripPlate
            key={`${sector.id}-strip-${i}`}
            sectorIndex={sector.index}
            fromZ={segment.fromZ}
            toZ={segment.toZ}
            lane={segment.lane}
            surface={segment.surface}
            polarity={segment.polarity}
          />
        )),
      )}
      {sectors.flatMap((sector) =>
        sector.gates.map((gate, i) => (
          <GatePlate
            key={`${sector.id}-gate-${i}`}
            sectorIndex={sector.index}
            z={gate.z}
            lane={gate.lane}
            surface={gate.surface}
            requires={gate.requires}
            width={gate.width}
          />
        )),
      )}
      {trainLineList.map((_, i) => (
        <TrainCar key={`train-${i}`} lineIndex={i} />
      ))}
    </group>
  );
}
