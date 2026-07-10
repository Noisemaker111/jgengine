import { ROUTE, type Route } from "./legs";

export function legProgressFraction(legIndex: number, z: number, route: Route = ROUTE): number {
  const leg = route.legs[legIndex];
  if (leg === undefined) return 1;
  const startZ = leg.startCheckpoint.position[2];
  const endZ = leg.handoffCheckpoint.position[2];
  if (endZ === startZ) return 1;
  return Math.max(0, Math.min(1, (z - startZ) / (endZ - startZ)));
}

export function overallProgressFraction(legIndex: number, z: number, route: Route = ROUTE): number {
  const within = legProgressFraction(legIndex, z, route);
  return Math.max(0, Math.min(1, (legIndex + within) / route.legs.length));
}
