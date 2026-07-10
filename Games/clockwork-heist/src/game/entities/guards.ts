import type { Waypoint } from "@jgengine/core/nav/pathFollow";
import type { GuardDef } from "../schedule/guardSchedule";
import { roomById } from "../mansion/floorPlan";

const Y = 0;

function wp(x: number, z: number): Waypoint {
  return [x, Y, z];
}

function pingPongLoop(points: readonly Waypoint[]): Waypoint[] {
  const back = [...points].reverse().slice(1);
  return [...points, ...back];
}

function loopLength(points: readonly Waypoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const [ax, , az] = points[i - 1]!;
    const [bx, , bz] = points[i]!;
    total += Math.hypot(bx - ax, bz - az);
  }
  return total;
}

function speedForLoop(points: readonly Waypoint[], desiredSeconds: number): { speed: number; loopSeconds: number } {
  const length = loopLength(points);
  return { speed: length / desiredSeconds, loopSeconds: desiredSeconds };
}

const servantEntrance = roomById("servant_entrance").center;
const kitchen = roomById("kitchen").center;
const pantry = roomById("pantry").center;
const grandGallery = roomById("grand_gallery").center;
const musicRoom = roomById("music_room").center;
const conservatory = roomById("conservatory").center;
const library = roomById("library").center;
const study = roomById("study").center;
const smokingRoom = roomById("smoking_room").center;
const ballroom = roomById("ballroom").center;
const vaultAntechamber = roomById("vault_antechamber").center;
const trophyRoom = roomById("trophy_room").center;

const higginsRoute = pingPongLoop([
  wp(servantEntrance[0], servantEntrance[1]),
  wp(0, 5),
  wp(kitchen[0], kitchen[1]),
  wp(0, 15),
  wp(pantry[0], pantry[1]),
]);

const reeveRoute = pingPongLoop([
  wp(grandGallery[0], grandGallery[1]),
  wp(10, 5),
  wp(musicRoom[0], musicRoom[1]),
  wp(10, 15),
  wp(conservatory[0], conservatory[1]),
]);

const vossRoute = pingPongLoop([
  wp(library[0], library[1]),
  wp(20, 5),
  wp(study[0], study[1]),
  wp(20, 15),
  wp(smokingRoom[0], smokingRoom[1]),
]);

const blytheRoute = pingPongLoop([
  wp(ballroom[0], ballroom[1]),
  wp(30, 5),
  wp(vaultAntechamber[0], vaultAntechamber[1]),
  wp(30, 15),
  wp(trophyRoom[0], trophyRoom[1]),
]);

const marchettiRoute = pingPongLoop([
  wp(kitchen[0], kitchen[1]),
  wp(5, 10),
  wp(musicRoom[0], musicRoom[1]),
  wp(15, 10),
  wp(study[0], study[1]),
  wp(25, 10),
  wp(vaultAntechamber[0], vaultAntechamber[1]),
  wp(30, 5),
  wp(ballroom[0], ballroom[1]),
]);

const corwinRoute = pingPongLoop([wp(26, 10), wp(34, 10)]);

const higgins = speedForLoop(higginsRoute, 24);
const reeve = speedForLoop(reeveRoute, 36);
const voss = speedForLoop(vossRoute, 30);
const blythe = speedForLoop(blytheRoute, 45);
const marchetti = speedForLoop(marchettiRoute, 60);
const corwin = speedForLoop(corwinRoute, 20);

export const GUARD_DEFS: readonly GuardDef[] = [
  {
    id: "guard_higgins",
    name: "Butler Higgins",
    wing: "servants",
    waypoints: higginsRoute,
    speed: higgins.speed,
    loopSeconds: higgins.loopSeconds,
    visionRadius: 6,
    visionAngleDeg: 70,
  },
  {
    id: "guard_reeve",
    name: "Constable Reeve",
    wing: "gallery",
    waypoints: reeveRoute,
    speed: reeve.speed,
    loopSeconds: reeve.loopSeconds,
    visionRadius: 6,
    visionAngleDeg: 70,
  },
  {
    id: "guard_voss",
    name: "Footman Voss",
    wing: "scholar",
    waypoints: vossRoute,
    speed: voss.speed,
    loopSeconds: voss.loopSeconds,
    visionRadius: 6,
    visionAngleDeg: 70,
  },
  {
    id: "guard_blythe",
    name: "Sergeant Blythe",
    wing: "state",
    waypoints: blytheRoute,
    speed: blythe.speed,
    loopSeconds: blythe.loopSeconds,
    visionRadius: 6.5,
    visionAngleDeg: 75,
  },
  {
    id: "guard_marchetti",
    name: "Head Steward Marchetti",
    wing: "gallery",
    waypoints: marchettiRoute,
    speed: marchetti.speed,
    loopSeconds: marchetti.loopSeconds,
    visionRadius: 7,
    visionAngleDeg: 60,
  },
  {
    id: "guard_corwin",
    name: "Night Watch Corwin",
    wing: "state",
    waypoints: corwinRoute,
    speed: corwin.speed,
    loopSeconds: corwin.loopSeconds,
    visionRadius: 5,
    visionAngleDeg: 90,
  },
];

export const GUARD_CATALOG_KIND = "clockwork_guard";
