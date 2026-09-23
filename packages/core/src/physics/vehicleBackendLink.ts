import type { BodyHandle, PhysicsBackend, PhysicsQuat, PhysicsVec3 } from "./physicsBackend";

/** Options for {@link createVehicleBackendLink}. */
export interface VehicleBackendLinkOptions {
  /** Chassis collision box half extents, m (width/2, height/2, length/2), heading along +z. */
  halfExtents: PhysicsVec3;
  /** Gap kept between the box bottom and the car's base height, so the cast never scrapes the ground (default `0.1`). */
  clearance?: number;
  /** Collision layer bitmask of the chassis body (default `1`). */
  layers?: number;
  /** Layers the chassis body collides with and shoves in the solver (default all). */
  mask?: number;
  /** Layers that stop the car in `clampMove` (default all). Leave props off it so the car shoves them instead of stopping. */
  blockMask?: number;
  /** Contact normals steeper than this `y` count as ground, not walls, and never block (default `0.7`). */
  groundNormalY?: number;
}

/** The pose fields {@link VehicleBackendLink.sync} reads; any vehicle step (`VehicleDynamicsStep`, `KinematicVehicleStep`) fits. */
export interface VehicleLinkPose {
  position: readonly [number, number, number];
  heading: number;
  bodyPitch?: number;
  bodyRoll?: number;
}

/** A wall the last clamped move ran into. */
export interface VehicleLinkHit {
  body: BodyHandle;
  normal: PhysicsVec3;
  /** Metres of this move the wall absorbed; divide by `dt` for the impact speed. */
  blocked: number;
}

/** A vehicle sim's presence in a physics backend: a kinematic chassis that shoves props, and a wall-aware move clamp. */
export interface VehicleBackendLink {
  readonly body: BodyHandle;
  /** Pass as the sim's `clampMove` option: sweeps the chassis box and stops at walls, sliding along them. */
  clampMove(from: readonly [number, number], to: readonly [number, number]): readonly [number, number];
  /** Move the kinematic chassis to the sim's pose; call after each sim tick, before the backend steps. */
  sync(pose: VehicleLinkPose): void;
  /** The wall the most recent `clampMove` hit, or `null`. */
  lastHit(): VehicleLinkHit | null;
  dispose(): void;
}

/** Yaw about +y (heading), then pitch about the car's x, then roll about its z, as a quaternion. */
function poseQuat(heading: number, pitch: number, roll: number): PhysicsQuat {
  const hy = heading / 2;
  const hp = pitch / 2;
  const hr = roll / 2;
  const cy = Math.cos(hy);
  const sy = Math.sin(hy);
  const cp = Math.cos(hp);
  const sp = Math.sin(hp);
  const cr = Math.cos(hr);
  const sr = Math.sin(hr);
  return [
    cy * sp * cr + sy * cp * sr,
    sy * cp * cr - cy * sp * sr,
    cy * cp * sr - sy * sp * cr,
    cy * cp * cr + sy * sp * sr,
  ];
}

/**
 * Puts a vehicle sim (`createVehicleDynamics`, `createKinematicVehicle`) into a {@link PhysicsBackend} world without
 * handing its handling to the rigid-body solver: the sim still owns grip and balance, while a kinematic chassis box
 * follows it so Rapier or `PhysicsWorld` props get shoved, and `clampMove` sweeps that box so walls and parked cars
 * stop it and it slides along them.
 * @capability vehicle-backend-link collide a vehicle sim with a physics backend — shove props, stop at walls, slide along them
 */
export function createVehicleBackendLink(backend: PhysicsBackend, options: VehicleBackendLinkOptions): VehicleBackendLink {
  const half = options.halfExtents;
  const clearance = options.clearance ?? 0.1;
  const groundNormalY = options.groundNormalY ?? 0.7;
  const shape = { kind: "box" as const, halfExtents: half };
  const pose = { baseY: 0, heading: 0, pitch: 0, roll: 0 };
  const hit: { active: boolean; value: VehicleLinkHit } = { active: false, value: { body: -1, normal: [0, 0, 0], blocked: 0 } };
  const body = backend.addBody({
    shape,
    kind: "kinematic",
    position: [0, half[1] + clearance, 0],
    layers: options.layers ?? 1,
    ...(options.mask === undefined ? {} : { mask: options.mask }),
  });

  function sweep(x: number, z: number, dx: number, dz: number) {
    return backend.shapecast({
      shape,
      position: [x, pose.baseY + half[1] + clearance, z],
      rotation: poseQuat(pose.heading, 0, 0),
      motion: [dx, 0, dz],
      exclude: body,
      ...(options.blockMask === undefined ? {} : { mask: options.blockMask }),
    });
  }

  return {
    body,
    clampMove(from, to) {
      hit.active = false;
      let x = from[0];
      let z = from[1];
      let dx = to[0] - x;
      let dz = to[1] - z;
      for (let pass = 0; pass < 2; pass += 1) {
        const length = Math.hypot(dx, dz);
        if (length < 1e-9) break;
        const found = sweep(x, z, dx, dz);
        if (found === null || found.normal[1] > groundNormalY) {
          x += dx;
          z += dz;
          break;
        }
        const travel = Math.max(0, found.toi - 0.02 / length);
        x += dx * travel;
        z += dz * travel;
        const nx = found.normal[0];
        const nz = found.normal[2];
        const flat = Math.hypot(nx, nz) || 1;
        const restX = dx * (1 - travel);
        const restZ = dz * (1 - travel);
        const into = (restX * nx + restZ * nz) / flat;
        hit.active = true;
        hit.value = { body: found.body, normal: [nx / flat, 0, nz / flat], blocked: Math.abs(into) };
        dx = restX - (into * nx) / flat;
        dz = restZ - (into * nz) / flat;
      }
      return [x, z];
    },
    sync(next) {
      pose.baseY = next.position[1];
      pose.heading = next.heading;
      pose.pitch = next.bodyPitch ?? 0;
      pose.roll = next.bodyRoll ?? 0;
      const center: PhysicsVec3 = [next.position[0], next.position[1] + half[1] + clearance, next.position[2]];
      const rotation = poseQuat(pose.heading, pose.pitch, pose.roll);
      backend.setKinematicTarget(body, center, rotation);
      // A resting prop sleeps, and a kinematic body moved by target does not wake it on every backend.
      for (const touched of backend.overlap({ shape, position: center, rotation, exclude: body })) backend.wake(touched);
    },
    lastHit: () => (hit.active ? hit.value : null),
    dispose() {
      if (backend.hasBody(body)) backend.removeBody(body);
    },
  };
}
