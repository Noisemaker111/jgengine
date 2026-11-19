import type { ChaseCameraConfig, TopDownCameraConfig } from "../camera/cameraConfig";

/** A screen region as fractions of the canvas, `[x, y, width, height]` in `0..1` with the origin at the top left. */
export type ViewportRect = readonly [number, number, number, number];

export interface ViewportCameraConfig {
  /** Default: `"topDown"` when the game's main rig is top-down, otherwise `"chase"`. */
  rig?: "chase" | "topDown";
  chase?: ChaseCameraConfig;
  topDown?: TopDownCameraConfig;
}

export interface ViewportDef {
  slot: string;
  rect: ViewportRect;
  camera?: ViewportCameraConfig;
}

export interface ViewportsConfig {
  layout?: "auto" | readonly ViewportDef[];
  split?: "vertical" | "horizontal";
  camera?: ViewportCameraConfig;
}

/** A viewport in canvas pixels with a bottom-left origin, ready for `gl.setViewport`/`setScissor`. */
export interface ViewportPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

function gridRects(count: number): ViewportRect[] {
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const rects: ViewportRect[] = [];
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const inRow = row === rows - 1 ? count - row * columns : columns;
    const column = index - row * columns;
    rects.push([column / inRow, row / rows, 1 / inRow, 1 / rows]);
  }
  return rects;
}

/** @capability split-screen Split the screen into one viewport per local seat, each with its own follow camera. */
export function splitViewports(slots: readonly string[], split: "vertical" | "horizontal" = "vertical"): ViewportDef[] {
  const count = slots.length;
  let rects: ViewportRect[];
  if (count <= 1) rects = [[0, 0, 1, 1]];
  else if (count === 2) {
    rects = split === "vertical" ? [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] : [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]];
  } else if (count === 3) rects = [[0, 0, 1, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]];
  else rects = gridRects(count);
  return slots.map((slot, index) => ({ slot, rect: rects[index]! }));
}

export function resolveViewports(config: ViewportsConfig | undefined, slots: readonly string[]): ViewportDef[] {
  const layout = config?.layout ?? "auto";
  if (layout === "auto") return splitViewports(slots, config?.split);
  return layout.filter((def) => slots.includes(def.slot));
}

/** Convert a top-left fractional rect into whole canvas pixels with a bottom-left origin; neighbours share edges exactly. */
export function viewportPixels(rect: ViewportRect, width: number, height: number): ViewportPixels {
  const left = Math.round(rect[0] * width);
  const right = Math.round((rect[0] + rect[2]) * width);
  const top = Math.round(rect[1] * height);
  const bottom = Math.round((rect[1] + rect[3]) * height);
  return { x: left, y: height - bottom, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}
