import { rgbToHex, hexToRgb } from "./color";

/**
 * Analytic atmosphere for the day/night sky: Rayleigh air mass, sunlight reddening, moonlight and
 * star visibility. The engine keeps a game's authored sky colors as its noon keyframe; these
 * functions supply the parts a color table cannot — the sun's own tint as it drops toward the
 * horizon, the moon that replaces it after sunset, and how much starlight shows.
 *
 * Pure and deterministic so the whole cycle is testable without a renderer.
 */

/**
 * Rayleigh scattering coefficient per RGB channel in m^-1 (680, 550, 440 nm, the standard
 * β_R ∝ 1/λ⁴ curve) times an 8000 m scale height — the zenith optical depth `τ` of each channel.
 */
const RAYLEIGH_DEPTH = [0.0464, 0.108, 0.2648] as const;

/** Peak moonlight as a fraction of the authored sunlight, at the moon's highest point.
 * Real moonlight is ~2.5e-6 of daylight; every game exaggerates it to stay readable, and this is
 * the exaggeration, not a measurement. Games override it through `SkyEnvironmentConfig.moon`. */
export const MOONLIGHT_PEAK = 0.12;

/** Moonlight's colour: scattered sunlight, blue-shifted because the eye's scotopic response peaks there. */
export const MOONLIGHT_COLOR = "#a9c3e8";

/** Fog color once the sun is gone: the night sky's own haze, lifted enough to keep silhouettes readable. */
export const NIGHT_FOG_COLOR = "#0a0e16";

const DEG = Math.PI / 180;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Elevation of a world-space direction in degrees; a zero vector reads as overhead. */
export function elevationOf(direction: readonly [number, number, number]): number {
  const length = Math.hypot(direction[0], direction[1], direction[2]);
  if (length === 0) return 90;
  return Math.asin(Math.max(-1, Math.min(1, direction[1] / length))) / DEG;
}

/**
 * Relative air mass along a line of sight at `elevationDeg` - Kasten & Young (1989). 1 at the
 * zenith, ~38 at the horizon, and clamped below the horizon so a set sun does not run away.
 * @internal
 */
export function airMass(elevationDeg: number): number {
  const zenithDeg = 90 - Math.max(elevationDeg, 0);
  if (zenithDeg >= 90) return 38;
  return 1 / (Math.cos(zenithDeg * DEG) + 0.50572 * Math.pow(96.07995 - zenithDeg, -1.6364));
}

/**
 * Fraction of each RGB channel of sunlight that survives the atmosphere at `elevationDeg`:
 * `exp(-τ · air mass)`. High sun keeps nearly all of it; a low sun loses the short wavelengths
 * first, which is the red sunset.
 * @internal
 */
export function sunTransmission(elevationDeg: number): [number, number, number] {
  const mass = airMass(elevationDeg);
  return [0, 1, 2].map((channel) => Math.exp(-RAYLEIGH_DEPTH[channel]! * mass)) as [number, number, number];
}

/**
 * The sun's colour at `elevationDeg`, normalised so its brightest channel is full: white overhead,
 * orange at the horizon, moon-blue once it has set. Intensity stays the authored cycle's job.
 */
export function sunlightColor(elevationDeg: number): string {
  if (elevationDeg <= -6) return MOONLIGHT_COLOR;
  const transmission = sunTransmission(Math.max(elevationDeg, 0));
  const brightest = Math.max(transmission[0], transmission[1], transmission[2], 1e-6);
  return rgbToHex(
    (transmission[0] / brightest) * 255,
    (transmission[1] / brightest) * 255,
    (transmission[2] / brightest) * 255,
  );
}

/** Perceived brightness (Rec. 709 luma) of a `#rrggbb` color, 0–1.
 * @internal
 */
export function luminanceOf(color: string): number {
  const [r, g, b] = hexToRgb(color);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Moonlight at `sunElevationDeg`'s opposite point: full at the top of the moon's arc, zero while
 * the moon is below the horizon, scaled by `peak` (a fraction of the authored sun intensity).
 */
export function moonIllumination(moonElevationDeg: number, peak: number = MOONLIGHT_PEAK): number {
  if (moonElevationDeg <= 0) return 0;
  return Math.sin(Math.min(moonElevationDeg, 90) * DEG) * Math.max(0, peak);
}

/** How visible the stars are: none in daylight, half at the first hint of a set sun, full once it is 6° under. */
export function starOpacity(sunElevationDeg: number): number {
  return 1 - smoothstep(-6, 0, sunElevationDeg);
}

