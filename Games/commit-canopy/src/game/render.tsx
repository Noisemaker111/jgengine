import { useEngineState } from "@jgengine/react/engineStore";
import { DataObjects } from "@jgengine/shell/world/DataObjects";

import { DAYS, WEEKS } from "@jgengine/github";

import { CANOPY_PALETTE, heightForCount, levelColor } from "./palette";
import { store } from "./store";

const CELL_PITCH = 0.34;
const CELL_SIZE = 0.28;
const GRID_WIDTH = WEEKS * CELL_PITCH;
const GRID_DEPTH = DAYS * CELL_PITCH;

const KEY_LIGHT = { position: [6, 12, 4] as const, intensity: 1.15 };
const SKY_LIGHT = { sky: "#2ea043", ground: "#05070a", intensity: 0.35 };

function cellX(week: number): number {
  return (week - (WEEKS - 1) / 2) * CELL_PITCH;
}

function cellZ(weekday: number): number {
  return (weekday - (DAYS - 1) / 2) * CELL_PITCH;
}

function CanopyLights() {
  return (
    <>
      <hemisphereLight args={[SKY_LIGHT.sky, SKY_LIGHT.ground, SKY_LIGHT.intensity]} />
      <directionalLight position={KEY_LIGHT.position} intensity={KEY_LIGHT.intensity} castShadow />
    </>
  );
}

export function CanopyEnvironment() {
  const state = useEngineState(store);
  return (
    <>
      <color attach="background" args={[CANOPY_PALETTE.background]} />
      <fog attach="fog" args={[CANOPY_PALETTE.background, 16, 34]} />
      <CanopyLights />
      <mesh position={[0, -0.06, 0]} receiveShadow>
        <boxGeometry args={[GRID_WIDTH + 1.4, 0.12, GRID_DEPTH + 1.4]} />
        <meshStandardMaterial color={CANOPY_PALETTE.base} roughness={0.9} />
      </mesh>
      <DataObjects
        data={state.cells}
        position={(cell) => [cellX(cell.week), cellZ(cell.weekday)]}
        height={(cell) => heightForCount(cell.count)}
        color={(cell) => levelColor(cell.level)}
        cellSize={CELL_SIZE}
        hovered={state.hovered}
        onHover={store.setHovered}
        hoverColor="#eafff0"
        grow={{ duration: 0.55, delay: (cell) => cell.week * 0.012 }}
      />
    </>
  );
}
