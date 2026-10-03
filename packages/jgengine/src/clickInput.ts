export interface ClickPoint { x: number; y: number }

/** Parse an explicit click in CSS viewport pixels; right and bottom edges are outside. */
export function parseClickAt(spec: string, width: number, height: number): ClickPoint {
  const parts = spec.split(",").map(value => value.trim());
  const decimal = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
  if (parts.length !== 2 || parts.some(value => !decimal.test(value))) {
    throw new Error("--click-at requires x,y in nonnegative CSS viewport pixels");
  }
  const [x, y] = parts.map(Number);
  if (![x, y].every(Number.isFinite) || !Number.isFinite(width) || !Number.isFinite(height)
    || width <= 0 || height <= 0 || x >= width || y >= height) {
    throw new Error("--click-at must be inside the CSS viewport (" + width + "x" + height + ")");
  }
  return { x, y };
}

/** Dispatch a native left click, including pointer movement for canvas hover targets. */
export async function dispatchClickAt(
  session: { send(method: string, params: Record<string, unknown>): Promise<unknown> },
  point: ClickPoint,
): Promise<void> {
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    await session.send("Input.dispatchMouseEvent", {
      type, x: point.x, y: point.y,
      button: type === "mouseMoved" ? "none" : "left",
      buttons: type === "mousePressed" ? 1 : 0,
      clickCount: type === "mouseMoved" ? 0 : 1,
    });
  }
}
