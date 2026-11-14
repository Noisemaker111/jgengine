import { CanvasTexture, LinearFilter, Sprite, SpriteMaterial, SRGBColorSpace, Group } from "three";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";

import { BUBBLE_RULE, session, type SpeechBubble } from "../session";

/**
 * Comic speech bubbles over the street, drawn in the world: a worker's voice line in a cream bubble
 * with a tail, a gadget's ping in an electric-blue one. Each text is painted once into a canvas
 * texture and shown on a camera-facing sprite that pops in, holds, and fades out.
 */

/** World height of a bubble's sprite; its width follows the text. */
const BUBBLE_HEIGHT = 1.25;
/** How far above the entity's feet a bubble hangs. */
const LIFT = { voice: 4.1, ping: 2.9 } as const;
const PIXELS = 64;

interface Painted {
  texture: CanvasTexture;
  aspect: number;
}

const STYLE = {
  voice: { fill: "#fff8ea", stroke: "#2a2a34", ink: "#2a2a34" },
  ping: { fill: "#3a8aff", stroke: "#0f2a5a", ink: "#ffffff" },
} as const;

function wrap(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line === "" ? word : `${line} ${word}`;
    if (context.measureText(next).width > maxWidth && line !== "") {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line !== "") lines.push(line);
  return lines.slice(0, 2);
}

function paint(text: string, kind: SpeechBubble["kind"]): Painted | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (context === null) return null;
  const font = `800 ${Math.round(PIXELS * 0.42)}px Nunito, "Trebuchet MS", "Segoe UI", sans-serif`;
  context.font = font;
  const lines = wrap(context, text, PIXELS * 7);
  const textWidth = Math.max(...lines.map((line) => context.measureText(line).width));
  const pad = PIXELS * 0.32;
  const lineHeight = PIXELS * 0.5;
  const tail = PIXELS * 0.36;
  const width = Math.ceil(textWidth + pad * 2);
  const bodyHeight = Math.ceil(lines.length * lineHeight + pad * 1.4);
  canvas.width = width + 8;
  canvas.height = bodyHeight + tail + 8;
  const style = STYLE[kind];
  const x = 4, y = 4, radius = Math.min(PIXELS * 0.35, bodyHeight / 2);
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + bodyHeight, radius);
  context.arcTo(x + width, y + bodyHeight, x, y + bodyHeight, radius);
  context.lineTo(x + width * 0.42, y + bodyHeight);
  context.lineTo(x + width * 0.3, y + bodyHeight + tail);
  context.lineTo(x + width * 0.3, y + bodyHeight);
  context.arcTo(x, y + bodyHeight, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
  context.fillStyle = style.fill;
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = style.stroke;
  context.stroke();
  context.font = font;
  context.fillStyle = style.ink;
  context.textAlign = "center";
  context.textBaseline = "middle";
  lines.forEach((line, index) => context.fillText(line, x + width / 2, y + pad * 0.7 + lineHeight * (index + 0.5)));
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  return { texture, aspect: canvas.width / canvas.height };
}

export function speechBubblesDraw(ctx: GameContext): EngineDraw {
  const group = new Group();
  const painted = new Map<string, Painted | null>();
  const sprites = new Map<number, Sprite>();
  const paintedFor = (bubble: SpeechBubble) => {
    const key = `${bubble.kind}:${bubble.text}`;
    if (!painted.has(key)) painted.set(key, paint(bubble.text, bubble.kind));
    return painted.get(key) ?? null;
  };
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    frame() {
      const now = ctx.time.now();
      const live = new Set<number>();
      for (const bubble of session.bubbles) {
        const age = now - bubble.born;
        const at = ctx.scene.entity.get(bubble.at)?.position;
        if (age < 0 || age > BUBBLE_RULE.seconds || at === undefined) continue;
        const art = paintedFor(bubble);
        if (art === null) continue;
        live.add(bubble.id);
        let sprite = sprites.get(bubble.id);
        if (sprite === undefined) {
          sprite = new Sprite(new SpriteMaterial({ map: art.texture, transparent: true, depthTest: false, depthWrite: false }));
          sprite.renderOrder = 20;
          sprite.center.set(0.3, 0);
          sprites.set(bubble.id, sprite);
          group.add(sprite);
        }
        const pop = Math.min(1, age / 0.15);
        const fade = Math.min(1, (BUBBLE_RULE.seconds - age) / 0.4);
        const scale = BUBBLE_HEIGHT * (0.6 + 0.4 * pop);
        sprite.scale.set(scale * art.aspect, scale, 1);
        sprite.position.set(at[0], at[1] + LIFT[bubble.kind] + age * 0.12, at[2]);
        (sprite.material as SpriteMaterial).opacity = fade;
      }
      for (const [id, sprite] of sprites) {
        if (live.has(id)) continue;
        group.remove(sprite);
        (sprite.material as SpriteMaterial).dispose();
        sprites.delete(id);
      }
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      for (const sprite of sprites.values()) (sprite.material as SpriteMaterial).dispose();
      sprites.clear();
      for (const art of painted.values()) art?.texture.dispose();
      painted.clear();
      group.clear();
    },
  };
}
