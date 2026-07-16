import { normalizeEditorLayers } from "@jgengine/core/editor/index";
import sceneJson from "./editor.scene.json";
/**
 * The game's authored scene — `editor.scene.json`, placed in the 3D editor: player spawn, the three
 * zone hubs and their graveyards, the Hollow Crypt, the zone bands (box volumes), and every NPC spawn.
 * Zone/NPC gameplay tables read their coordinates from this one document (see `world/zones`,
 * `entities/npcs/catalog`); metadata (names, level ranges, dialogue) stays in code. The procedural
 * terrain, weather, and structures stay generated in `world.ts`. Open F2+E to edit live.
 */
export const editorLayers = normalizeEditorLayers(sceneJson);
function requireMarker(id) {
    const marker = editorLayers.markers.find((m) => m.id === id);
    if (marker === undefined)
        throw new Error(`editor.scene.json: missing marker "${id}"`);
    return marker;
}
/** XZ of an authored marker, the single source for a placed point. */
export function sceneMarkerXZ(id) {
    const { position } = requireMarker(id);
    return [position.x, position.z];
}
/** Authored `meta.radius` of a marker (hub / landmark discs). */
export function sceneMarkerRadius(id) {
    const radius = requireMarker(id).meta?.radius;
    if (typeof radius !== "number")
        throw new Error(`editor.scene.json: marker "${id}" has no numeric meta.radius`);
    return radius;
}
/** Z-band of a zone, read from its authored box volume `zone:<id>`. */
export function sceneZoneBand(id) {
    const volume = editorLayers.volumes.find((v) => v.id === `zone:${id}`);
    if (volume === undefined || volume.halfExtents === undefined) {
        throw new Error(`editor.scene.json: missing box volume "zone:${id}"`);
    }
    return { zMin: volume.center.z - volume.halfExtents.z, zMax: volume.center.z + volume.halfExtents.z };
}
