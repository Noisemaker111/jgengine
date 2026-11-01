// @skill jgengine-world
import type { AircraftVector } from "./aircraftDynamics";

/**
 * The rotating Earth effect: the world is a patch of a spinning sphere, origin on its surface. Gravity points at the
 * centre and falls with the inverse square of distance, so a fast flight downrange curves over the horizon and feels
 * lighter, and the frame's spin adds Coriolis and centrifugal accelerations. Velocities stay Earth-relative; the
 * space-fixed velocity (what an orbit needs) comes from {@link rotatingEarthFrame}.
 */
export interface AircraftRotatingEarth {
  /**
   * Multiplier on the effect: `0` off (the tuning's flat gravity field, the simple model), `1` as measured (default),
   * past `1` the planet spins faster (the rotation rate scales with the strength; gravity stays as measured); sane over `0..4`.
   */
  strength?: number;
  /** Latitude of the world origin, rad (default `0`). */
  latitude?: number;
  /** Compass bearing of world `+z`, rad from north, east positive (default `0`: `+z` north, `+x` west). */
  bearing?: number;
  /** Planet radius, m (default `6 378 137`, WGS 84 equatorial). */
  radius?: number;
  /** Gravitational parameter, m³/s² (default `3.986004418e14`, WGS 84). */
  mu?: number;
  /** Sidereal rotation rate, rad/s (default `7.292115e-5`, WGS 84). */
  rotationRate?: number;
}

/** Where a world point sits on the rotating planet. */
export interface RotatingEarthFrame {
  /** Height above the sphere, m. */
  altitude: number;
  /** Local vertical, world axes. */
  up: [number, number, number];
  /** Space-fixed velocity, world axes, m/s: the Earth-relative velocity plus the frame's spin at that point. */
  inertialVelocity: [number, number, number];
  /** Great-circle distance from the world origin over the surface, m. */
  surfaceRange: number;
}

function spin(effect: AircraftRotatingEarth, strength: number): [number, number, number] {
  const omega = (effect.rotationRate ?? 7.292115e-5) * Math.max(0, strength);
  const latitude = effect.latitude ?? 0;
  const bearing = effect.bearing ?? 0;
  const c = Math.cos(latitude);
  // North in world axes is (sin B, 0, cos B) for a bearing B of +z; the spin axis tilts up from it by the latitude.
  return [omega * c * Math.sin(bearing), omega * Math.sin(latitude), omega * c * Math.cos(bearing)];
}

/**
 * Acceleration, m/s² world axes, at a position and Earth-relative velocity: gravity toward the centre blended from the
 * flat field (`simple`) up to strength 1, plus Coriolis and centrifugal terms for the frame's spin.
 * @capability aircraft-rotating-earth spherical inverse-square gravity, Coriolis and centrifugal acceleration
 */
export function rotatingEarthAcceleration(effect: AircraftRotatingEarth, strength: number, position: AircraftVector, velocity: AircraftVector, simple: AircraftVector, out: [number, number, number]): [number, number, number] {
  const radius = effect.radius ?? 6378137;
  const mu = effect.mu ?? 3.986004418e14;
  const rx = position[0];
  const ry = position[1] + radius;
  const rz = position[2];
  const r = Math.max(1, Math.hypot(rx, ry, rz));
  const k = -mu / (r * r * r);
  const g = Math.min(1, Math.max(0, strength));
  const [ox, oy, oz] = spin(effect, strength);
  const [vx, vy, vz] = velocity;
  // −2Ω×v − Ω×(Ω×r)
  const cx = oy * vz - oz * vy;
  const cy = oz * vx - ox * vz;
  const cz = ox * vy - oy * vx;
  const sx = oy * rz - oz * ry;
  const sy = oz * rx - ox * rz;
  const sz = ox * ry - oy * rx;
  out[0] = simple[0] + (k * rx - simple[0]) * g - 2 * cx - (oy * sz - oz * sy);
  out[1] = simple[1] + (k * ry - simple[1]) * g - 2 * cy - (oz * sx - ox * sz);
  out[2] = simple[2] + (k * rz - simple[2]) * g - 2 * cz - (ox * sy - oy * sx);
  return out;
}

/**
 * Altitude, local vertical, space-fixed velocity and surface range of a world point and Earth-relative velocity.
 * @capability aircraft-rotating-earth altitude, local vertical and space-fixed velocity on a rotating planet
 */
export function rotatingEarthFrame(effect: AircraftRotatingEarth, strength: number, position: AircraftVector, velocity: AircraftVector): RotatingEarthFrame {
  const radius = effect.radius ?? 6378137;
  const rx = position[0];
  const ry = position[1] + radius;
  const rz = position[2];
  const r = Math.max(1, Math.hypot(rx, ry, rz));
  const [ox, oy, oz] = spin(effect, strength);
  return {
    altitude: r - radius,
    up: [rx / r, ry / r, rz / r],
    inertialVelocity: [velocity[0] + oy * rz - oz * ry, velocity[1] + oz * rx - ox * rz, velocity[2] + ox * ry - oy * rx],
    surfaceRange: radius * Math.atan2(Math.hypot(rx, rz), ry),
  };
}
