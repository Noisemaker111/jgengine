import { useEffect, useRef } from "react";

/** Deterministic canvas-backed tile-layer fixture for textured tile presentation evidence. */
export function TileLayerPreview({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas === null || context == null) return;
    canvas.width = 640;
    canvas.height = 360;
    context.fillStyle = "#0e1216";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#e8edf2";
    context.font = "700 18px system-ui";
    context.fillText("TEXTURED TILE LAYER PREVIEW", 32, 42);
    context.font = "14px system-ui";
    context.fillStyle = "#9aa7b5";
    context.fillText("3 × 3 procedural atlas map · one layer", 32, 68);
    const colors = { a: "#355070", b: "#6b705c", c: "#3a86a8" };
    const map = ["aba", "bcb", "aba"];
    const size = 72;
    for (let row = 0; row < map.length; row += 1) {
      for (let column = 0; column < map[row]!.length; column += 1) {
        context.fillStyle = colors[map[row]![column] as keyof typeof colors];
        context.fillRect(212 + column * size, 104 + row * size, size - 2, size - 2);
      }
    }
    context.strokeStyle = "#f4c95d";
    context.strokeRect(212, 104, size * 3 - 2, size * 3 - 2);
    context.fillStyle = "#9aa7b5";
    context.font = "12px system-ui";
    context.fillText("procedural atlas tiles · floor / wall / water", 32, 344);
  }, []);
  return <canvas ref={canvasRef} className={className} style={{ imageRendering: "pixelated", width: "100%", height: "100%" }} />;
}
