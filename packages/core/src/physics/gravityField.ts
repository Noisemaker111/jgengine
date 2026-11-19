export type GravityVector = readonly [number, number, number];

/** Position-dependent gravity source used by movement and vehicle simulations. */
export interface GravityField {
  sample(position: GravityVector): GravityVector;
}

export interface PointGravityOptions {
  center: GravityVector;
  strength: number;
  falloff?: "constant" | "inverseSquare";
  minRadius?: number;
}

/** @capability gravity-field sample configurable uniform, radial, or combined gravity */
export function uniformGravity(vector: GravityVector = [0, -9.81, 0]): GravityField {
  return { sample: () => vector };
}

/** @capability gravity-field sample configurable uniform, radial, or combined gravity */
export function pointGravity(options: PointGravityOptions): GravityField {
  const minRadius = Math.max(0.001, options.minRadius ?? 1);
  return {
    sample(position) {
      const dx = options.center[0] - position[0];
      const dy = options.center[1] - position[1];
      const dz = options.center[2] - position[2];
      const distance = Math.max(minRadius, Math.hypot(dx, dy, dz));
      const scale = options.falloff === "inverseSquare" ? options.strength / (distance * distance) : options.strength;
      return [dx / distance * scale, dy / distance * scale, dz / distance * scale];
    },
  };
}

/** @capability gravity-field sample configurable uniform, radial, or combined gravity */
export function combineGravity(fields: readonly GravityField[]): GravityField {
  return {
    sample(position) {
      let x = 0;
      let y = 0;
      let z = 0;
      for (const field of fields) {
        const vector = field.sample(position);
        x += vector[0];
        y += vector[1];
        z += vector[2];
      }
      return [x, y, z];
    },
  };
}
