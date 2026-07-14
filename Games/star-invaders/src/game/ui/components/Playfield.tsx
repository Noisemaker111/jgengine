import { memo, useEffect, useRef } from "react";
import { useGameContext } from "@jgengine/react";

import {
  BUNKER_BLOCK,
  BUNKER_Y,
  CANNON_H,
  CANNON_Y,
  FIELD_H,
  FIELD_W,
  SAUCER_Y,
  SHOT_H,
  SHOT_W,
} from "../../invaders/constants";
import type { StarInvadersSnapshot } from "../../invaders/store";
import { starInvadersHandle } from "../../invaders/store";
import {
  CANNON,
  drawSprite,
  EXPLOSION,
  SAUCER,
  spriteHeight,
  spriteWidth,
  TIER_SPRITES,
} from "../../invaders/sprites";
import { COLORS, ROW_COLOR } from "../palette";

function drawGlyph(
  c: CanvasRenderingContext2D,
  sprite: readonly string[],
  cx: number,
  cy: number,
  color: string,
  glow: number,
): void {
  const w = spriteWidth(sprite);
  const h = spriteHeight(sprite);
  c.save();
  c.shadowColor = color;
  c.shadowBlur = glow;
  drawSprite(c, sprite, cx - w / 2, cy - h / 2, 1, color);
  c.restore();
}

function drawBackground(c: CanvasRenderingContext2D): void {
  c.fillStyle = "#03040a";
  c.fillRect(0, 0, FIELD_W, FIELD_H);
  c.save();
  c.globalAlpha = 0.5;
  c.fillStyle = "#0b1030";
  for (let i = 0; i < STARS.length; i += 1) {
    const s = STARS[i]!;
    c.fillRect(s.x, s.y, 1, 1);
  }
  c.restore();
}

const STARS: readonly { x: number; y: number }[] = Array.from({ length: 40 }, (_, i) => ({
  x: (i * 53) % FIELD_W,
  y: (i * 97) % (FIELD_H - 40),
}));

function render(canvas: HTMLCanvasElement, snapshot: StarInvadersSnapshot): void {
  const c = canvas.getContext("2d");
  if (c === null) return;
  c.setTransform(canvas.width / FIELD_W, 0, 0, canvas.height / FIELD_H, 0, 0);
  c.clearRect(0, 0, FIELD_W, FIELD_H);
  drawBackground(c);

  for (const bunker of snapshot.bunkers) {
    c.save();
    c.shadowColor = COLORS.bunker;
    c.shadowBlur = 4;
    c.fillStyle = COLORS.bunker;
    for (let r = 0; r < bunker.cells.length; r += 1) {
      const row = bunker.cells[r]!;
      for (let col = 0; col < row.length; col += 1) {
        if (row[col]) c.fillRect(bunker.x + col * BUNKER_BLOCK, BUNKER_Y + r * BUNKER_BLOCK, BUNKER_BLOCK, BUNKER_BLOCK);
      }
    }
    c.restore();
  }

  for (const alien of snapshot.aliens) {
    const sprite = TIER_SPRITES[alien.row]![snapshot.frame];
    c.save();
    c.shadowColor = ROW_COLOR[alien.row]!;
    c.shadowBlur = 6;
    drawSprite(c, sprite, alien.x, alien.y, 1, ROW_COLOR[alien.row]!);
    c.restore();
  }

  if (snapshot.saucer !== null) {
    c.save();
    c.shadowColor = COLORS.saucer;
    c.shadowBlur = 10;
    drawSprite(c, SAUCER, snapshot.saucer.x, SAUCER_Y, 1, COLORS.saucer);
    c.restore();
  }

  c.save();
  c.shadowColor = COLORS.baseline;
  c.shadowBlur = 6;
  c.fillStyle = COLORS.baseline;
  c.fillRect(0, CANNON_Y + CANNON_H + 2, FIELD_W, 1);
  c.restore();

  if (snapshot.cannonVisible) {
    c.save();
    c.shadowColor = COLORS.cannon;
    c.shadowBlur = 8;
    drawSprite(c, CANNON, snapshot.cannonX, CANNON_Y, 1, COLORS.cannon);
    c.restore();
  }

  if (snapshot.shot !== null) {
    c.save();
    c.shadowColor = COLORS.shot;
    c.shadowBlur = 8;
    c.fillStyle = COLORS.shot;
    c.fillRect(snapshot.shot.x, snapshot.shot.y, SHOT_W, SHOT_H);
    c.restore();
  }

  c.save();
  c.shadowColor = COLORS.bomb;
  c.shadowBlur = 6;
  c.fillStyle = COLORS.bomb;
  for (const bomb of snapshot.bombs) c.fillRect(bomb.x, bomb.y, 2, 6);
  c.restore();

  for (const explosion of snapshot.explosions) {
    drawGlyph(c, EXPLOSION, explosion.x, explosion.y, COLORS.explosion, 10);
  }
}

function PlayfieldImpl() {
  const ctx = useGameContext();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (canvas === null || wrap === null) return;
    const store = starInvadersHandle.read(ctx);

    const draw = () => render(canvas, store.getState());

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const rect = wrap.getBoundingClientRect();
      const scale = Math.min(rect.width / FIELD_W, rect.height / FIELD_H);
      const cssW = Math.max(1, FIELD_W * scale);
      const cssH = Math.max(1, FIELD_H * scale);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      draw();
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(wrap);
    const unsubscribe = store.subscribe(draw);
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, [ctx]);

  const pointerToField = (clientX: number): number => {
    const canvas = canvasRef.current;
    if (canvas === null) return FIELD_W / 2;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return FIELD_W / 2;
    return ((clientX - rect.left) / rect.width) * FIELD_W;
  };

  return (
    <div ref={wrapRef} className="relative flex h-full w-full items-center justify-center">
      <canvas
        ref={canvasRef}
        className="pointer-events-auto touch-none rounded-md"
        style={{ boxShadow: "0 0 30px rgba(84,255,159,0.18), inset 0 0 40px rgba(0,0,0,0.6)" }}
        onPointerMove={(event) => {
          if (event.pressure > 0 || event.buttons > 0) starInvadersHandle.read(ctx).setPointerX(pointerToField(event.clientX));
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          const store = starInvadersHandle.read(ctx);
          store.setPointerX(pointerToField(event.clientX));
          store.fire();
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.16) 3px), radial-gradient(circle at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)",
          mixBlendMode: "multiply",
        }}
      />
    </div>
  );
}

export const Playfield = memo(PlayfieldImpl);
