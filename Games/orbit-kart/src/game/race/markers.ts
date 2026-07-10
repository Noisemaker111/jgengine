import { createMarkerSet, type MarkerSet } from "@jgengine/core/world/markers";
import { CHECKPOINT_DEFS, PLANETOIDS } from "../cluster/catalog";
import { RIVALS } from "../ai/rivals";
import { PLAYER_ID } from "../constants";
import type { SessionSnapshot } from "./session";

export function createClusterMarkers(): MarkerSet {
  const markers = createMarkerSet(() => 0);
  for (const planetoid of PLANETOIDS) {
    markers.add({ id: `well-${planetoid.id}`, kind: "well", position: [planetoid.position[0], 0, planetoid.position[1]], label: planetoid.name });
  }
  for (const checkpoint of CHECKPOINT_DEFS) {
    markers.add({ id: `checkpoint-${checkpoint.id}`, kind: "checkpoint", position: [checkpoint.position[0], 0, checkpoint.position[1]], label: checkpoint.name });
  }
  return markers;
}

export function updateKartMarkers(markers: MarkerSet, snapshot: SessionSnapshot): void {
  const player = snapshot.karts[PLAYER_ID];
  if (player !== undefined) markers.add({ id: `kart-${PLAYER_ID}`, kind: "kart_player", position: player.position, label: "You" });
  for (const rival of RIVALS) {
    const kart = snapshot.karts[rival.id];
    if (kart === undefined) continue;
    markers.add({ id: `kart-${rival.id}`, kind: `kart_rival_${rival.kind}`, position: kart.position, label: rival.name });
  }
}
