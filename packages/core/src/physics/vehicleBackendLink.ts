import type { BodyHandle, PhysicsBackend, PhysicsQuat, PhysicsVec3, RayCastVehicle, RayCastWheelDesc, RayCastWheelState, RayHit } from "./physicsBackend";

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
  /** Wheels to probe in the chassis frame (centre of the box, forward +z); {@link VehicleBackendLink.probeWheels} reports where each touches ground. */
  wheels?: readonly RayCastWheelDesc[];
  /** Layers the wheel probes hit (default all). */
  wheelMask?: number;
}

/** The pose fields {@link VehicleBackendLink.sync} reads; a `VehicleDynamicsStep` fits. */
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
  /**
   * Cast every configured wheel from the chassis' current pose; call after the backend steps. Uses the backend's own
   * ray-cast vehicle when it has one (Rapier), else one backend ray per wheel. The returned states are reused.
   */
  probeWheels(dt: number): readonly RayCastWheelState[];
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

function rotate(q: PhysicsQuat, v: PhysicsVec3, out: [number, number, number]): [number, number, number] {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  out[0] = v[0] + w * tx + (y * tz - z * ty);
  out[1] = v[1] + w * ty + (z * tx - x * tz);
  out[2] = v[2] + w * tz + (x * ty - y * tx);
  return out;
}

/**
 * Puts a vehicle sim (`createVehicleDynamics`) into a {@link PhysicsBackend} world without
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

  const wheelSpecs = options.wheels ?? [];
  const wheelStates: RayCastWheelState[] = wheelSpecs.map(() => ({
    inContact: false, suspensionLength: 0, suspensionForce: 0, contactPoint: [0, 0, 0], contactNormal: [0, 1, 0], ground: null, rotation: 0,
  }));
  const native: RayCastVehicle | null = wheelSpecs.length > 0 && backend.createRayCastVehicle !== undefined
    ? backend.createRayCastVehicle({ chassis: body, wheels: wheelSpecs, ...(options.wheelMask === undefined ? {} : { mask: options.wheelMask }) })
    : null;
  const center: [number, number, number] = [0, half[1] + clearance, 0];
  const origin: [number, number, number] = [0, 0, 0];
  const direction: [number, number, number] = [0, -1, 0];
  const touching: BodyHandle[] = [];
  const probe: RayHit = { body: -1, distance: 0, point: [0, 0, 0], normal: [0, 1, 0] };

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
      center[0] = next.position[0];
      center[1] = next.position[1] + half[1] + clearance;
      center[2] = next.position[2];
      const rotation = poseQuat(pose.heading, pose.pitch, pose.roll);
      backend.setKinematicTarget(body, center, rotation);
      // A resting prop sleeps, and a kinematic body moved by target does not wake it on every backend.
      for (const touched of backend.overlap({ shape, position: center, rotation, exclude: body }, touching)) backend.wake(touched);
    },
    lastHit: () => (hit.active ? hit.value : null),
    probeWheels(dt) {
      if (native !== null) {
        native.update(dt);
        wheelStates.forEach((state, i) => native.wheel(i, state));
        return wheelStates;
      }
      const rotation = poseQuat(pose.heading, pose.pitch, pose.roll);
      wheelSpecs.forEach((wheel, i) => {
        const state = wheelStates[i];
        if (state === undefined) return;
        rotate(rotation, wheel.connection, origin);
        origin[0] += center[0];
        origin[1] += center[1];
        origin[2] += center[2];
        rotate(rotation, wheel.direction ?? [0, -1, 0], direction);
        const found = backend.raycast({
          origin, direction, maxDistance: wheel.restLength + wheel.radius, exclude: body,
          ...(options.wheelMask === undefined ? {} : { mask: options.wheelMask }),
        }, probe);
        state.inContact = found !== null;
        state.suspensionLength = found === null ? wheel.restLength : Math.max(0, found.distance - wheel.radius);
        state.ground = found === null ? null : found.body;
        if (found !== null) {
          state.contactPoint[0] = found.point[0];
          state.contactPoint[1] = found.point[1];
          state.contactPoint[2] = found.point[2];
          state.contactNormal[0] = found.normal[0];
          state.contactNormal[1] = found.normal[1];
          state.contactNormal[2] = found.normal[2];
        }
      });
      return wheelStates;
    },
    dispose() {
      native?.dispose();
      if (backend.hasBody(body)) backend.removeBody(body);
    },
  };
}
