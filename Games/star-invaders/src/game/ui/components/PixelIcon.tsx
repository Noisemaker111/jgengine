import type { Sprite } from "../../invaders/sprites";
import { spriteHeight, spriteWidth } from "../../invaders/sprites";

export function PixelIcon({ sprite, color, px = 2 }: { sprite: Sprite; color: string; px?: number }) {
  const w = spriteWidth(sprite);
  const h = spriteHeight(sprite);
  const rects: { x: number; y: number }[] = [];
  for (let r = 0; r < sprite.length; r += 1) {
    const row = sprite[r]!;
    for (let col = 0; col < row.length; col += 1) {
      if (row[col] === "1") rects.push({ x: col, y: r });
    }
  }
  return (
    <svg
      width={w * px}
      height={h * px}
      viewBox={`0 0 ${w} ${h}`}
      style={{ filter: `drop-shadow(0 0 2px ${color})`, display: "block" }}
      aria-hidden="true"
    >
      {rects.map((rect, i) => (
        <rect key={i} x={rect.x} y={rect.y} width={1.02} height={1.02} fill={color} />
      ))}
    </svg>
  );
}
