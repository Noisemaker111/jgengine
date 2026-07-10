import type { ReactNode } from "react";
import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { SimClock } from "@jgengine/core/time/simClock";
import { useGameClock, useGameStore } from "@jgengine/react/hooks";

import { CELL, GRID } from "../catalog";
import { citySignals, resolveCityMetrics } from "../city/metrics";
import { clamp } from "../city/model";
import { activeCharter, cityBuildings, cityPlazas } from "../city/state";

const EXTENT = GRID * CELL;
const ROAD_HALF = EXTENT / 2;
const ROAD_Y = 0.015;
const ROAD_WIDTH = 4.8;
const ROAD_COLOR = "#6f6c62";

const VEHICLE_LIMIT = ROAD_HALF + 8;
const HUMAN_LIMIT = 150;
const VERTICAL_VEHICLES = 5;
const HORIZONTAL_VEHICLES = 4;

const VEHICLE_COLORS = ["#a44b3d", "#d0a541", "#4b6575", "#ddd6c5", "#6a7354", "#c8c0ac", "#82564b", "#4f6d6a", "#a98942"];
const HUMAN_COLORS = ["#af4c3c", "#d3b54a", "#435d71", "#6b714c", "#9a6b88"];
const SKIN_COLOR = "#9a755e";

interface Mover {
  axis: "x" | "z";
  cross: number;
  baseAlong: number;
  dir: number;
  speed: number;
  color: string;
}

const scratch = new THREE.Object3D();
const scratchMatrix = new THREE.Matrix4();
const scratchColor = new THREE.Color();
const CABIN_LOCAL = new THREE.Matrix4().makeTranslation(0, 0.55, 0);
const WHEEL_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
const WHEEL_UNIT = new THREE.Vector3(1, 1, 1);
const WHEEL_FRONT = new THREE.Matrix4().compose(new THREE.Vector3(0, -0.28, 1.2), WHEEL_QUAT, WHEEL_UNIT);
const WHEEL_BACK = new THREE.Matrix4().compose(new THREE.Vector3(0, -0.28, -1.2), WHEEL_QUAT, WHEEL_UNIT);

const wrap = (value: number, min: number, max: number): number => {
  const span = max - min;
  return min + ((((value - min) % span) + span) % span);
};

const peopleCountFor = (ctx: GameContext): number => {
  const buildings = cityBuildings(ctx);
  const plazas = cityPlazas(ctx);
  const charter = activeCharter(ctx);
  const signals = citySignals(resolveCityMetrics(buildings, plazas, charter), charter);
  return Math.round(clamp(36 * (0.48 + signals.activity * 0.006), 6, 48));
};

const RoadBands = memo(function RoadBands(): ReactNode {
  const ref = useRef<THREE.InstancedMesh>(null);
  const bands = useMemo(() => {
    const boundaries = Array.from({ length: GRID - 1 }, (_, i) => (i - (GRID - 2) / 2) * CELL);
    const items: { position: [number, number, number]; scale: [number, number, number] }[] = [];
    for (const v of boundaries) {
      items.push({ position: [v, ROAD_Y, 0], scale: [ROAD_WIDTH, 0.03, EXTENT] });
      items.push({ position: [0, ROAD_Y, v], scale: [EXTENT, 0.03, ROAD_WIDTH] });
    }
    return items;
  }, []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (mesh === null) return;
    bands.forEach((band, index) => {
      scratch.position.set(band.position[0], band.position[1], band.position[2]);
      scratch.rotation.set(0, 0, 0);
      scratch.scale.set(band.scale[0], band.scale[1], band.scale[2]);
      scratch.updateMatrix();
      mesh.setMatrixAt(index, scratch.matrix);
    });
    scratch.scale.set(1, 1, 1);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [bands]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, bands.length]} receiveShadow renderOrder={-1}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={ROAD_COLOR} roughness={1} />
    </instancedMesh>
  );
});

