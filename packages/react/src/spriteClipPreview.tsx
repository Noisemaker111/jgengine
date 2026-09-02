import { useEffect, useRef } from "react";

import { createSpriteClipPlayer } from "@jgengine/core/render/sprite2d";

/** Deterministic canvas-backed sprite clip fixture for renderer evidence.
 * @internal
 */
export function SpriteClipPreview({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext("2d");
    if (context === null) return;
    const atlasCanvas = document.createElement("canvas");
    atlasCanvas.width = 64;
    atlasCanvas.height = 32;
    const atlasContext = atlasCanvas.getContext("2d");
    if (atlasContext === null) return;
    for (const x of [0, 32]) {
      atlasContext.fillStyle = "#172033";
      atlasContext.fillRect(x, 0, 32, 32);
      atlasContext.fillStyle = "#f4c95d";
      atlasContext.beginPath();
      atlasContext.arc(x + 16, 14, 9, 0, Math.PI * 2);
      atlasContext.fill();
      atlasContext.fillStyle = "#e76f51";
      atlasContext.fillRect(x + 8, x === 0 ? 22 : 20, 16, 5);
    }
    const atlas = {
      image: "fixture",
      size: [64, 32] as [number, number],
      frames: { idle0: { x: 0, y: 0, w: 32, h: 32 }, idle1: { x: 32, y: 0, w: 32, h: 32 } },
      animations: { idle: { frames: ["idle0", "idle1"], fps: 2 } },
    };
    const player = createSpriteClipPlayer(atlas);
    let previous = performance.now();
    let animationFrame = 0;
    const draw = (now: number) => {
      player.advance(Math.min((now - previous) / 1000, 0.1));
      previous = now;
      const current = player.frame() ?? atlas.frames.idle0;
      context.fillStyle = "#0e1216";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#e8edf2";
      context.font = "700 18px system-ui";
      context.fillText("SPRITE CLIP PREVIEW", 32, 42);
      context.font = "14px system-ui";
      context.fillStyle = "#9aa7b5";
      context.fillText(`atlas frame ${player.snapshot().frameIndex + 1} / 2 · 2 fps`, 32, 68);
      context.imageSmoothingEnabled = false;
      context.drawImage(atlasCanvas, current.x, current.y, current.w, current.h, 256, 112, 128, 128);
      context.strokeStyle = "#f4c95d";
      context.strokeRect(256, 112, 128, 128);
      context.fillStyle = "#9aa7b5";
      context.font = "12px system-ui";
      context.fillText("procedural atlas frames", 32, 300);
      context.drawImage(atlasCanvas, 0, 0, 32, 32, 32, 312, 64, 64);
      context.drawImage(atlasCanvas, 32, 0, 32, 32, 112, 312, 64, 64);
      context.strokeStyle = "#f4c95d";
      context.strokeRect(32 + player.snapshot().frameIndex * 80, 312, 64, 64);
      animationFrame = requestAnimationFrame(draw);
    };
    animationFrame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationFrame);
  }, []);
  return <canvas ref={canvasRef} className={className} style={{ imageRendering: "pixelated", width: "100%", height: "100%" }} />;
}
