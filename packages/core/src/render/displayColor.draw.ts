import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  CineonToneMapping,
  LinearToneMapping,
  NeutralToneMapping,
  ReinhardToneMapping,
  type Color,
  type ToneMapping,
} from "three";

type Rgb = [number, number, number];

const saturate = (x: number): number => Math.min(1, Math.max(0, x));

/** GLSL `mat3(c0, c1, c2) * v` with the columns three's tonemapping chunk declares. */
function mat3(c: readonly (readonly number[])[], v: Rgb): Rgb {
  return [
    c[0]![0]! * v[0] + c[1]![0]! * v[1] + c[2]![0]! * v[2],
    c[0]![1]! * v[0] + c[1]![1]! * v[1] + c[2]![1]! * v[2],
    c[0]![2]! * v[0] + c[1]![2]! * v[1] + c[2]![2]! * v[2],
  ];
}

const ACES_IN = [[0.59719, 0.076, 0.0284], [0.35458, 0.90834, 0.13383], [0.04823, 0.01566, 0.83777]];
const ACES_OUT = [[1.60475, -0.10208, -0.00327], [-0.53108, 1.10813, -0.07276], [-0.07367, -0.00605, 1.07602]];
const REC2020_TO_SRGB = [[1.6605, -0.1246, -0.0182], [-0.5876, 1.1329, -0.1006], [-0.0728, -0.0083, 1.1187]];
const SRGB_TO_REC2020 = [[0.6274, 0.0691, 0.0164], [0.3293, 0.9195, 0.088], [0.0433, 0.0113, 0.8956]];
const AGX_INSET = [
  [0.856627153315983, 0.137318972929847, 0.11189821299995],
  [0.0951212405381588, 0.761241990602591, 0.0767994186031903],
  [0.0482516061458583, 0.101439036467562, 0.811302368396859],
];
const AGX_OUTSET = [
  [1.1271005818144368, -0.1413297634984383, -0.14132976349843826],
  [-0.11060664309660323, 1.157823702216272, -0.11060664309660294],
  [-0.016493938717834573, -0.016493938717834257, 1.2519364065950405],
];
const AGX_MIN_EV = -12.47393;
const AGX_MAX_EV = 4.026069;

function aces(c: Rgb): Rgb {
  const v = mat3(ACES_IN, [c[0] / 0.6, c[1] / 0.6, c[2] / 0.6]);
  const fit = v.map((x) => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081)) as Rgb;
  return mat3(ACES_OUT, fit).map(saturate) as Rgb;
}

function agx(c: Rgb): Rgb {
  const inset = mat3(AGX_INSET, mat3(SRGB_TO_REC2020, c));
  const curved = inset.map((x) => {
    const t = saturate((Math.log2(Math.max(x, 1e-10)) - AGX_MIN_EV) / (AGX_MAX_EV - AGX_MIN_EV));
    const t2 = t * t;
    const t4 = t2 * t2;
    return 15.5 * t4 * t2 - 40.14 * t4 * t + 31.96 * t4 - 6.868 * t2 * t + 0.4298 * t2 + 0.1191 * t - 0.00232;
  }) as Rgb;
  const out = mat3(AGX_OUTSET, curved).map((x) => Math.pow(Math.max(0, x), 2.2)) as Rgb;
  return mat3(REC2020_TO_SRGB, out).map(saturate) as Rgb;
}

function neutral(input: Rgb): Rgb {
  const x = Math.min(input[0], input[1], input[2]);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  const c = input.map((v) => v - offset) as Rgb;
  const peak = Math.max(c[0], c[1], c[2]);
  const start = 0.76;
  if (peak < start) return c;
  const d = 1 - start;
  const newPeak = 1 - (d * d) / (peak + d - start);
  const g = 1 - 1 / (0.15 * (peak - newPeak) + 1);
  return c.map((v) => v * (newPeak / peak) * (1 - g) + newPeak * g) as Rgb;
}

