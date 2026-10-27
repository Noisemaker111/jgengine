/**
 * A focusable 2D canvas that fills its container, redraws every frame and cleans up after itself.
 * The car, key-binding and save demos on /why draw through it; three.js demos use `mountLive`.
 */
export interface Canvas2d {
  canvas: HTMLCanvasElement;
  dispose(): void;
}

export interface Canvas2dFrame {
  ctx: CanvasRenderingContext2D;
  /** CSS pixels. */
  width: number;
  height: number;
  /** Seconds since the last frame, capped so a background tab does not jump. */
  dt: number;
}

export function mountCanvas2d(
  container: HTMLElement,
  frame: (f: Canvas2dFrame) => void,
  options: { label: string },
): Canvas2d {
  const canvas = document.createElement("canvas");
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", options.label);
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;outline:none;touch-action:none;";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("2D canvas unavailable");

  let width = 0;
  let height = 0;
  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = container.clientWidth;
    height = container.clientHeight;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  let last = performance.now();
  let raf = requestAnimationFrame(function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frame({ ctx, width, height, dt });
    raf = requestAnimationFrame(tick);
  });

  return {
    canvas,
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.remove();
    },
  };
}

/** Keycaps in a row, lit when held: shows which keys the demo (or the visitor) is pressing. */
export function drawKeycaps(
  ctx: CanvasRenderingContext2D,
  keys: readonly { label: string; on: boolean; wide?: boolean }[],
  x: number,
  y: number,
): void {
  ctx.save();
  ctx.font = "600 11px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let at = x;
  for (const key of keys) {
    const w = key.wide ? 58 : Math.max(24, ctx.measureText(key.label).width + 14);
    ctx.fillStyle = key.on ? "#ff7a1a" : "rgba(255,255,255,0.07)";
    ctx.strokeStyle = key.on ? "#ffb27a" : "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(at, y, w, 24, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = key.on ? "#140a02" : "rgba(255,255,255,0.7)";
    ctx.fillText(key.label, at + w / 2, y + 12.5);
    at += w + 5;
  }
  ctx.restore();
}

/** A small pill label, for "Autopilot" and similar states. */
export function drawPill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tone: "accent" | "live" | "muted" = "muted"): void {
  ctx.save();
  ctx.font = "600 10.5px ui-monospace, monospace";
  const w = ctx.measureText(text).width + 16;
  ctx.fillStyle = tone === "accent" ? "rgba(255,122,26,0.18)" : tone === "live" ? "rgba(74,222,128,0.16)" : "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, 20, 10);
  ctx.fill();
  ctx.fillStyle = tone === "accent" ? "#ffb27a" : tone === "live" ? "#86efac" : "rgba(255,255,255,0.75)";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 8, y + 10.5);
  ctx.restore();
}

/**
 * Who is in control of a self-running demo: the visitor for a few seconds after their last input,
 * the demo's own autopilot otherwise.
 */
export function takeover(idleMs = 5000): { touch(): void; byVisitor(): boolean } {
  let last = -Infinity;
  return {
    touch() {
      last = performance.now();
    },
    byVisitor() {
      return performance.now() - last < idleMs;
    },
  };
}

/** Tracks held key codes while `target` has focus, and stops the page scrolling on game keys. */
export function heldKeys(target: HTMLElement, gameKeys: ReadonlySet<string>): { held: Set<string>; dispose(): void } {
  const held = new Set<string>();
  const down = (e: KeyboardEvent) => {
    if (gameKeys.has(e.code)) e.preventDefault();
    held.add(e.code);
  };
  const up = (e: KeyboardEvent) => held.delete(e.code);
  const blur = () => held.clear();
  target.addEventListener("keydown", down);
  target.addEventListener("keyup", up);
  target.addEventListener("blur", blur);
  return {
    held,
    dispose() {
      target.removeEventListener("keydown", down);
      target.removeEventListener("keyup", up);
      target.removeEventListener("blur", blur);
    },
  };
}
