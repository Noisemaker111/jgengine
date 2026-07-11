export interface MouseLookOptions {
  /** Radians of look per pixel of mouse movement; default `0.0024`. */
  sensitivity?: number;
  /** Pitch clamp in radians; default `1.15`. */
  maxPitch?: number;
  /** Request pointer lock on click (skipped on coarse-pointer/touch devices); default `true`. */
  pointerLock?: boolean;
  initialYaw?: number;
  initialPitch?: number;
}

export interface MouseLookAim {
  yaw: number;
  pitch: number;
}

/**
 * The analog mouse-look service chase/orbit-cam games hand-rolled (#282.8) — pointer-lock
 * lifecycle plus delta accumulation into a yaw/pitch aim, decoupled from the first-person rig.
 * Attach it to the canvas, read `aim()` from `onTick`/`useFrame`, dispose on unmount.
 */
export interface MouseLookTracker {
  aim(): MouseLookAim;
  setAim(yaw: number, pitch: number): void;
  /** True while pointer lock is held on the tracked element. */
  locked(): boolean;
  dispose(): void;
}

export function createMouseLookTracker(element: HTMLElement, options: MouseLookOptions = {}): MouseLookTracker {
  const sensitivity = options.sensitivity ?? 0.0024;
  const maxPitch = options.maxPitch ?? 1.15;
  const pointerLock = options.pointerLock ?? true;
  let yaw = options.initialYaw ?? 0;
  let pitch = options.initialPitch ?? 0;

  const requestLock = () => {
    if (!pointerLock) return;
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    if (document.pointerLockElement !== element) void element.requestPointerLock?.();
  };
  const onMove = (event: MouseEvent) => {
    if (pointerLock && document.pointerLockElement !== element) return;
    yaw -= event.movementX * sensitivity;
    pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch - event.movementY * sensitivity));
  };
  element.addEventListener("click", requestLock);
  window.addEventListener("mousemove", onMove);

  return {
    aim: () => ({ yaw, pitch }),
    setAim(nextYaw, nextPitch) {
      yaw = nextYaw;
      pitch = Math.max(-maxPitch, Math.min(maxPitch, nextPitch));
    },
    locked: () => document.pointerLockElement === element,
    dispose() {
      element.removeEventListener("click", requestLock);
      window.removeEventListener("mousemove", onMove);
    },
  };
}
