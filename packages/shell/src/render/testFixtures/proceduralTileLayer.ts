import type { TilemapWorldConfig } from "@jgengine/core/world/features";

type DrawingContext = Pick<CanvasRenderingContext2D, "clearRect" | "fillRect"> & { fillStyle: string | CanvasGradient | CanvasPattern };
type CanvasFixture = { width: number; height: number; getContext(contextId: "2d"): DrawingContext | null; toDataURL(): string };

/** Draw the deterministic tile atlas used by textured tile-layer captures and tests. */
export function drawProceduralTileLayer(canvas: CanvasFixture): TilemapWorldConfig {
  canvas.width = 48;
  canvas.height = 16;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("A 2D canvas context is required.");
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (const [x, color] of [[0, "#355070"], [16, "#6b705c"], [32, "#3a86a8"]] as const) {
    context.fillStyle = color;
    context.fillRect(x, 0, 16, 16);
  }
  return {
    map: "aba\nbcb\naba",
    cellSize: 1,
    tileSet: {
      atlas: {
        image: canvas.toDataURL(),
        size: [48, 16],
        frames: {
          floor: { x: 0, y: 0, w: 16, h: 16 },
          wall: { x: 16, y: 0, w: 16, h: 16 },
          water: { x: 32, y: 0, w: 16, h: 16 },
        },
        animations: {},
      },
      tiles: { a: "floor", b: "wall", c: "water" },
    },
  };
}
