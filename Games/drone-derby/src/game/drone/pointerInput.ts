import type { PointerTilt } from "./input";

const SENSITIVITY = 1 / 130;

let dragging = false;
let originX = 0;
let originY = 0;
let tiltX = 0;
let tiltZ = 0;

function clampUnit(value: number): number {
  return value < -1 ? -1 : value > 1 ? 1 : value;
}

export function beginPointerDrag(clientX: number, clientY: number): void {
  dragging = true;
  originX = clientX;
  originY = clientY;
  tiltX = 0;
  tiltZ = 0;
}

export function updatePointerDrag(clientX: number, clientY: number): void {
  if (!dragging) return;
  tiltX = clampUnit((clientX - originX) * SENSITIVITY);
  tiltZ = clampUnit((originY - clientY) * SENSITIVITY);
}

export function endPointerDrag(): void {
  dragging = false;
  tiltX = 0;
  tiltZ = 0;
}

export function samplePointerTilt(): PointerTilt | null {
  return dragging ? { pitch: tiltZ, strafe: tiltX } : null;
}
