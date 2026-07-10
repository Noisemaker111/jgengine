import { seededRng } from "@jgengine/core/random/rng";

import { sectors } from "../course/sectors";
import type { DressingObjectId } from "../objects/catalog";
import { CEILING_Y, FLOOR_Y, SECTOR_COUNT, SECTOR_LENGTH, TUNNEL_HALF_WIDTH, TUNNEL_START_Z, laneX, worldZFor } from "../systems/constants";

export interface DressingPlacement {
  catalogId: DressingObjectId;
  position: readonly [number, number, number];
  visualScale: readonly [number, number, number];
}

const STATION_SPACING = 30;
const TUNNEL_END_Z = TUNNEL_START_Z + SECTOR_COUNT * SECTOR_LENGTH;

export function generateDressing(seed = "magnet-run-dressing"): DressingPlacement[] {
  const rng = seededRng(seed);
  const jitter = (span: number) => (rng() - 0.5) * span;
  const placements: DressingPlacement[] = [];

  for (let z = TUNNEL_START_Z; z < TUNNEL_END_Z; z += STATION_SPACING) {
    const zz = z + jitter(2);
    placements.push({
      catalogId: "pylon",
      position: [-TUNNEL_HALF_WIDTH, 1.5, zz],
      visualScale: [0.5, 3, 0.5],
    });
    placements.push({
      catalogId: "pylon",
      position: [TUNNEL_HALF_WIDTH, 1.5, zz + jitter(1)],
      visualScale: [0.5, 3, 0.5],
    });
    placements.push({
      catalogId: "girder",
      position: [0, CEILING_Y - 0.2, zz],
      visualScale: [TUNNEL_HALF_WIDTH * 2, 0.4, 0.4],
    });

    const stationIndex = Math.round((z - TUNNEL_START_Z) / STATION_SPACING);
    const signalColor: DressingObjectId = stationIndex % 2 === 0 ? "signal_red" : "signal_blue";
    placements.push({
      catalogId: signalColor,
      position: [-TUNNEL_HALF_WIDTH * 0.88, 1.2, zz],
      visualScale: [0.35, 0.35, 0.35],
    });
    if (stationIndex % 2 === 0) {
      placements.push({
        catalogId: signalColor === "signal_red" ? "signal_blue" : "signal_red",
        position: [TUNNEL_HALF_WIDTH * 0.88, 1.2, zz + jitter(1)],
        visualScale: [0.35, 0.35, 0.35],
      });
    }

    if (stationIndex % 2 === 1) {
      const side = stationIndex % 4 === 1 ? -1 : 1;
      placements.push({
        catalogId: "duct_pipe",
        position: [side * (TUNNEL_HALF_WIDTH - 0.3), CEILING_Y - 0.7, zz],
        visualScale: [0.35, 0.35, 6],
      });
    }

    if (stationIndex % 4 === 0) {
      const side = stationIndex % 8 === 0 ? -1 : 1;
      placements.push({
        catalogId: "control_panel",
        position: [side * (TUNNEL_HALF_WIDTH - 0.6), 0.6, zz],
        visualScale: [0.8, 1.2, 0.5],
      });
    }
  }

  for (const sector of sectors) {
    for (const gate of sector.gates) {
      placements.push({
        catalogId: "caution_marker",
        position: [
          laneX(gate.lane),
          gate.surface === "ceiling" ? CEILING_Y - 0.04 : FLOOR_Y + 0.04,
          worldZFor(sector.index, gate.z),
        ],
        visualScale: [gate.width + 1.0, 0.08, 1.0],
      });
    }
  }

  return placements;
}
