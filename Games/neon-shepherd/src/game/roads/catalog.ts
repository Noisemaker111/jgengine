import { ROAD_Z } from "../constants";
import type { VehicleTypeId } from "../vehicles/catalog";

export interface LaneDef {
  vehicle: VehicleTypeId;
  direction: 1 | -1;
  laneOffsetZ: number;
  period: number;
  phaseOffset: number;
  fixedTimes?: readonly number[];
  cycleLength?: number;
}

export interface RoadDef {
  id: string;
  label: string;
  z: number;
  halfDepth: number;
  lanes: readonly LaneDef[];
}

const SCOOTER_PERIOD = 4.6;
const SEDAN_PERIOD = 6.8;
const VAN_PERIOD = 8.4;
const BUS_PERIOD = 12;

export const ROADS: readonly RoadDef[] = [
  {
    id: "road-1",
    label: "Verge Row",
    z: ROAD_Z[0]!,
    halfDepth: 3,
    lanes: [
      { vehicle: "scooter", direction: 1, laneOffsetZ: -1.1, period: SCOOTER_PERIOD, phaseOffset: 0.4 },
      { vehicle: "sedan", direction: -1, laneOffsetZ: 1.1, period: SEDAN_PERIOD, phaseOffset: 2.6 },
    ],
  },
  {
    id: "road-2",
    label: "Halide Street",
    z: ROAD_Z[1]!,
    halfDepth: 3.2,
    lanes: [
      { vehicle: "sedan", direction: 1, laneOffsetZ: -1.6, period: SEDAN_PERIOD, phaseOffset: 0 },
      { vehicle: "van", direction: -1, laneOffsetZ: 0.1, period: VAN_PERIOD, phaseOffset: 2.4 },
      { vehicle: "scooter", direction: 1, laneOffsetZ: 1.7, period: SCOOTER_PERIOD, phaseOffset: 1.4 },
    ],
  },
  {
    id: "road-3",
    label: "Marrow Boulevard",
    z: ROAD_Z[2]!,
    halfDepth: 3.4,
    lanes: [
      { vehicle: "bus", direction: -1, laneOffsetZ: -1.7, period: BUS_PERIOD, phaseOffset: 3 },
      { vehicle: "scooter", direction: 1, laneOffsetZ: -0.4, period: SCOOTER_PERIOD, phaseOffset: 0.6 },
      { vehicle: "sedan", direction: 1, laneOffsetZ: 1.6, period: SEDAN_PERIOD, phaseOffset: 1.9 },
    ],
  },
  {
    id: "road-4",
    label: "Ashlight Circuit",
    z: ROAD_Z[3]!,
    halfDepth: 3.6,
    lanes: [
      { vehicle: "van", direction: 1, laneOffsetZ: -1.9, period: VAN_PERIOD, phaseOffset: 0 },
      { vehicle: "scooter", direction: -1, laneOffsetZ: -0.8, period: SCOOTER_PERIOD, phaseOffset: 1.5 },
      { vehicle: "scooter", direction: 1, laneOffsetZ: 0.6, period: SCOOTER_PERIOD, phaseOffset: 3.1 },
      { vehicle: "sedan", direction: -1, laneOffsetZ: 1.9, period: SEDAN_PERIOD, phaseOffset: 4.6 },
    ],
  },
  {
    id: "road-5",
    label: "Cinder Transit",
    z: ROAD_Z[4]!,
    halfDepth: 4,
    lanes: [
      { vehicle: "tram", direction: 1, laneOffsetZ: 0, period: 40, phaseOffset: 0, fixedTimes: [0, 10, 20, 30], cycleLength: 40 },
      { vehicle: "bus", direction: -1, laneOffsetZ: -1.8, period: BUS_PERIOD, phaseOffset: 4 },
      { vehicle: "scooter", direction: 1, laneOffsetZ: -2.9, period: SCOOTER_PERIOD, phaseOffset: 0.9 },
      { vehicle: "van", direction: -1, laneOffsetZ: 2.7, period: VAN_PERIOD, phaseOffset: 5.6 },
    ],
  },
  {
    id: "road-6",
    label: "Vesperlight Approach",
    z: ROAD_Z[5]!,
    halfDepth: 4.2,
    lanes: [
      { vehicle: "bus", direction: -1, laneOffsetZ: -2.4, period: BUS_PERIOD, phaseOffset: 1.5 },
      { vehicle: "tram", direction: -1, laneOffsetZ: 0.2, period: 36, phaseOffset: 0, fixedTimes: [4, 15, 26], cycleLength: 36 },
      { vehicle: "scooter", direction: 1, laneOffsetZ: -1, period: SCOOTER_PERIOD, phaseOffset: 0 },
      { vehicle: "scooter", direction: -1, laneOffsetZ: 1.3, period: SCOOTER_PERIOD, phaseOffset: 2.3 },
      { vehicle: "sedan", direction: 1, laneOffsetZ: 2.8, period: SEDAN_PERIOD, phaseOffset: 3.4 },
    ],
  },
];