const PopulaceScene = memo(function PopulaceScene({ controls, peopleCount }: { controls: SimClock; peopleCount: number }): ReactNode {
  const vehicleBodies = useRef<THREE.InstancedMesh>(null);
  const vehicleCabins = useRef<THREE.InstancedMesh>(null);
  const vehicleWheels = useRef<THREE.InstancedMesh>(null);
  const humanBodies = useRef<THREE.InstancedMesh>(null);
  const humanHeads = useRef<THREE.InstancedMesh>(null);

  const vehicles = useMemo<Mover[]>(() => {
    const list: Mover[] = [];
    for (let i = 0; i < VERTICAL_VEHICLES; i++) {
      const reverse = i % 2 === 0;
      list.push({
        axis: "z",
        cross: -16 + (reverse ? -1.8 : 1.8),
        baseAlong: -144 + (i * 288) / (VERTICAL_VEHICLES - 1),
        dir: reverse ? -1 : 1,
        speed: 8 + ((i * 53) % 7),
        color: VEHICLE_COLORS[i % VEHICLE_COLORS.length],
      });
    }
    for (let i = 0; i < HORIZONTAL_VEHICLES; i++) {
      const reverse = i % 2 === 1;
      list.push({
        axis: "x",
        cross: 16 + (reverse ? -1.8 : 1.8),
        baseAlong: -144 + (i * 288) / (HORIZONTAL_VEHICLES - 1),
        dir: reverse ? -1 : 1,
        speed: 8 + ((i * 37) % 7),
        color: VEHICLE_COLORS[(i + VERTICAL_VEHICLES) % VEHICLE_COLORS.length],
      });
    }
    return list;
  }, []);

  const humans = useMemo<Mover[]>(() => {
    const list: Mover[] = [];
    const slots = Math.max(1, Math.ceil(peopleCount / 4));
    for (let i = 0; i < peopleCount; i++) {
      const lane = i % 4;
      const slot = Math.floor(i / 4);
      const along = -138 + (slot * 276) / Math.max(1, slots - 1);
      const vertical = lane < 2;
      const cross = vertical ? (lane === 0 ? 12.2 : -12.2) : lane === 2 ? -12.2 : 12.2;
      list.push({
        axis: vertical ? "z" : "x",
        cross,
        baseAlong: along,
        dir: i % 2 === 0 ? 1 : -1,
        speed: 1.3 + (i % 5) * 0.16,
        color: HUMAN_COLORS[i % HUMAN_COLORS.length],
      });
    }
    return list;
  }, [peopleCount]);

  const advance = (now: number): void => {
    const bodies = vehicleBodies.current;
    const cabins = vehicleCabins.current;
    const wheels = vehicleWheels.current;
    if (bodies !== null && cabins !== null && wheels !== null) {
      vehicles.forEach((vehicle, index) => {
        const along = wrap(vehicle.baseAlong + vehicle.dir * vehicle.speed * now, -VEHICLE_LIMIT, VEHICLE_LIMIT);
        const px = vehicle.axis === "x" ? along : vehicle.cross;
        const pz = vehicle.axis === "x" ? vehicle.cross : along;
        scratch.position.set(px, 0.4, pz);
        scratch.rotation.set(0, vehicle.axis === "x" ? Math.PI / 2 : 0, 0);
        scratch.scale.set(1, 1, 1);
        scratch.updateMatrix();
        bodies.setMatrixAt(index, scratch.matrix);
        scratchMatrix.multiplyMatrices(scratch.matrix, CABIN_LOCAL);
        cabins.setMatrixAt(index, scratchMatrix);
        scratchMatrix.multiplyMatrices(scratch.matrix, WHEEL_FRONT);
        wheels.setMatrixAt(index * 2, scratchMatrix);
        scratchMatrix.multiplyMatrices(scratch.matrix, WHEEL_BACK);
        wheels.setMatrixAt(index * 2 + 1, scratchMatrix);
      });
      bodies.instanceMatrix.needsUpdate = true;
      cabins.instanceMatrix.needsUpdate = true;
      wheels.instanceMatrix.needsUpdate = true;
    }
    const figures = humanBodies.current;
    const heads = humanHeads.current;
    if (figures !== null && heads !== null) {
      humans.forEach((human, index) => {
        const along = wrap(human.baseAlong + human.dir * human.speed * now, -HUMAN_LIMIT, HUMAN_LIMIT);
        const px = human.axis === "x" ? along : human.cross;
        const pz = human.axis === "x" ? human.cross : along;
        scratch.rotation.set(0, 0, 0);
        scratch.scale.set(1, 1, 1);
        scratch.position.set(px, 1.65, pz);
        scratch.updateMatrix();
        figures.setMatrixAt(index, scratch.matrix);
        scratch.position.set(px, 2.4, pz);
        scratch.updateMatrix();
        heads.setMatrixAt(index, scratch.matrix);
      });
      figures.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
    }
  };

  useLayoutEffect(() => {
    const bodies = vehicleBodies.current;
    if (bodies !== null) {
      vehicles.forEach((vehicle, index) => bodies.setColorAt(index, scratchColor.set(vehicle.color)));
      if (bodies.instanceColor !== null) bodies.instanceColor.needsUpdate = true;
    }
    const figures = humanBodies.current;
    if (figures !== null) {
      humans.forEach((human, index) => figures.setColorAt(index, scratchColor.set(human.color)));
      if (figures.instanceColor !== null) figures.instanceColor.needsUpdate = true;
    }
    advance(controls.now());
  });

  useFrame(() => advance(controls.now()));

  return (
    <group>
      <RoadBands />
      <instancedMesh ref={vehicleBodies} args={[undefined, undefined, vehicles.length]} frustumCulled={false} castShadow>
        <boxGeometry args={[1.8, 0.7, 4.1]} />
        <meshStandardMaterial metalness={0.35} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={vehicleCabins} args={[undefined, undefined, vehicles.length]} frustumCulled={false}>
        <boxGeometry args={[1.6, 0.55, 2.1]} />
        <meshStandardMaterial color="#26343b" metalness={0.25} roughness={0.2} />
      </instancedMesh>
      <instancedMesh ref={vehicleWheels} args={[undefined, undefined, vehicles.length * 2]} frustumCulled={false}>
        <cylinderGeometry args={[0.3, 0.3, 2.05, 10]} />
        <meshStandardMaterial color="#171918" roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={humanBodies} args={[undefined, undefined, peopleCount]} frustumCulled={false} castShadow>
        <capsuleGeometry args={[0.2, 1.05, 4, 8]} />
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={humanHeads} args={[undefined, undefined, peopleCount]} frustumCulled={false}>
        <sphereGeometry args={[0.24, 10, 10]} />
        <meshStandardMaterial color={SKIN_COLOR} roughness={0.9} />
      </instancedMesh>
    </group>
  );
});

export function Populace(): ReactNode {
  const { controls } = useGameClock();
  const peopleCount = useGameStore(peopleCountFor);
  return <PopulaceScene key={peopleCount} controls={controls} peopleCount={peopleCount} />;
}
