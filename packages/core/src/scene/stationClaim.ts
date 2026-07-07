import { createMountController, MountController, type MountKit } from "./mount";

export interface Station {
  id: string;
  facet: string;
  offset: readonly [number, number, number];
  control?: boolean;
}

export interface SharedVehicleConfig {
  id: string;
  kit: MountKit;
  stations: readonly Station[];
}

export type ClaimResult =
  | { ok: true; station: Station }
  | { ok: false; reason: "unknown_vehicle" | "unknown_facet" | "station_taken" | "vehicle_full" };

interface RegisteredVehicle {
  config: SharedVehicleConfig;
  byStationId: Map<string, Station>;
  facetToStation: Map<string, string>;
}

export class StationClaim {
  private readonly controller: MountController;
  private readonly vehicles = new Map<string, RegisteredVehicle>();

  constructor(controller?: MountController) {
    this.controller = controller ?? createMountController();
  }

  register(config: SharedVehicleConfig): void {
    const byStationId = new Map<string, Station>();
    const facetToStation = new Map<string, string>();
    for (const station of config.stations) {
      byStationId.set(station.id, station);
      if (!facetToStation.has(station.facet)) facetToStation.set(station.facet, station.id);
    }
    this.vehicles.set(config.id, { config, byStationId, facetToStation });
    this.controller.register({
      id: config.id,
      kit: config.kit,
      seats: config.stations.map((station) => ({
        id: station.id,
        offset: station.offset,
        control: station.control,
      })),
    });
  }

  private resolveStation(vehicle: RegisteredVehicle, facetOrStationId: string): Station | null {
    const direct = vehicle.byStationId.get(facetOrStationId);
    if (direct !== undefined) return direct;
    const stationId = vehicle.facetToStation.get(facetOrStationId);
    if (stationId === undefined) return null;
    return vehicle.byStationId.get(stationId) ?? null;
  }

  claim(playerId: string, vehicleId: string, facetOrStationId: string): ClaimResult {
    const vehicle = this.vehicles.get(vehicleId);
    if (vehicle === undefined) return { ok: false, reason: "unknown_vehicle" };
    const station = this.resolveStation(vehicle, facetOrStationId);
    if (station === null) return { ok: false, reason: "unknown_facet" };
    const result = this.controller.mount(playerId, vehicleId, station.id);
    if (!result.ok) {
      return { ok: false, reason: result.reason === "seat_taken" ? "station_taken" : "vehicle_full" };
    }
    return { ok: true, station };
  }

  release(playerId: string): string | null {
    return this.controller.dismount(playerId);
  }

  facetOf(playerId: string): string | null {
    const ref = this.controller.seatOf(playerId);
    if (ref === null) return null;
    return this.vehicles.get(ref.mountId)?.byStationId.get(ref.seatId)?.facet ?? null;
  }

  stationOf(playerId: string): Station | null {
    const ref = this.controller.seatOf(playerId);
    if (ref === null) return null;
    return this.vehicles.get(ref.mountId)?.byStationId.get(ref.seatId) ?? null;
  }

  controllerOf(vehicleId: string, facet: string): string | null {
    const vehicle = this.vehicles.get(vehicleId);
    if (vehicle === undefined) return null;
    for (const occupant of this.controller.occupants(vehicleId)) {
      if (vehicle.byStationId.get(occupant.seatId)?.facet === facet) return occupant.riderId;
    }
    return null;
  }

  crew(vehicleId: string): { playerId: string; stationId: string; facet: string }[] {
    const vehicle = this.vehicles.get(vehicleId);
    if (vehicle === undefined) return [];
    return this.controller.occupants(vehicleId).map((occupant) => ({
      playerId: occupant.riderId,
      stationId: occupant.seatId,
      facet: vehicle.byStationId.get(occupant.seatId)?.facet ?? "",
    }));
  }

  stationsOf(vehicleId: string): readonly Station[] {
    return this.vehicles.get(vehicleId)?.config.stations ?? [];
  }

  openFacets(vehicleId: string): string[] {
    const vehicle = this.vehicles.get(vehicleId);
    if (vehicle === undefined) return [];
    const taken = new Set(this.controller.occupants(vehicleId).map((o) => o.seatId));
    return vehicle.config.stations.filter((s) => !taken.has(s.id)).map((s) => s.facet);
  }

  driver(vehicleId: string): string | null {
    return this.controller.driver(vehicleId);
  }

  cameraTarget(playerId: string): string {
    return this.controller.cameraTarget(playerId);
  }

  driveTarget(playerId: string): string | null {
    return this.controller.driveTarget(playerId);
  }

  get mounts(): MountController {
    return this.controller;
  }
}

export function createStationClaim(controller?: MountController): StationClaim {
  return new StationClaim(controller);
}
