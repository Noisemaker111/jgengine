export type TrailPoint = readonly [number, number, number];

export interface LeaderTrailConfig {
  spacing: number;
  /** Followers the trail must be able to serve; history is capped to cover them. Default `16`. */
  maxFollowers?: number;
  sampleDistance?: number;
}

export interface TrailPose {
  position: TrailPoint;
  /** Yaw (radians) of the trail direction at this point, matching engine `rotationY`. */
  heading: number;
}

export interface LeaderTrail {
  record(position: TrailPoint): void;
  followerAt(index: number): TrailPose | null;
  length(): number;
  reset(position?: TrailPoint): void;
}

/** @capability follow-trail trailing follower/snake formation that chases a leader */
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