/**
 * three.js r182's tone-mapping curve for `mode`, applied to a linear scene color at `exposure`.
 * Mirrors `tonemapping_pars_fragment`; `NoToneMapping` and custom curves pass through.
 * @internal
 */
export function toneMapColor(color: readonly [number, number, number], mode: ToneMapping, exposure = 1): Rgb {
  const c: Rgb = [color[0] * exposure, color[1] * exposure, color[2] * exposure];
  switch (mode) {
    case LinearToneMapping:
      return c.map(saturate) as Rgb;
    case ReinhardToneMapping:
      return c.map((x) => saturate(x / (1 + x))) as Rgb;
    case CineonToneMapping:
      return c.map((v) => {
        const x = Math.max(0, v - 0.004);
        return Math.pow((x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06), 2.2);
      }) as Rgb;
    case ACESFilmicToneMapping:
      return aces(c);
    case AgXToneMapping:
      return agx(c);
    case NeutralToneMapping:
      return neutral(c);
    default:
      return c;
  }
}

const CURVED = new Set<ToneMapping>([ReinhardToneMapping, CineonToneMapping, ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping]);

/** Keeps a compensated sky inside half-float range; the brightest pastel under AgX needs ~13. */
const MAX_SCENE_VALUE = 32;

/**
 * The linear scene color that `mode` at `exposure` displays as `display` (linear sRGB, 0..1).
 * Sky and fog colors are picked as on-screen swatches, but the output pass tone-maps them like
 * lit surfaces, which turns a pale horizon grey. Solved by fixed-point iteration because AgX and
 * ACES mix channels; a swatch a curve cannot reach (pure white, a saturated highlight under AgX)
 * lands on the closest color it can show.
 * @internal
 */
export function sceneColorForDisplay(display: readonly [number, number, number], mode: ToneMapping, exposure = 1): Rgb {
  const target: Rgb = [saturate(display[0]), saturate(display[1]), saturate(display[2])];
  if (mode === LinearToneMapping) return target.map((v) => v / Math.max(exposure, 1e-6)) as Rgb;
  if (!CURVED.has(mode)) return target;
  const scene: Rgb = [...target];
  let best: Rgb = [...target];
  let bestError = Number.POSITIVE_INFINITY;
  for (let iteration = 0; iteration < 48; iteration += 1) {
    const shown = toneMapColor(scene, mode, exposure);
    const error = Math.abs(shown[0] - target[0]) + Math.abs(shown[1] - target[1]) + Math.abs(shown[2] - target[2]);
    if (error < bestError) {
      bestError = error;
      best = [scene[0], scene[1], scene[2]];
    }
    for (let channel = 0; channel < 3; channel += 1) {
      // Clamped so a channel a curve's toe or shoulder cannot reach does not blow up its neighbors.
      const ratio = Math.min(2, Math.max(0.5, Math.max(target[channel]!, 1e-5) / Math.max(shown[channel]!, 1e-5)));
      scene[channel] = Math.min(MAX_SCENE_VALUE, Math.max(1e-5, scene[channel]! * Math.pow(ratio, 0.8)));
    }
  }
  return best;
}

/**
 * Writes the scene color that displays as `display` into `target`, recomputing only when the
 * swatch or the renderer's tone mapping changes, so per-frame sky drivers stay allocation-free.
 * @internal
 */
export class DisplayColorWriter {
  private hex = -1;
  private mode: ToneMapping | -1 = -1;
  private exposure = Number.NaN;
  private scene: Rgb = [0, 0, 0];

  write(target: Color, display: Color, renderer: { toneMapping: ToneMapping; toneMappingExposure: number }): void {
    const hex = display.getHex();
    if (hex !== this.hex || renderer.toneMapping !== this.mode || renderer.toneMappingExposure !== this.exposure) {
      this.hex = hex;
      this.mode = renderer.toneMapping;
      this.exposure = renderer.toneMappingExposure;
      this.scene = sceneColorForDisplay([display.r, display.g, display.b], this.mode, this.exposure);
    }
    target.setRGB(this.scene[0], this.scene[1], this.scene[2]);
  }
}
