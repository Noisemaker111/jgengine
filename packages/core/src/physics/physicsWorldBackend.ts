import {
  IDENTITY_QUAT,
  isIdentityQuat,
  shapeHalfExtents,
  type BodyDesc,
  type BodyHandle,
  type BodyKind,
  type BodyShape,
  type BodyState,
  type ContactEvent,
  type JointDesc,
  type JointHandle,
  type PhysicsBackend,
  type PhysicsBackendConfig,
  type PhysicsCapabilities,
  type PhysicsQuat,
  type PhysicsVec3,
  type RayHit,
  type ShapeCastHit,
} from "./physicsBackend";
import { PhysicsWorld, type PhysicsBounds, type PhysicsPrecision } from "./physicsWorld";

/** Construction options: the `PhysicsWorld` capacity and bounds plus the shared backend config. */
export interface PhysicsWorldBackendOptions extends PhysicsBackendConfig {
  capacity: number;
  bounds: PhysicsBounds;
  precision?: PhysicsPrecision;
  friction?: number;
  restitution?: number;
  /** Warn (once) when a body asks for rotation or a shape this backend approximates. Default `true`. */
  warn?: boolean;
}

interface BodyRecord {
  index: number;
  shape: BodyShape;
  kind: BodyKind;
  layers: number;
  mask: number;
  userData: unknown;
  half: [number, number, number];
  kinematicVelocity: [number, number, number];
  kinematicTarget: [number, number, number] | null;
}

interface JointRecord {
  id: number;
  desc: JointDesc;
}

interface SavedBody {
  handle: BodyHandle;
  shape: BodyShape;
  kind: BodyKind;
  layers: number;
  mask: number;
  userData: unknown;
  mass: number;
  position: [number, number, number];
  velocity: [number, number, number];
  sleeping: boolean;
}

/** Serializable backend state: every live body and joint, with handles preserved. */
export interface PhysicsWorldBackendState {
  nextHandle: number;
  nextJoint: number;
  bodies: SavedBody[];
  joints: { handle: JointHandle; desc: JointDesc }[];
}

const ALL_LAYERS = 0xffffffff;
const CAPABILITIES: PhysicsCapabilities = {
  rotation: false,
  shapes: ["box", "sphere", "capsule", "convex", "trimesh", "heightfield"],
  ccd: false,
  joints: ["fixed", "hinge", "ball", "distance", "spring"],
};

function slabRay(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): { t: number; axis: number; sign: number } | null {
  let tMin = 0;
  let tMax = Number.POSITIVE_INFINITY;
  let axis = -1;
  let sign = 0;
  const origin = [ox, oy, oz];
  const dir = [dx, dy, dz];
  const mins = [minX, minY, minZ];
  const maxs = [maxX, maxY, maxZ];
  for (let i = 0; i < 3; i += 1) {
    const o = origin[i]!;
    const d = dir[i]!;
    if (Math.abs(d) < 1e-12) {
      if (o < mins[i]! || o > maxs[i]!) return null;
      continue;
    }
    const inv = 1 / d;
    let t1 = (mins[i]! - o) * inv;
    let t2 = (maxs[i]! - o) * inv;
    let entrySign = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      entrySign = 1;
    }
    // `>=` so a shape resting exactly on a face still reports the contact at t=0 (grounding needs it).
    if (t1 >= tMin) {
      tMin = t1;
      axis = i;
      sign = entrySign;
    }
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return { t: tMin, axis, sign };
}

/**
 * `PhysicsWorld` behind the {@link PhysicsBackend} interface: zero dependencies, translation-only. Capsules,
 * convex hulls, meshes, and heightfields collide as their bounding boxes; rotation, angular velocity, CCD, and
 * hinge limits are accepted and ignored (see {@link PhysicsBackend.capabilities}). Reach for `@jgengine/rapier`
 * when a game needs those for real; the seam is the same.
 *
 * @capability physics-world-backend the zero-dependency PhysicsWorld solver exposed through the PhysicsBackend seam
 */
