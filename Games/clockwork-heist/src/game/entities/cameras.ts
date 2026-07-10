import type { CameraDef } from "../schedule/cameraSchedule";
import { roomById } from "../mansion/floorPlan";

const galleryCenter = roomById("grand_gallery").center;
const libraryCenter = roomById("library").center;
const vaultCenter = roomById("vault_antechamber").center;

export const CAMERA_DEFS: readonly CameraDef[] = [
  {
    id: "gallery_eye",
    name: "Gallery Sentry-Eye",
    roomName: "Grand Gallery",
    position: [galleryCenter[0], 1.7, galleryCenter[1]],
    baseAngle: 0,
    sweepDeg: 110,
    periodSeconds: 9,
    range: 7,
    angleDeg: 55,
  },
  {
    id: "library_eye",
    name: "Library Sentry-Eye",
    roomName: "Library",
    position: [libraryCenter[0], 1.7, libraryCenter[1]],
    baseAngle: Math.PI / 2,
    sweepDeg: 100,
    periodSeconds: 11,
    range: 6.5,
    angleDeg: 50,
  },
  {
    id: "vault_eye",
    name: "Vault Sentry-Eye",
    roomName: "Vault Antechamber",
    position: [vaultCenter[0], 1.7, vaultCenter[1]],
    baseAngle: Math.PI,
    sweepDeg: 130,
    periodSeconds: 7,
    range: 6,
    angleDeg: 60,
  },
];
