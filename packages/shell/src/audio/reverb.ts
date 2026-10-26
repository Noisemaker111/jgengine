import type { EnclosureSample, ReverbPreset } from "@jgengine/core/audio/reverb";
import type { SceneRaycastHit, SceneRaycastInput } from "@jgengine/core/scene/sceneRaycast";
import type { Point3 } from "@jgengine/core/world/geometry";


/** Tail length (seconds), how fast it dies (higher = quicker), wet level, and tone (lowpass Hz). */
const PRESETS: Record<Exclude<ReverbPreset, "none">, { seconds: number; decay: number; wet: number; tone: number }> = {
  outdoor: { seconds: 0.6, decay: 4, wet: 0.07, tone: 5000 },
  room: { seconds: 0.9, decay: 3.2, wet: 0.24, tone: 7000 },
  hall: { seconds: 2.2, decay: 2.4, wet: 0.3, tone: 6000 },
  cave: { seconds: 3.2, decay: 2, wet: 0.4, tone: 2600 },
};

/** Seconds a change of space takes to blend in. */
const BLEND_TC = 0.35;

/** A stereo noise burst with an exponential tail: the cheapest impulse that still reads as a space. */
function impulse(context: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(2, length, context.sampleRate);
  let seed = 0x9e3779b9;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = ((seed / 0xffffffff) * 2 - 1) * (1 - i / length) ** decay;
    }
  }
  return buffer;
}

/** The send every positioned voice feeds, and which space it currently rings in. @internal */
export interface ReverbRack {
  input: GainNode;
  select(preset: ReverbPreset): void;
  active(): ReverbPreset;
  dispose(): void;
}

/**
 * One convolver per space, built the first time that space is used, each behind a wet gain the rack
 * blends between, so walking indoors fades the room in instead of switching it. @internal
 */
export function createReverbRack(context: BaseAudioContext, output: AudioNode): ReverbRack {
  const input = context.createGain();
  const slots = new Map<ReverbPreset, { convolver: ConvolverNode; tone: BiquadFilterNode; wet: GainNode }>();
  let current: ReverbPreset = "none";

  function slot(preset: Exclude<ReverbPreset, "none">) {
    const existing = slots.get(preset);
    if (existing !== undefined) return existing;
    const def = PRESETS[preset];
    const convolver = context.createConvolver();
    convolver.buffer = impulse(context, def.seconds, def.decay);
    const tone = context.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = def.tone;
    const wet = context.createGain();
    wet.gain.value = 0;
    input.connect(convolver);
    convolver.connect(tone);
    tone.connect(wet);
    wet.connect(output);
    const made = { convolver, tone, wet };
    slots.set(preset, made);
    return made;
  }

  return {
    input,
    select(preset) {
      if (preset === current) return;
      current = preset;
      if (preset !== "none") slot(preset);
      for (const [id, entry] of slots) {
        const target = id === preset && id !== "none" ? PRESETS[id as Exclude<ReverbPreset, "none">].wet : 0;
        entry.wet.gain.setTargetAtTime(target, context.currentTime, BLEND_TC);
      }
    },
    active: () => current,
    dispose() {
      input.disconnect();
      for (const entry of slots.values()) {
        entry.convolver.disconnect();
        entry.tone.disconnect();
        entry.wet.disconnect();
      }
      slots.clear();
    },
  };
}

/** The narrow slice of the scene an enclosure test needs. */
export interface EnclosureRaycastSource {
  raycast(input: SceneRaycastInput): SceneRaycastHit | null;
}

const WALL_DIRECTIONS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0.7071, 0, 0.7071], [-0.7071, 0, -0.7071],
];

/**
 * Six wall rays and one ceiling ray around `at`, against world geometry only (never creatures or
 * terrain), to tell a room from open ground. Seven scene queries; the caller decides how often.
 * @internal
 */
export function sampleEnclosure(source: EnclosureRaycastSource, at: Point3, reach = 14): EnclosureSample {
  const cast = (direction: readonly [number, number, number], maxDistance: number): number | null => {
    const hit = source.raycast({
      origin: [at.x, at.y, at.z],
      direction,
      maxDistance,
      filter: { entities: false, terrain: false },
      accept: (candidate) => candidate.blocks,
    });
    return hit === null ? null : hit.distance;
  };
  return { ceiling: cast([0, 1, 0], 30), walls: WALL_DIRECTIONS.map((direction) => cast(direction, reach)) };
}
