/**
 * Brake fade: the brakes turn the car's kinetic energy into disc heat, the discs shed it to the air faster the faster
 * the car goes, and the pad's friction falls once the disc is hot, so a heavy car braking hard again and again stops
 * longer each time. One lumped disc temperature for the car (Limpert, *Brake Design and Safety*, 3rd ed., 2011, §3:
 * single-stop rise `ΔT = E/(m·c)`, convective cooling `h·A·(T − T∞)` rising with speed).
 */
export interface VehicleBrakeFadeEffect {
  /**
   * Multiplier on the effect: `0` off (cold brakes forever), `1` the pad's measured fade (default), past `1` the friction
   * falls further at the same temperature (never below a tenth); sane over `0..4`.
   */
  strength?: number;
  /** Heat capacity of all the discs together, J/K (default `9600`: a road car's four cast-iron discs, ~21 kg at 460 J/(kg·K)). */
  heatCapacity?: number;
  /** Share of the braking energy that goes into the discs (default `0.9`; the pads and air take the rest). */
  discShare?: number;
  /** Heat the discs shed per kelvin above ambient, W/K, at rest and per m/s of speed (default `4` and `1.2`). */
  cooling?: { rest: number; perSpeed: number };
  /** Ambient temperature, °C (default `20`). */
  ambient?: number;
  /** Pad friction against disc temperature, `[°C, share of cold friction]` in rising °C (default a road pad: full to 350 °C, 0.6 at 600 °C, 0.35 at 800 °C). */
  fade?: readonly (readonly [number, number])[];
}

const ROAD_PAD: readonly (readonly [number, number])[] = [
  [0, 1],
  [350, 1],
  [450, 0.85],
  [600, 0.6],
  [800, 0.35],
];

function sample(curve: readonly (readonly [number, number])[], x: number): number {
  const first = curve[0];
  if (first === undefined) return 1;
  if (x <= first[0]) return first[1];
  for (let i = 1; i < curve.length; i += 1) {
    const hi = curve[i];
    const lo = curve[i - 1];
    if (hi === undefined || lo === undefined) break;
    if (x <= hi[0]) return lo[1] + ((hi[1] - lo[1]) * (x - lo[0])) / Math.max(1e-9, hi[0] - lo[0]);
  }
  return curve[curve.length - 1]?.[1] ?? 1;
}

/**
 * The share of cold brake force the pads give at disc temperature `temperature` °C, with the fade scaled by `strength`.
 * @capability brake-fade brake force that fades as the discs heat up under repeated hard stops and recovers as they cool
 */
export function brakeFadeShare(effect: VehicleBrakeFadeEffect, temperature: number, strength: number): number {
  const share = sample(effect.fade ?? ROAD_PAD, temperature);
  return strength === 1 ? share : Math.max(0.1, Math.min(1, 1 - strength * (1 - share)));
}

/**
 * Disc temperature after `seconds` with `brakePower` W going into the brakes at `speed` m/s, °C.
 * @internal
 */
export function brakeTemperatureStep(effect: VehicleBrakeFadeEffect, temperature: number, brakePower: number, speed: number, seconds: number): number {
  const ambient = effect.ambient ?? 20;
  const capacity = Math.max(1, effect.heatCapacity ?? 9600);
  const cooling = effect.cooling ?? { rest: 4, perSpeed: 1.2 };
  const shed = Math.max(0, cooling.rest + cooling.perSpeed * Math.abs(speed));
  const heat = Math.max(0, brakePower) * (effect.discShare ?? 0.9);
  // Exact for constant power across the step: T relaxes toward ambient + heat/shed.
  if (shed <= 0) return temperature + (heat * seconds) / capacity;
  const target = ambient + heat / shed;
  return target + (temperature - target) * Math.exp((-shed * seconds) / capacity);
}
