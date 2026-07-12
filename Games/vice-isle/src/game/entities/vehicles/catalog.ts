export interface VehicleDef {
  id: string;
  label: string;
  body: string;
  cabin: string;
  price: number;
}

export const VEHICLES: readonly VehicleDef[] = [
  { id: "car_compact", label: "Pico", body: "#f2c14e", cabin: "#26292f", price: 800 },
  { id: "car_muscle", label: "Bandolero", body: "#d64545", cabin: "#26292f", price: 2400 },
  { id: "car_sport", label: "Cicada GT", body: "#33c1b1", cabin: "#1f2228", price: 6500 },
  { id: "car_cop", label: "VCPD Cruiser", body: "#e8ecf2", cabin: "#1b2f52", price: 0 },
];

export const vehicleById = (id: string): VehicleDef | undefined => VEHICLES.find((v) => v.id === id);

export function vehicleEntry() {
  return {
    role: "vehicle" as const,
    movement: { walkSpeed: 0 },
    stats: { health: { max: 300, min: 0 } },
    receive: { damage: { order: ["health"] } },
  };
}
