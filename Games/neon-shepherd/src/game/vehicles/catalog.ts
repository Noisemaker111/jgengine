export type VehicleTypeId = "scooter" | "sedan" | "van" | "bus" | "tram";

export interface VehicleTypeDef {
  id: VehicleTypeId;
  label: string;
  speed: number;
  length: number;
  width: number;
  height: number;
  color: string;
  glow: string;
}

export const VEHICLE_TYPES: Record<VehicleTypeId, VehicleTypeDef> = {
  scooter: {
    id: "scooter",
    label: "Night Scooter",
    speed: 11,
    length: 1.1,
    width: 0.7,
    height: 0.9,
    color: "#f5c56b",
    glow: "#ffe7ad",
  },
  sedan: {
    id: "sedan",
    label: "Taxi Sedan",
    speed: 7.5,
    length: 2.3,
    width: 1.3,
    height: 1.1,
    color: "#8a93a6",
    glow: "#cfd7e4",
  },
  van: {
    id: "van",
    label: "Delivery Van",
    speed: 6,
    length: 3.2,
    width: 1.5,
    height: 1.7,
    color: "#5b6472",
    glow: "#9aa4b5",
  },
  bus: {
    id: "bus",
    label: "Night Bus",
    speed: 4.2,
    length: 6.4,
    width: 1.7,
    height: 2.1,
    color: "#e2726b",
    glow: "#ffb3ab",
  },
  tram: {
    id: "tram",
    label: "Line 9 Tram",
    speed: 5,
    length: 9.5,
    width: 1.9,
    height: 2.4,
    color: "#7ca7e0",
    glow: "#bcdcff",
  },
};

export const VEHICLE_TYPE_IDS: readonly VehicleTypeId[] = ["scooter", "sedan", "van", "bus", "tram"];