export function createPhysicsWorldBackend(options: PhysicsWorldBackendOptions): PhysicsBackend {
  const world = new PhysicsWorld({
    capacity: options.capacity,
    bounds: options.bounds,
    ...(options.gravity === undefined ? {} : { gravity: options.gravity[1] }),
    ...(options.fixedDt === undefined ? {} : { fixedDt: options.fixedDt }),
    ...(options.maxSubsteps === undefined ? {} : { maxSubsteps: options.maxSubsteps }),
    ...(options.precision === undefined ? {} : { precision: options.precision }),
    ...(options.friction === undefined ? {} : { friction: options.friction }),
    ...(options.restitution === undefined ? {} : { restitution: options.restitution }),
  });
  const records = new Map<BodyHandle, BodyRecord>();
  const handleOfIndex = new Map<number, BodyHandle>();
  const joints = new Map<JointHandle, JointRecord>();
  const masses = new Map<BodyHandle, number>();
  let nextHandle = 1;
  let nextJoint = 1;
  let warnedRotation = false;
  let warnedShape = false;
  let contactListener: ((event: ContactEvent) => void) | null = null;
  const contactEvent: { a: number; b: number; normal: [number, number, number]; approachSpeed: number; impulse: number } = {
    a: 0,
    b: 0,
    normal: [0, 0, 0],
    approachSpeed: 0,
    impulse: 0,
  };
  const warn = options.warn ?? true;

  function noteRotation(rotation: PhysicsQuat | undefined): void {
    if (warnedRotation || !warn || isIdentityQuat(rotation)) return;
    warnedRotation = true;
    console.warn("[jgengine:physics] PhysicsWorld backend ignores rotation; use @jgengine/rapier for rotating bodies.");
  }

  function noteShape(shape: BodyShape): void {
    if (warnedShape || !warn || shape.kind === "box" || shape.kind === "sphere") return;
    warnedShape = true;
    console.warn(`[jgengine:physics] PhysicsWorld backend collides "${shape.kind}" shapes as their bounding box.`);
  }

  function record(handle: BodyHandle): BodyRecord {
    const rec = records.get(handle);
    if (rec === undefined) throw new Error(`physics: unknown body handle ${handle}`);
    return rec;
  }

  function insert(handle: BodyHandle, desc: BodyDesc, sleeping: boolean): void {
    const kind = desc.kind ?? "dynamic";
    const half = shapeHalfExtents(desc.shape);
    const index = world.addBody(
      desc.shape.kind === "sphere"
        ? {
            shape: "sphere",
            radius: desc.shape.radius,
            position: desc.position,
            ...(desc.velocity === undefined ? {} : { velocity: desc.velocity }),
            mass: desc.mass ?? 1,
            static: kind !== "dynamic",
            asleep: sleeping,
          }
        : {
            shape: "box",
            halfExtents: half,
            position: desc.position,
            ...(desc.velocity === undefined ? {} : { velocity: desc.velocity }),
            mass: desc.mass ?? 1,
            static: kind !== "dynamic",
            asleep: sleeping,
          },
    );
    records.set(handle, {
      index,
      shape: desc.shape,
      kind,
      layers: desc.layers ?? 1,
      mask: desc.mask ?? ALL_LAYERS,
      userData: desc.userData,
      half,
      kinematicVelocity: [0, 0, 0],
      kinematicTarget: null,
    });
    handleOfIndex.set(index, handle);
    masses.set(handle, desc.mass ?? 1);
  }

  function addJointToWorld(desc: JointDesc): number {
    const a = record(desc.bodyA).index;
    const base = {
      bodyA: a,
      ...(desc.bodyB === undefined ? {} : { bodyB: record(desc.bodyB).index }),
      ...(desc.anchorA === undefined ? {} : { anchorA: desc.anchorA }),
      ...(desc.anchorB === undefined ? {} : { anchorB: desc.anchorB }),
      ...(desc.restLength === undefined ? {} : { restLength: desc.restLength }),
      ...(desc.stiffness === undefined ? {} : { stiffness: desc.stiffness }),
      ...(desc.damping === undefined ? {} : { damping: desc.damping }),
      ...(desc.axis === undefined ? {} : { axis: desc.axis }),
    };
    switch (desc.kind) {
      case "hinge":
        return world.hingeJoint(base);
      case "distance":
        return world.distanceJoint(base);
      case "spring":
        return world.springJoint(base);
      default:
        return world.fixedJoint(base);
    }
  }

  function bodyMatches(rec: BodyRecord, mask: number | undefined, exclude: BodyHandle | undefined, handle: BodyHandle): boolean {
    if (exclude === handle) return false;
    if (mask !== undefined && (rec.layers & mask) === 0) return false;
    return world.isAlive(rec.index);
  }

  world.onCollision((event) => {
    if (contactListener === null) return;
    const a = handleOfIndex.get(event.a);
    const b = handleOfIndex.get(event.b);
    if (a === undefined || b === undefined) return;
    contactEvent.a = a;
    contactEvent.b = b;
    contactEvent.normal[0] = event.nx;
    contactEvent.normal[1] = event.ny;
    contactEvent.normal[2] = event.nz;
    contactEvent.approachSpeed = event.approachSpeed;
    contactEvent.impulse = event.impulse;
    contactListener(contactEvent);
  });

  const backend: PhysicsBackend = {
    name: "physics-world",
    capabilities: CAPABILITIES,
    addBody(desc) {
      noteRotation(desc.rotation);
      noteShape(desc.shape);
      const handle = nextHandle;
      nextHandle += 1;
      insert(handle, desc, desc.asleep === true);
      return handle;
    },
    removeBody(handle) {
      const rec = records.get(handle);
      if (rec === undefined) return;
      for (const [jointHandle, joint] of joints) {
        if (joint.desc.bodyA === handle || joint.desc.bodyB === handle) {
          world.removeJoint(joint.id);
          joints.delete(jointHandle);
        }
      }
      world.removeBody(rec.index);
      handleOfIndex.delete(rec.index);
      records.delete(handle);
      masses.delete(handle);
    },
    hasBody: (handle) => records.has(handle),
    body(handle, out) {
      const rec = records.get(handle);
      if (rec === undefined) return null;
      const i = rec.index;
      const velocity: PhysicsVec3 =
        rec.kind === "kinematic" ? rec.kinematicVelocity : [world.velX[i]!, world.velY[i]!, world.velZ[i]!];
      const state: BodyState = out ?? {
        position: [0, 0, 0],
        rotation: IDENTITY_QUAT,
        velocity: [0, 0, 0],
        angularVelocity: [0, 0, 0],
        sleeping: false,
      };
      state.position = [world.posX[i]!, world.posY[i]!, world.posZ[i]!];
      state.rotation = IDENTITY_QUAT;
      state.velocity = velocity;
      state.angularVelocity = [0, 0, 0];
      state.sleeping = world.isSleeping(i);
      return state;
    },
    userDataOf: (handle) => records.get(handle)?.userData,
    setPosition(handle, position) {
      world.setPosition(record(handle).index, position[0], position[1], position[2]);
    },
    setRotation(_handle, rotation) {
      noteRotation(rotation);
    },
    setVelocity(handle, velocity) {
      world.setVelocity(record(handle).index, velocity[0], velocity[1], velocity[2]);
    },
    setAngularVelocity() {},
    applyImpulse(handle, impulse) {
      const rec = record(handle);
      if (rec.kind !== "dynamic") return;
      const i = rec.index;
      const invMass = world.invMass[i]!;
      world.setVelocity(
        i,
        world.velX[i]! + impulse[0] * invMass,
        world.velY[i]! + impulse[1] * invMass,
        world.velZ[i]! + impulse[2] * invMass,
      );
    },
    setKinematicTarget(handle, position) {
      const rec = record(handle);
      rec.kinematicTarget = [position[0], position[1], position[2]];
    },
    wake(handle) {
      world.wake(record(handle).index);
    },
    addJoint(desc) {
      const handle = nextJoint;
      nextJoint += 1;
      joints.set(handle, { id: addJointToWorld(desc), desc });
      return handle;
    },
    removeJoint(handle) {
      const joint = joints.get(handle);
      if (joint === undefined) return;
      world.removeJoint(joint.id);
      joints.delete(handle);
    },
    step(dt) {
      if (!(dt > 0)) return;
      for (const rec of records.values()) {
        if (rec.kind !== "kinematic") continue;
        const target = rec.kinematicTarget;
        const i = rec.index;
        if (target === null) {
          rec.kinematicVelocity[0] = 0;
          rec.kinematicVelocity[1] = 0;
          rec.kinematicVelocity[2] = 0;
          continue;
        }
        rec.kinematicVelocity[0] = (target[0] - world.posX[i]!) / dt;
        rec.kinematicVelocity[1] = (target[1] - world.posY[i]!) / dt;
        rec.kinematicVelocity[2] = (target[2] - world.posZ[i]!) / dt;
        world.setPosition(i, target[0], target[1], target[2]);
        rec.kinematicTarget = null;
      }
      world.step(dt);
    },
    raycast(desc) {
      const len = Math.hypot(desc.direction[0], desc.direction[1], desc.direction[2]);
      if (!(len > 0)) return null;
      const dx = desc.direction[0] / len;
      const dy = desc.direction[1] / len;
      const dz = desc.direction[2] / len;
      let best: RayHit | null = null;
      for (const [handle, rec] of records) {
        if (!bodyMatches(rec, desc.mask, desc.exclude, handle)) continue;
        const i = rec.index;
        const px = world.posX[i]!;
        const py = world.posY[i]!;
        const pz = world.posZ[i]!;
        let t: number;
        let normal: PhysicsVec3;
        if (rec.shape.kind === "sphere") {
          const r = rec.shape.radius;
          const ox = desc.origin[0] - px;
          const oy = desc.origin[1] - py;
          const oz = desc.origin[2] - pz;
          const b = ox * dx + oy * dy + oz * dz;
          const c = ox * ox + oy * oy + oz * oz - r * r;
          const disc = b * b - c;
          if (disc < 0) continue;
          t = -b - Math.sqrt(disc);
          if (t < 0) continue;
          const hx = ox + dx * t;
          const hy = oy + dy * t;
          const hz = oz + dz * t;
          normal = [hx / r, hy / r, hz / r];
        } else {
          const hit = slabRay(
            desc.origin[0],
            desc.origin[1],
            desc.origin[2],
            dx,
            dy,
            dz,
            px - rec.half[0],
            py - rec.half[1],
            pz - rec.half[2],
            px + rec.half[0],
            py + rec.half[1],
            pz + rec.half[2],
          );
          if (hit === null || hit.axis < 0) continue;
          t = hit.t;
          normal = [hit.axis === 0 ? hit.sign : 0, hit.axis === 1 ? hit.sign : 0, hit.axis === 2 ? hit.sign : 0];
        }
        if (t > desc.maxDistance) continue;
        if (best !== null && t >= best.distance) continue;
        best = {
          body: handle,
          distance: t,
          point: [desc.origin[0] + dx * t, desc.origin[1] + dy * t, desc.origin[2] + dz * t],
          normal,
        };
      }
      return best;
    },
    shapecast(desc) {
      noteRotation(desc.rotation);
      const castHalf = shapeHalfExtents(desc.shape);
      const [mx, my, mz] = desc.motion;
      const motionLen = Math.hypot(mx, my, mz);
      let best: ShapeCastHit | null = null;
      for (const [handle, rec] of records) {
        if (!bodyMatches(rec, desc.mask, desc.exclude, handle)) continue;
        const i = rec.index;
        const minX = world.posX[i]! - rec.half[0] - castHalf[0];
        const minY = world.posY[i]! - rec.half[1] - castHalf[1];
        const minZ = world.posZ[i]! - rec.half[2] - castHalf[2];
        const maxX = world.posX[i]! + rec.half[0] + castHalf[0];
        const maxY = world.posY[i]! + rec.half[1] + castHalf[1];
        const maxZ = world.posZ[i]! + rec.half[2] + castHalf[2];
        const [ox, oy, oz] = desc.position;
        const inside = ox > minX && ox < maxX && oy > minY && oy < maxY && oz > minZ && oz < maxZ;
        let toi: number;
        let normal: PhysicsVec3;
        if (inside) {
          const pens = [ox - minX, maxX - ox, oy - minY, maxY - oy, oz - minZ, maxZ - oz];
          let least = 0;
          for (let k = 1; k < 6; k += 1) if (pens[k]! < pens[least]!) least = k;
          toi = 0;
          normal = [
            least === 0 ? -1 : least === 1 ? 1 : 0,
            least === 2 ? -1 : least === 3 ? 1 : 0,
            least === 4 ? -1 : least === 5 ? 1 : 0,
          ];
        } else {
          if (!(motionLen > 0)) continue;
          const hit = slabRay(ox, oy, oz, mx, my, mz, minX, minY, minZ, maxX, maxY, maxZ);
          if (hit === null || hit.axis < 0 || hit.t > 1) continue;
          toi = hit.t;
          normal = [hit.axis === 0 ? hit.sign : 0, hit.axis === 1 ? hit.sign : 0, hit.axis === 2 ? hit.sign : 0];
        }
        if (best !== null && toi >= best.toi) continue;
        best = {
          body: handle,
          toi,
          distance: toi * motionLen,
          point: [ox + mx * toi - normal[0] * castHalf[0], oy + my * toi - normal[1] * castHalf[1], oz + mz * toi - normal[2] * castHalf[2]],
          normal,
        };
      }
      return best;
    },
    overlap(desc) {
      const half = shapeHalfExtents(desc.shape);
      const out: BodyHandle[] = [];
      for (const [handle, rec] of records) {
        if (!bodyMatches(rec, desc.mask, desc.exclude, handle)) continue;
        const i = rec.index;
        if (Math.abs(world.posX[i]! - desc.position[0]) >= rec.half[0] + half[0]) continue;
        if (Math.abs(world.posY[i]! - desc.position[1]) >= rec.half[1] + half[1]) continue;
        if (Math.abs(world.posZ[i]! - desc.position[2]) >= rec.half[2] + half[2]) continue;
        out.push(handle);
      }
      return out;
    },
    onContact(listener) {
      contactListener = listener;
    },
    retune() {
      // PhysicsWorld fixes its solver knobs at construction; retune is a no-op here and a real call on native backends.
    },
    snapshot(): PhysicsWorldBackendState {
      const bodies: SavedBody[] = [];
      for (const [handle, rec] of records) {
        const i = rec.index;
        bodies.push({
          handle,
          shape: rec.shape,
          kind: rec.kind,
          layers: rec.layers,
          mask: rec.mask,
          userData: rec.userData,
          mass: masses.get(handle) ?? 1,
          position: [world.posX[i]!, world.posY[i]!, world.posZ[i]!],
          velocity: [world.velX[i]!, world.velY[i]!, world.velZ[i]!],
          sleeping: world.isSleeping(i),
        });
      }
      return {
        nextHandle,
        nextJoint,
        bodies,
        joints: Array.from(joints, ([handle, joint]) => ({ handle, desc: joint.desc })),
      };
    },
    restore(state) {
      const saved = state as PhysicsWorldBackendState;
      world.clear();
      records.clear();
      handleOfIndex.clear();
      joints.clear();
      masses.clear();
      nextHandle = saved.nextHandle;
      nextJoint = saved.nextJoint;
      for (const body of saved.bodies) {
        insert(
          body.handle,
          {
            shape: body.shape,
            kind: body.kind,
            position: body.position,
            velocity: body.velocity,
            mass: body.mass,
            layers: body.layers,
            mask: body.mask,
            userData: body.userData,
          },
          body.sleeping,
        );
      }
      for (const joint of saved.joints) {
        joints.set(joint.handle, { id: addJointToWorld(joint.desc), desc: joint.desc });
      }
    },
    dispose() {
      world.onCollision(null);
      contactListener = null;
      world.clear();
      records.clear();
      handleOfIndex.clear();
      joints.clear();
      masses.clear();
    },
  };
  return backend;
}
