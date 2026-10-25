/**
 * Pure plain-text scene summary for an LLM tool loop. Regenerated every turn
 * so the agent always sees current ground truth instead of trusting its own
 * memory of prior edits. Token-lean: rounded numbers, one line per entity.
 */
import type { DecorItemSpec, MapData, WallSegmentSpec } from "@llmville/game/world/mapTypes";

import type { BuilderSelectionRef } from "@llmville/game/builder/document";

function r2(value: number): number {
  return Math.round(value * 100) / 100;
}

function fmtNums(values: readonly number[]): string {
  return values.map(r2).join(", ");
}

function decorKindLabel(item: DecorItemSpec): string {
  if (item.type === "model") return `model:${item.modelKey ?? item.modelId ?? "?"}`;
  if (item.type === "group") return `group(${item.children?.length ?? 0} children)`;
  return item.type;
}

function decorPositionLabel(item: DecorItemSpec): string {
  if (item.gridX !== undefined && item.gridZ !== undefined) {
    return `grid=(${item.gridX}, ${item.gridZ})`;
  }
  return item.position ? `pos=(${fmtNums(item.position)})` : "pos=?";
}

function decorLine(item: DecorItemSpec): string {
  const parts = [
    `decor[${item.id ?? "?"}]`,
    decorKindLabel(item),
    decorPositionLabel(item),
  ];
  if (item.footprint) parts.push(`footprint=(${item.footprint.width}x${item.footprint.depth})`);
  else if (item.args?.length) parts.push(`size=(${fmtNums(item.args)})`);
  if (item.color) parts.push(`color=${item.color}`);
  if (item.gridRotation !== undefined) parts.push(`gridRotation=${item.gridRotation}`);
  if (item.facing !== undefined) parts.push(`facing=${item.facing}`);
  return parts.join(" ");
}

function wallLine(wall: WallSegmentSpec, index: number): string {
  return `wall[${index}] pos=(${fmtNums(wall.position)}) size=(${fmtNums(wall.args)})`;
}

function selectionLine(refs: readonly BuilderSelectionRef[]): string {
  if (refs.length === 0) return "none";
  return refs.map((ref) => (ref.kind === "decor" ? `decor:${ref.id}` : `wall:${ref.index}`)).join(", ");
}

export function buildSceneDigest(mapData: MapData, selectedRefs: BuilderSelectionRef[]): string {
  const { environment, grid, walls, decor, landmarks, frontDoorPosition, dropoffPosition } = mapData;

  const gridBits = [
    grid?.tileSize !== undefined ? `tileSize=${r2(grid.tileSize)}m` : null,
    grid?.floorTilesX !== undefined && grid?.floorTilesZ !== undefined
      ? `floorTiles=${grid.floorTilesX}x${grid.floorTilesZ}`
      : null,
  ].filter((part): part is string => part !== null);

  const environmentLine = [
    `ENVIRONMENT: map=${mapData.mapId}`,
    `floor=${r2(environment.floor.width)}x${r2(environment.floor.depth)}m`,
    `wallHeight=${r2(environment.wallHeight)}m`,
    `floorMaterial=${environment.floorMaterial}`,
    `wallMaterial=${environment.wallMaterial} (${environment.wallColor})`,
    ...gridBits,
  ].join(" ");

  const lines: string[] = [environmentLine];

  lines.push(`WALLS (${walls.length}):`);
  walls.forEach((wall, index) => lines.push(wallLine(wall, index)));

  lines.push(`DECOR (${decor.length}):`);
  decor.forEach((item) => lines.push(decorLine(item)));

  lines.push(`SELECTION: ${selectionLine(selectedRefs)}`);

  lines.push(
    `LANDMARKS: ${landmarks.length} — frontDoor=(${fmtNums([frontDoorPosition.x, frontDoorPosition.z])}) `
    + `dropoff=(${fmtNums([dropoffPosition.x, dropoffPosition.z])})`,
  );

  return lines.join("\n");
}
