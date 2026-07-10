export type TrailPoint = readonly [number, number, number];

export interface LeaderTrailConfig {
  /** Arc-length gap between consecutive followers. */
  spacing: number;
  /** Followers the trail must be able to serve; history is capped to cover them. Default `16`. */
  maxFollowers?: number;
  /** Minimum leader movement before a new trail sample is recorded; default `spacing / 8`. */
  sampleDistance?: number;
}

export interface TrailPose {
  position: TrailPoint;
  /** Yaw (radians) of the trail direction at this point, matching engine `rotationY`. */
  heading: number;
}

/**
 * A live breadcrumb trail recorded from a moving leader, with followers placed by arc-length
 * behind the head — conga lines, convoys, duckling chains, snake bodies. Call `record` with the
 * leader's position every tick; read `followerAt(i)` for the pose `spacing * (i + 1)` behind.
 */
export interface LeaderTrail {
  record(position: TrailPoint): void;
  /** Pose for follower `index` (0 = closest behind the leader); `null` until enough trail exists. */
  followerAt(index: number): TrailPose | null;
  /** Recorded arc length available behind the leader. */
  length(): number;
  /** Drop all history (teleport, respawn) and optionally restart from a position. */
  reset(position?: TrailPoint): void;
}

export function createLeaderTrail(config: LeaderTrailConfig): LeaderTrail {
  if (!(config.spacing > 0)) throw new Error(`leader trail spacing must be positive, got ${config.spacing}`);
  const spacing = config.spacing;
  const maxFollowers = Math.max(1, config.maxFollowers ?? 16);
  const sampleDistance = config.sampleDistance ?? spacing / 8;
  const capacity = spacing * (maxFollowers + 1);

  let points: TrailPoint[] = [];
  let lengths: number[] = [];
  let total = 0;

  function trim(): void {
    while (total > capacity && lengths.length > 0) {
      const tailSegment = lengths[0]!;
      if (total - tailSegment < capacity) break;
      lengths.shift();
      points.shift();
      total -= tailSegment;
    }
  }

  return {
    record(position) {
      const head = points[points.length - 1];
      if (head === undefined) {
        points.push(position);
        return;
      }
      const step = Math.hypot(position[0] - head[0], position[1] - head[1], position[2] - head[2]);
      if (step < sampleDistance) return;
      points.push(position);
      lengths.push(step);
      total += step;
      trim();
    },
    followerAt(index) {
      const behind = spacing * (index + 1);
      if (behind > total) return null;
      let remaining = behind;
      for (let i = lengths.length - 1; i >= 0; i -= 1) {
        const segment = lengths[i]!;
        const to = points[i + 1]!;
        const from = points[i]!;
        if (remaining <= segment) {
          const fraction = segment <= 1e-9 ? 0 : remaining / segment;
          return {
            position: [
              to[0] + (from[0] - to[0]) * fraction,
              to[1] + (from[1] - to[1]) * fraction,
              to[2] + (from[2] - to[2]) * fraction,
            ],
            heading: Math.atan2(to[0] - from[0], to[2] - from[2]),
          };
        }
        remaining -= segment;
      }
      return null;
    },
    length: () => total,
    reset(position) {
      points = position === undefined ? [] : [position];
      lengths = [];
      total = 0;
    },
  };
}
