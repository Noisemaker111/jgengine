import type {
  BiomesWorldConfig,
  PlotsWorldConfig,
  TilemapWorldConfig,
  VoxelWorldConfig,
  WorldFeature,
  WorldGridCell,
  WorldGridConfig,
} from "./features";
import { seedFrom, valueNoise } from "./terrain";

export interface GridInstanceTransform {
  position: readonly [number, number, number];
  scale: readonly [number, number, number];
  color: string;
}

const DEFAULT_CELL_SIZE = 1;
const DEFAULT_BASE_HEIGHT = 1;
const DEFAULT_GRID_COLOR = "#8a8f98";
const DEFAULT_VOXEL_RADIUS = 4;

type GridWorldFeature = Extract<WorldFeature, { kind: "biomes" | "voxel" | "plots" | "tilemap" }>;

function looksLikeAssetPath(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (/^(?:\.\/|\.\.\/|\/|[A-Za-z]:[\\/])/.test(trimmed)) return true;
  if (/\.(?:ts|tsx|js|jsx|json|png|jpe?g|webp|gif|bmp)$/i.test(trimmed)) return true;
  return false;
}

function parseZoneTable(zones: string): Record<string, { height?: number; color?: string }> {
  const trimmed = zones.trim();
  if (trimmed.startsWith("{")) {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("biomes zones JSON must be an object keyed by map characters");
    }
    const table: Record<string, { height?: number; color?: string }> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") {
        table[key] = { color: value };
        continue;
      }
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        const entry = value as { height?: unknown; color?: unknown };
        table[key] = {
          ...(typeof entry.height === "number" ? { height: entry.height } : {}),
          ...(typeof entry.color === "string" ? { color: entry.color } : {}),
        };
        continue;
      }
      throw new Error(`biomes zones entry "${key}" must be a color string or { height?, color? }`);
    }
    return table;
  }
  throw new Error(
    `biomes zones must be inline JSON (e.g. {"#":{"height":2,"color":"#4a7"}}); asset path "${zones}" is not auto-loaded`,
  );
}

function parseAsciiGrid(
  map: string,
  resolveCell: (glyph: string, x: number, z: number) => WorldGridCell | null,
): readonly WorldGridCell[] {
  if (looksLikeAssetPath(map)) {
    throw new Error(
      `grid-world map "${map}" looks like an asset path and is not auto-loaded — provide inline ASCII or explicit cells`,
    );
  }
  const rows = map
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((row) => row.trimEnd())
    .filter((row, index, all) => row.length > 0 || (index > 0 && index < all.length - 1));
  const solidRows = rows.filter((row) => row.trim().length > 0);
  if (solidRows.length === 0) {
    throw new Error("grid-world map is empty — provide ASCII rows or explicit cells");
  }
  const width = Math.max(...solidRows.map((row) => row.length));
  const cells: WorldGridCell[] = [];
  for (let rowIndex = 0; rowIndex < solidRows.length; rowIndex += 1) {
    const row = solidRows[rowIndex]!.padEnd(width, " ");
    const z = rowIndex - Math.floor((solidRows.length - 1) / 2);
    for (let colIndex = 0; colIndex < width; colIndex += 1) {
      const glyph = row[colIndex] ?? " ";
      if (glyph === " " || glyph === ".") continue;
      const x = colIndex - Math.floor((width - 1) / 2);
      const cell = resolveCell(glyph, x, z);
      if (cell !== null) cells.push(cell);
    }
  }
  if (cells.length === 0) {
    throw new Error("grid-world map produced no solid cells — use non-space/non-dot glyphs or explicit cells");
  }
  return cells;
}

function parseTilemapCells(config: TilemapWorldConfig): readonly WorldGridCell[] {
  return parseAsciiGrid(config.map, (glyph, x, z) => {
    if (glyph >= "1" && glyph <= "9") return { x, z, height: Number(glyph) };
    return { x, z };
  });
}

function parseBiomeCells(config: BiomesWorldConfig): readonly WorldGridCell[] {
  if (looksLikeAssetPath(config.zones)) {
    throw new Error(
      `biomes zones "${config.zones}" looks like an asset path and is not auto-loaded — provide inline JSON zones or explicit cells`,
    );
  }
  const zones = parseZoneTable(config.zones);
  return parseAsciiGrid(config.map, (glyph, x, z) => {
    const zone = zones[glyph];
    if (zone === undefined) {
      throw new Error(`biomes map glyph "${glyph}" is missing from zones`);
    }
    return {
      x,
      z,
      ...(zone.height === undefined ? {} : { height: zone.height }),
      ...(zone.color === undefined ? {} : { color: zone.color }),
    };
  });
}

function generateVoxelCells(config: VoxelWorldConfig): readonly WorldGridCell[] {
  const radius = config.streaming?.radius ?? DEFAULT_VOXEL_RADIUS;
  const seed = seedFrom(config.seed, 1337);
  const cells: WorldGridCell[] = [];
  for (let z = -radius; z <= radius; z += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      const n = valueNoise(x * 0.37, z * 0.37, seed);
      if (n < -0.15) continue;
      const height = Math.max(1, Math.round(1 + (n + 1) * 1.5));
      const tone = Math.round(120 + n * 40);
      cells.push({
        x,
        z,
        height,
        color: `#${tone.toString(16).padStart(2, "0")}${tone.toString(16).padStart(2, "0")}${tone.toString(16).padStart(2, "0")}`,
      });
    }
  }
  if (cells.length === 0) {
    cells.push({ x: 0, z: 0, height: 1 });
  }
  return cells;
}

function resolvePlotsCells(config: PlotsWorldConfig): readonly WorldGridCell[] {
  if (config.city !== undefined || config.interiors !== undefined) {
    throw new Error(
      `plots source fields require explicit cells until asset loading is supported (city=${config.city ?? "—"}, interiors=${config.interiors ?? "—"})`,
    );
  }
  return config.cells ?? [];
}

export function resolveGridCells(config: WorldGridConfig | GridWorldFeature): readonly WorldGridCell[] {
  if (config.cells !== undefined && config.cells.length > 0) return config.cells;

  if ("kind" in config) {
    switch (config.kind) {
      case "tilemap":
        return parseTilemapCells(config);
      case "biomes":
        return parseBiomeCells(config);
      case "voxel":
        return generateVoxelCells(config);
      case "plots":
        return resolvePlotsCells(config);
    }
  }

  return config.cells ?? [];
}

export function resolveGridInstances(config: WorldGridConfig | GridWorldFeature): readonly GridInstanceTransform[] {
  const cells = resolveGridCells(config);
  const cellSize = config.cellSize ?? DEFAULT_CELL_SIZE;
  const defaultColor = config.defaultColor ?? DEFAULT_GRID_COLOR;
  return cells.map((cell) => {
    const height = cell.height ?? config.baseHeight ?? DEFAULT_BASE_HEIGHT;
    return {
      position: [cell.x * cellSize, height / 2, cell.z * cellSize],
      scale: [cellSize, height, cellSize],
      color: cell.color ?? defaultColor,
    };
  });
}
