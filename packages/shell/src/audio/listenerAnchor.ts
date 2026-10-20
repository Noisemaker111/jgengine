/** Where the spatial-audio listener sits: at the camera, or where an overhead camera looks at the ground. @internal */
export type ListenerAnchor = "camera" | "ground";

/** Furthest the listener moves from an overhead camera along its view ray. */
const MAX_FOCUS_DISTANCE = 400;
/** Listener height above the ground focus, so ground emitters are not exactly coincident with it. */
const FOCUS_LIFT = 2;

type Point = { x: number; y: number; z: number };

/**
 * The point an overhead camera looks at on the ground, lifted slightly, or the camera position when
 * the view does not reach the ground. Overhead rigs sit tens of metres up, so a camera-anchored
 * listener hears every ground event at the edge of (or past) its falloff even when it is centre-screen.
 * @internal
 */
export function groundFocusListener(camera: Point, forward: Point, groundY: number): Point {
  const height = camera.y - groundY;
  if (forward.y >= -0.05 || height <= 0) return { ...camera };
  const t = Math.min(MAX_FOCUS_DISTANCE, height / -forward.y);
  return { x: camera.x + forward.x * t, y: groundY + FOCUS_LIFT, z: camera.z + forward.z * t };
}
