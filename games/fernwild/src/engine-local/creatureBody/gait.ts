import type { GlbClip, GlbTrack } from "./glbWrite";

type V3 = readonly [number, number, number];
type Quat = [number, number, number, number];

/** A leg, arm or splayed bug leg that swings through a stride. */
export interface GaitLimb {
  node: number;
  /** Swing phase in turns. */
  phase: number;
  /** Swing axis: X for an upright leg, Y for a splayed one. */
  axis: V3;
  /** Share of the full swing (arms swing less than legs). */
  scale: number;
}

/** The moving parts of a creature rig, by node index, that {@link gaitClips} animates. */
export interface GaitRig {
  /** The trunk node; it bobs on the stride and falls over on death. */
  body: number;
  /** The trunk's rest translation. */
  restBody: V3;
  limbs: readonly GaitLimb[];
  /** Tail segments (or a serpent's body) that sway side to side, wave-delayed by `phase`. */
  swaying: readonly { node: number; phase: number; amp: number }[];
  /** Left then right wing. */
  wings: readonly number[];
  /** The neck (or head) that nods and lunges to bite. */
  nodder: number;
  /** Standing height in model units, which scales the bob. */
  height: number;
  /** How high the trunk's centre rests once the body lies on its side. */
  fallen: number;
}

const LOOP_KEYS = 12;

function loop(duration: number, sample: (turn: number) => readonly number[]): { times: number[]; values: (readonly number[])[] } {
  const times: number[] = [];
  const values: (readonly number[])[] = [];
  for (let k = 0; k <= LOOP_KEYS; k += 1) {
    times.push((k / LOOP_KEYS) * duration);
    values.push(sample((k % LOOP_KEYS) / LOOP_KEYS));
  }
  return { times, values };
}

/** A unit quaternion turning `angle` radians about `axis`. */
function axisAngle(axis: V3, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

const deg = (d: number) => (d * Math.PI) / 180;

/**
 * The five clips the engine's clip roles read (Idle, Walk, Run, Attack, Death) for a rig of
 * swinging limbs, a bobbing trunk, a swaying tail, flapping wings and a nodding head. Shared by
 * generated bodies and rigged static models, so both move the same way.
 * @capability creature-gait idle, walk, run, attack and death clips for any limb-and-tail creature rig
 */
export function gaitClips(rig: GaitRig): GlbClip[] {
  const { body, restBody, limbs, swaying, wings, nodder, height, fallen } = rig;
  const tracksFor = (duration: number, swing: number, bob: number, sway: number, flap: number, nod: number): GlbTrack[] => {
    const tracks: GlbTrack[] = [];
    for (const limb of limbs) {
      const { times, values } = loop(duration, (turn) => axisAngle(limb.axis, deg(swing * limb.scale) * Math.sin((turn + limb.phase) * Math.PI * 2)));
      tracks.push({ node: limb.node, path: "rotation", times, values });
    }
    tracks.push({ node: body, path: "translation", ...loop(duration, (turn) => [restBody[0], restBody[1] + bob * Math.abs(Math.sin(turn * Math.PI * 2)), restBody[2]]) });
    tracks.push({ node: body, path: "rotation", ...loop(duration, () => [0, 0, 0, 1]) });
    for (const tail of swaying) {
      const { times, values } = loop(duration, (turn) => axisAngle([0, 1, 0], deg(sway * (tail.amp / 10)) * Math.sin((turn - tail.phase) * Math.PI * 2)));
      tracks.push({ node: tail.node, path: "rotation", times, values });
    }
    wings.forEach((wing, index) => {
      const side = index === 0 ? 1 : -1;
      const { times, values } = loop(duration, (turn) => axisAngle([0, 0, 1], side * deg(flap) * Math.sin(turn * Math.PI * 2)));
      tracks.push({ node: wing, path: "rotation", times, values });
    });
    tracks.push({ node: nodder, path: "rotation", ...loop(duration, (turn) => axisAngle([1, 0, 0], deg(nod) * Math.sin(turn * Math.PI * 4))) });
    return tracks;
  };
  return [
    { name: "Idle", tracks: tracksFor(2.4, 0, height * 0.008, 4, 6, 3) },
    { name: "Walk", tracks: tracksFor(1.1, 24, height * 0.02, 8, 28, 4) },
    { name: "Run", tracks: tracksFor(0.6, 38, height * 0.04, 12, 45, 6) },
    {
      name: "Attack",
      tracks: [{ node: nodder, path: "rotation", times: [0, 0.18, 0.32, 0.6], values: [[0, 0, 0, 1], axisAngle([1, 0, 0], deg(-18)), axisAngle([1, 0, 0], deg(22)), [0, 0, 0, 1]] }],
    },
    {
      name: "Death",
      tracks: [
        { node: body, path: "rotation", times: [0, 0.5, 1.2], values: [[0, 0, 0, 1], axisAngle([0, 0, 1], deg(40)), axisAngle([0, 0, 1], deg(90))] },
        { node: body, path: "translation", times: [0, 0.5, 1.2], values: [restBody, [restBody[0], (restBody[1] + fallen) / 2, restBody[2]], [restBody[0], fallen, restBody[2]]] },
      ],
    },
  ];
}
