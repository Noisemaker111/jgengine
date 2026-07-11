import type { FogCells } from "@jgengine/core/world/fog";

export interface FogCellRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FogPaintSurface {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, width: number, height: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
}

export function forEachUnrevealedFogCell(
  fog: FogCells,
  visit: (col: number, row: number) => void,
): number {
  let count = 0;
  for (let row = 0; row < fog.rows; row += 1) {
    for (let col = 0; col < fog.cols; col += 1) {
      if (fog.revealed[row * fog.cols + col]) continue;
      visit(col, row);
      count += 1;
    }
  }
  return count;
}

export function paintFogOverlay(
  surface: FogPaintSurface,
  canvasSize: { width: number; height: number },
  fog: FogCells,
  cellRect: (col: number, row: number) => FogCellRect | null,
  fill = "rgba(11, 15, 20, 0.82)",
): number {
  surface.clearRect(0, 0, canvasSize.width, canvasSize.height);
  surface.fillStyle = fill;
  return forEachUnrevealedFogCell(fog, (col, row) => {
    const rect = cellRect(col, row);
    if (rect === null) return;
    surface.fillRect(rect.x, rect.y, rect.width, rect.height);
  });
}

export function createFogDataUrl(
  fog: FogCells,
  canvasSize: { width: number; height: number },
  cellRect: (col: number, row: number) => FogCellRect | null,
  fill = "rgba(11, 15, 20, 0.82)",
): string | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(canvasSize.width));
  canvas.height = Math.max(1, Math.floor(canvasSize.height));
  const context = canvas.getContext("2d");
  if (context === null) return null;
  paintFogOverlay(context, { width: canvas.width, height: canvas.height }, fog, cellRect, fill);
  return canvas.toDataURL();
}
