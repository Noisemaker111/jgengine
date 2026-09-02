import type { SpriteAtlas } from "@jgengine/core/assets/spriteAtlas";

type DrawingContext = Pick<CanvasRenderingContext2D, "clearRect" | "fillRect" | "beginPath" | "arc" | "fill"> & {
  fillStyle: string | CanvasGradient | CanvasPattern;
};

type CanvasFixture = {
  width: number;
  height: number;
  getContext(contextId: "2d"): DrawingContext | null;
  toDataURL(): string;
};

/** Draw the deterministic two-frame atlas used by shell sprite-clip captures and tests. */
export function drawProceduralSpriteAtlas(canvas: CanvasFixture): SpriteAtlas {
  canvas.width = 64;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("A 2D canvas context is required.");
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (const x of [0, 32]) {
    context.fillStyle = "#172033";
    context.fillRect(x, 0, 32, 32);
    context.fillStyle = "#f4c95d";
    context.beginPath();
    context.arc(x + 16, 14, 9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#e76f51";
    context.fillRect(x + 8, x === 0 ? 22 : 20, 16, 5);
  }
  return {
    image: canvas.toDataURL(),
    size: [64, 32],
    frames: {
      idle0: { x: 0, y: 0, w: 32, h: 32 },
      idle1: { x: 32, y: 0, w: 32, h: 32 },
    },
    animations: { idle: { frames: ["idle0", "idle1"], fps: 2 } },
  };
}
