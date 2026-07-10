import { useMemo } from "react";
import { SkyDaylight } from "@jgengine/shell/environment";
import { CarvedTerrain } from "@jgengine/shell/terrain";
import { resolveTerrainField } from "@jgengine/core/world/terrain";
import type { EnvironmentWorldFeature } from "@jgengine/core/world/features";
import { world } from "../../world";
import { buildCarvedField } from "../craters/craterField";
import { useCraterField } from "../match/hooks";
import { CENTER_CIRCLE_RADIUS, GOAL_HALF_WIDTH, GOAL_LINE_X } from "../arena/geometry";

const envWorld = world as EnvironmentWorldFeature;

function GoalGlow({ x, color }: { x: number; color: string }) {
  return (
    <group position={[x, 0.06, 0]}>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1.8, GOAL_HALF_WIDTH * 2]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

function CenterCircle() {
  return (
    <mesh position={[0, 0.04, 0]} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[CENTER_CIRCLE_RADIUS - 0.18, CENTER_CIRCLE_RADIUS, 48]} />
      <meshStandardMaterial color="#e2d3b4" emissive="#ff6b35" emissiveIntensity={0.12} />
    </mesh>
  );
}

export function Environment() {
  const baseField = useMemo(() => resolveTerrainField(envWorld.terrain), []);
  const craters = useCraterField();
  const carvedField = useMemo(() => buildCarvedField(baseField, craters.records), [baseField, craters.records]);
  const bounds = envWorld.terrain?.bounds ?? { w: 120, d: 100 };

  return (
    <>
      {envWorld.sky !== undefined ? <SkyDaylight sky={envWorld.sky} /> : null}
      <CarvedTerrain
        field={carvedField}
        size={[bounds.w, bounds.d]}
        segments={envWorld.terrain?.segments}
        colors={{ low: "#23201d", high: "#cdb891" }}
        heightRange={[-3, 1]}
      />
      <CenterCircle />
      <GoalGlow x={-GOAL_LINE_X} color="#3bc7c4" />
      <GoalGlow x={GOAL_LINE_X} color="#d94a8c" />
    </>
  );
}
