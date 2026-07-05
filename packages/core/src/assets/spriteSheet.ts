export interface SpriteSheetGridConfig {
  columns: number;
  rows: number;
  marginX: number;
  marginY: number;
  gapX: number;
  gapY: number;
  cellWidth?: number;
  cellHeight?: number;
}

export interface SpriteSheetSliceBox {
  id: string;
  name: string;
  row: number;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpriteSheetManifest {
  version: 1;
  source: {
    name: string;
    width: number;
    height: number;
  };
  grid: SpriteSheetGridConfig;
  slices: SpriteSheetSliceBox[];
}

export function sanitizeAssetName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "asset";
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function requireNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

export function normalizeSpriteSheetGridConfig(
  imageWidth: number,
  imageHeight: number,
  config: SpriteSheetGridConfig,
): Required<SpriteSheetGridConfig> {
  requirePositiveInteger(imageWidth, "imageWidth");
  requirePositiveInteger(imageHeight, "imageHeight");
  requirePositiveInteger(config.columns, "columns");
  requirePositiveInteger(config.rows, "rows");
  requireNonNegativeInteger(config.marginX, "marginX");
  requireNonNegativeInteger(config.marginY, "marginY");
  requireNonNegativeInteger(config.gapX, "gapX");
  requireNonNegativeInteger(config.gapY, "gapY");

  const availableWidth = imageWidth - config.marginX * 2 - config.gapX * (config.columns - 1);
  const availableHeight = imageHeight - config.marginY * 2 - config.gapY * (config.rows - 1);
  const cellWidth = config.cellWidth ?? Math.floor(availableWidth / config.columns);
  const cellHeight = config.cellHeight ?? Math.floor(availableHeight / config.rows);

  requirePositiveInteger(cellWidth, "cellWidth");
  requirePositiveInteger(cellHeight, "cellHeight");

  const usedWidth = config.marginX * 2 + cellWidth * config.columns + config.gapX * (config.columns - 1);
  const usedHeight = config.marginY * 2 + cellHeight * config.rows + config.gapY * (config.rows - 1);
  if (usedWidth > imageWidth) {
    throw new Error(`grid width ${usedWidth} exceeds image width ${imageWidth}.`);
  }
  if (usedHeight > imageHeight) {
    throw new Error(`grid height ${usedHeight} exceeds image height ${imageHeight}.`);
  }

  return {
    columns: config.columns,
    rows: config.rows,
    marginX: config.marginX,
    marginY: config.marginY,
    gapX: config.gapX,
    gapY: config.gapY,
    cellWidth,
    cellHeight,
  };
}

export function buildSpriteSheetGridBoxes({
  imageWidth,
  imageHeight,
  config,
  namePrefix,
  names,
}: {
  imageWidth: number;
  imageHeight: number;
  config: SpriteSheetGridConfig;
  namePrefix: string;
  names?: readonly string[];
}): SpriteSheetSliceBox[] {
  const grid = normalizeSpriteSheetGridConfig(imageWidth, imageHeight, config);
  const prefix = sanitizeAssetName(namePrefix);
  const boxes: SpriteSheetSliceBox[] = [];

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const index = row * grid.columns + column;
      const name = sanitizeAssetName(names?.[index] ?? `${prefix}-${String(index + 1).padStart(2, "0")}`);
      boxes.push({
        id: `${row}-${column}`,
        name,
        row,
        column,
        x: grid.marginX + column * (grid.cellWidth + grid.gapX),
        y: grid.marginY + row * (grid.cellHeight + grid.gapY),
        width: grid.cellWidth,
        height: grid.cellHeight,
      });
    }
  }

  return boxes;
}

export function buildSpriteSheetManifest({
  sourceName,
  imageWidth,
  imageHeight,
  config,
  slices,
}: {
  sourceName: string;
  imageWidth: number;
  imageHeight: number;
  config: SpriteSheetGridConfig;
  slices: SpriteSheetSliceBox[];
}): SpriteSheetManifest {
  return {
    version: 1,
    source: {
      name: sourceName,
      width: imageWidth,
      height: imageHeight,
    },
    grid: normalizeSpriteSheetGridConfig(imageWidth, imageHeight, config),
    slices,
  };
}
