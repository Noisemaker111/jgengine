import type * as RAPIER from "@dimforge/rapier3d-compat";
import { shapeHalfExtents } from "@jgengine/core/physics/physicsBackend";
import type {
  BodyDesc, BodyHandle, BodyShape, BodyState, CharacterMotion, CharacterMotionDesc, ContactEvent, JointDesc,
  JointHandle, OverlapDesc, PhysicsBackend, PhysicsBackendConfig, PhysicsQuat, PhysicsVec3, PhysicsVec3Out,
  RayCastVehicle, RayCastVehicleDesc, RayCastWheelDesc, RayDesc, RayHit, ShapeCastDesc, ShapeCastHit,
} from "@jgengine/core/physics/physicsBackend";

/** Construction options for the Rapier-backed {@link PhysicsBackend}. */
export interface RapierBackendOptions extends PhysicsBackendConfig { warn?: boolean }

type Rapier = typeof RAPIER;
type Vec = RAPIER.Vector;

interface BodyRecord {
  readonly handle: BodyHandle;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly userData: unknown;
  joints: Set<JointHandle> | null;
}

interface JointRecord {
  readonly joint: RAPIER.ImpulseJoint;
  readonly a: BodyHandle;
  readonly b: BodyHandle | null;
}

/** A Rapier backend's serializable state: the world bytes plus the engine-handle tables over Rapier's own handles. */
export interface RapierSnapshot {
  bytes: Uint8Array;
  bodies: { h: BodyHandle; body: number; collider: number; userData: unknown }[];
  joints: { h: JointHandle; joint: number; a: BodyHandle; b: BodyHandle | null }[];
  anchor: number | null;
  next: number;
  nextJoint: number;
}

/** A native controller that holds Rapier objects tied to one world, rebuilt when `restore` swaps the world. */
interface WorldBound { rebind(): void; free(): void }

const ALL = 0xffffffff;
const DEG = Math.PI / 180;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
/** Rapier handles are f64 bit patterns of an arena index; tiny denormals are valid, so only finiteness is checked. */
function isHandle(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}
function inverseMassOf(body: RAPIER.RigidBody): number {
  const mass = body.isDynamic() ? body.mass() : 0;
  return mass > 0 ? 1 / mass : 0;
}
function readSnapshot(value: unknown): RapierSnapshot {
  if (!isObject(value) || !(value["bytes"] instanceof Uint8Array)) throw Error("physics: invalid Rapier snapshot");
  const bodies: RapierSnapshot["bodies"] = [];
  const joints: RapierSnapshot["joints"] = [];
  const rawBodies = value["bodies"];
  const rawJoints = value["joints"];
  if (!Array.isArray(rawBodies) || !Array.isArray(rawJoints)) throw Error("physics: invalid Rapier snapshot");
  for (const entry of rawBodies) {
    if (!isObject(entry) || !isNumber(entry["h"]) || !isHandle(entry["body"]) || !isHandle(entry["collider"])) throw Error("physics: invalid Rapier snapshot body");
    bodies.push({ h: entry["h"], body: entry["body"], collider: entry["collider"], userData: entry["userData"] });
  }
  for (const entry of rawJoints) {
    const b = isObject(entry) ? entry["b"] : undefined;
    if (!isObject(entry) || !isNumber(entry["h"]) || !isHandle(entry["joint"]) || !isNumber(entry["a"]) || !(b === null || isNumber(b))) throw Error("physics: invalid Rapier snapshot joint");
    joints.push({ h: entry["h"], joint: entry["joint"], a: entry["a"], b });
  }
  const anchor = value["anchor"];
  const next = value["next"];
  const nextJoint = value["nextJoint"];
  return {
    bytes: value["bytes"],
    bodies,
    joints,
    anchor: isHandle(anchor) ? anchor : null,
    next: isNumber(next) ? next : Math.max(0, ...bodies.map((b) => b.h)) + 1,
    nextJoint: isNumber(nextJoint) ? nextJoint : Math.max(0, ...joints.map((j) => j.h)) + 1,
  };
}

/**
 * Create a Rapier-backed {@link PhysicsBackend}; initialization loads Rapier's WASM module asynchronously.
 * Bodies, colliders and joints are kept in handle maps, so a contact or a query hit resolves its body in O(1).
 *
 * @capability rapier-physics-backend native capsules, shapecasts, rotation, CCD, joints, collision queries, character and ray-cast vehicle controllers
 */
export async function createRapierBackend(options: RapierBackendOptions = {}): Promise<PhysicsBackend> {
  const R: Rapier = await import("@dimforge/rapier3d-compat");
  await R.init();
  const gravity = options.gravity ?? [0, -9.81, 0];
  let world = new R.World({ x: gravity[0], y: gravity[1], z: gravity[2] });
  const events = new R.EventQueue(false);
  const bodies = new Map<BodyHandle, BodyRecord>();
  const bodyOfCollider = new Map<number, BodyHandle>();
  const joints = new Map<JointHandle, JointRecord>();
  const bound = new Set<WorldBound>();
  let anchor: RAPIER.RigidBody | null = null;
  let next = 1;
  let nextJoint = 1;
  let hasStepped = false;
  let listener: ((event: ContactEvent) => void) | null = null;
  const forced = new Set<BodyHandle>();
  // `step(dt)` is accumulated into equal fixed slices, as the backend contract promises; the
  // default matches PhysicsWorld so the two backends simulate the same real time per frame.
  let fixedDt = options.fixedDt ?? 1 / 60;
  let maxSubsteps = Math.max(1, options.maxSubsteps ?? 4);
  let accumulator = 0;
  world.timestep = fixedDt;

  // Rapier copies every vector it is handed, so one scratch of each role serves every call.
  const va: Vec = { x: 0, y: 0, z: 0 };
  const vb: Vec = { x: 0, y: 0, z: 0 };
  const rot: RAPIER.Rotation = { x: 0, y: 0, z: 0, w: 1 };
  const ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  const surfaceRay = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  const contact: ContactEvent = { a: 0, b: 0, normal: [0, 1, 0], approachSpeed: 0, impulse: 0 };
  const shapeCache = new WeakMap<BodyShape, RAPIER.Shape>();

  const vec3 = (out: Vec, p: PhysicsVec3): Vec => { out.x = p[0]; out.y = p[1]; out.z = p[2]; return out; };
  const quat = (r: PhysicsQuat | undefined): RAPIER.Rotation => {
    rot.x = r?.[0] ?? 0; rot.y = r?.[1] ?? 0; rot.z = r?.[2] ?? 0; rot.w = r?.[3] ?? 1;
    return rot;
  };
  const write = (out: PhysicsVec3Out, v: Vec): PhysicsVec3Out => { out[0] = v.x; out[1] = v.y; out[2] = v.z; return out; };
  const groups = (layers: number, mask: number): number => (mask << 16) | (layers & 0xffff);
  const queryGroups = (mask: number | undefined): number => ((mask ?? ALL) << 16) | 0xffff;

  const colliderDesc = (s: BodyShape): RAPIER.ColliderDesc => {
    switch (s.kind) {
      case "box": return R.ColliderDesc.cuboid(s.halfExtents[0], s.halfExtents[1], s.halfExtents[2]);
      case "sphere": return R.ColliderDesc.ball(s.radius);
      case "capsule": return R.ColliderDesc.capsule(s.halfHeight, s.radius);
      case "convex": {
        const points = new Float32Array(s.points.length * 3);
        s.points.forEach((p, i) => { points[i * 3] = p[0]; points[i * 3 + 1] = p[1]; points[i * 3 + 2] = p[2]; });
        return R.ColliderDesc.convexHull(points) ?? R.ColliderDesc.ball(0.01);
      }
      case "trimesh": return R.ColliderDesc.trimesh(Float32Array.from(s.vertices), Uint32Array.from(s.indices));
      case "heightfield": return R.ColliderDesc.heightfield(s.rows, s.columns, Float32Array.from(s.heights), { x: s.scale[0], y: s.scale[1], z: s.scale[2] });
    }
  };
  /** Query shapes are rebuilt only when a caller hands a new shape object; a controller reusing its shape builds none. */
  const queryShape = (s: BodyShape): RAPIER.Shape => {
    const cached = shapeCache.get(s);
    if (cached !== undefined) return cached;
    const built = colliderDesc(s).shape;
    shapeCache.set(s, built);
    return built;
  };
  const record = (h: BodyHandle): BodyRecord => {
    const r = bodies.get(h);
    if (r === undefined) throw Error(`physics: unknown body handle ${h}`);
    return r;
  };
  const excludeCollider = (h: BodyHandle | undefined): RAPIER.Collider | undefined => (h === undefined ? undefined : bodies.get(h)?.collider);
  const updateQueryPipeline = (): void => {
    if (hasStepped) return;
    world.timestep = 0;
    world.step();
    world.timestep = fixedDt;
  };
  const worldAnchor = (): RAPIER.RigidBody => {
    anchor ??= world.createRigidBody(R.RigidBodyDesc.fixed());
    return anchor;
  };
  const dropJoint = (h: JointHandle): void => {
    const j = joints.get(h);
    if (j === undefined) return;
    world.removeImpulseJoint(j.joint, true);
    joints.delete(h);
    bodies.get(j.a)?.joints?.delete(h);
    if (j.b !== null) bodies.get(j.b)?.joints?.delete(h);
  };

  let manifoldSeen = false;
  const readManifold = (manifold: RAPIER.TempContactManifold, flipped: boolean): void => {
    if (manifoldSeen) return;
    manifoldSeen = true;
    const n = manifold.normal();
    const sign = flipped ? -1 : 1;
    contact.normal[0] = n.x * sign; contact.normal[1] = n.y * sign; contact.normal[2] = n.z * sign;
    let impulse = 0;
    for (let i = 0, count = manifold.numContacts(); i < count; i += 1) impulse += manifold.contactImpulse(i);
    contact.impulse = impulse;
  };
  const onCollision = (rawA: number, rawB: number, started: boolean): void => {
    if (listener === null || !started) return;
    const ha = bodyOfCollider.get(rawA);
    const hb = bodyOfCollider.get(rawB);
    if (ha === undefined || hb === undefined) return;
    const ra = bodies.get(ha);
    const rb = bodies.get(hb);
    if (ra === undefined || rb === undefined) return;
    contact.a = ha; contact.b = hb;
    contact.normal[0] = 0; contact.normal[1] = 1; contact.normal[2] = 0;
    contact.impulse = 0;
    manifoldSeen = false;
    world.contactPair(ra.collider, rb.collider, readManifold);
    // Velocities are already resolved when events drain, so the closing speed comes from the impulse that stopped it.
    const inverseMass = inverseMassOf(ra.body) + inverseMassOf(rb.body);
    const bounce = 1 + (ra.collider.restitution() + rb.collider.restitution()) / 2;
    contact.approachSpeed = (contact.impulse * inverseMass) / bounce;
    listener(contact);
  };

  const createCharacterMotion = (initial: CharacterMotionDesc): CharacterMotion => {
    let desc = { ...initial };
    let kcc: RAPIER.KinematicCharacterController;
    // The mover's own collider sits in no layer, so no other query or body ever sees it.
    let collider = world.createCollider(colliderDesc(desc.shape).setCollisionGroups(0));
    let excluded: BodyHandle | undefined;
    const collision = new R.CharacterCollision();
    const notExcluded = (c: RAPIER.Collider): boolean => excluded === undefined || bodyOfCollider.get(c.handle) !== excluded;
    const configure = (): void => {
      kcc.setUp({ x: 0, y: 1, z: 0 });
      kcc.setSlideEnabled(true);
      kcc.setApplyImpulsesToDynamicBodies(false);
      kcc.setMaxSlopeClimbAngle(desc.maxSlopeDeg * DEG);
      kcc.setMinSlopeSlideAngle(desc.maxSlopeDeg * DEG);
      // Rapier only steps onto a ledge at least this wide; half the character's width clears real stairs.
      if (desc.stepHeight > 0) kcc.enableAutostep(desc.stepHeight, Math.max(desc.skinWidth, shapeHalfExtents(desc.shape)[0] * 0.5), false);
      else kcc.disableAutostep();
      if (desc.snapDistance > 0) kcc.enableSnapToGround(desc.snapDistance);
      else kcc.disableSnapToGround();
    };
    const build = (): void => {
      kcc = world.createCharacterController(desc.skinWidth);
      configure();
    };
    build();
    const link: WorldBound = {
      rebind() { collider = world.getCollider(collider.handle); build(); },
      free() { world.removeCharacterController(kcc); },
    };
    bound.add(link);
    return {
      move(center, desired, out, exclude) {
        updateQueryPipeline();
        excluded = exclude;
        collider.setTranslation(vec3(va, center));
        kcc.computeColliderMovement(collider, vec3(vb, desired), undefined, queryGroups(desc.mask), notExcluded);
        write(out.moved, kcc.computedMovement());
        out.grounded = kcc.computedGrounded();
        out.hitWall = false;
        out.hitCeiling = false;
        out.groundBody = null;
        out.groundNormal[0] = 0; out.groundNormal[1] = 1; out.groundNormal[2] = 0;
        const walkableY = Math.cos(desc.maxSlopeDeg * DEG);
        let bestY = -Infinity;
        for (let i = 0, count = kcc.numComputedCollisions(); i < count; i += 1) {
          if (kcc.computedCollision(i, collision) === null) continue;
          const n = collision.normal1;
          if (n.y >= walkableY) {
            if (n.y > bestY) {
              bestY = n.y;
              write(out.groundNormal, n);
              out.groundBody = collision.collider === null ? null : bodyOfCollider.get(collision.collider.handle) ?? null;
            }
          } else if (n.y < -0.5 && desired[1] > 0) out.hitCeiling = true;
          else out.hitWall = true;
        }
        excluded = undefined;
        return out;
      },
      retune(change) {
        const shapeChanged = change.shape !== undefined && change.shape !== desc.shape;
        const offsetChanged = change.skinWidth !== undefined && change.skinWidth !== desc.skinWidth;
        desc = { ...desc, ...change };
        if (shapeChanged) collider.setShape(colliderDesc(desc.shape).shape);
        if (offsetChanged) kcc.setOffset(desc.skinWidth);
        configure();
      },
      dispose() {
        if (!bound.delete(link)) return;
        link.free();
        world.removeCollider(collider, false);
      },
    };
  };

  const createRayCastVehicle = (spec: RayCastVehicleDesc): RayCastVehicle => {
    const wheels = spec.wheels.map((w) => ({ ...w }));
    const inputs = wheels.map(() => ({ engine: 0, brake: 0, steering: 0 }));
    let controller: RAPIER.DynamicRayCastVehicleController;
    const configureWheel = (i: number): void => {
      const w = wheels[i];
      if (w === undefined) return;
      controller.setWheelChassisConnectionPointCs(i, { x: w.connection[0], y: w.connection[1], z: w.connection[2] });
      controller.setWheelRadius(i, w.radius);
      controller.setWheelSuspensionRestLength(i, w.restLength);
      const d = w.direction ?? [0, -1, 0];
      const a = w.axle ?? [-1, 0, 0];
      controller.setWheelDirectionCs(i, { x: d[0], y: d[1], z: d[2] });
      controller.setWheelAxleCs(i, { x: a[0], y: a[1], z: a[2] });
      if (w.maxTravel !== undefined) controller.setWheelMaxSuspensionTravel(i, w.maxTravel);
      if (w.stiffness !== undefined) controller.setWheelSuspensionStiffness(i, w.stiffness);
      if (w.compression !== undefined) controller.setWheelSuspensionCompression(i, w.compression);
      if (w.relaxation !== undefined) controller.setWheelSuspensionRelaxation(i, w.relaxation);
      if (w.maxForce !== undefined) controller.setWheelMaxSuspensionForce(i, w.maxForce);
      if (w.frictionSlip !== undefined) controller.setWheelFrictionSlip(i, w.frictionSlip);
      if (w.sideFrictionStiffness !== undefined) controller.setWheelSideFrictionStiffness(i, w.sideFrictionStiffness);
    };
    const build = (): void => {
      controller = world.createVehicleController(record(spec.chassis).body);
      controller.indexUpAxis = 1;
      controller.setIndexForwardAxis = 2;
      wheels.forEach((w, i) => {
        controller.addWheel({ x: w.connection[0], y: w.connection[1], z: w.connection[2] }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, w.restLength, w.radius);
        configureWheel(i);
      });
    };
    build();
    const link: WorldBound = {
      rebind: build,
      free() { world.removeVehicleController(controller); },
    };
    bound.add(link);
    return {
      wheelCount: wheels.length,
      setWheelInput(i, engine, brake, steering) {
        const input = inputs[i];
        if (input === undefined) throw RangeError(`physics: vehicle has no wheel ${i}`);
        input.engine = engine; input.brake = brake; input.steering = steering;
      },
      retuneWheel(i, change: Partial<RayCastWheelDesc>) {
        const w = wheels[i];
        if (w === undefined) throw RangeError(`physics: vehicle has no wheel ${i}`);
        wheels[i] = { ...w, ...change };
        configureWheel(i);
      },
      update(dt) {
        if (!(dt > 0)) return;
        updateQueryPipeline();
        inputs.forEach((input, i) => {
          controller.setWheelEngineForce(i, input.engine);
          controller.setWheelBrake(i, input.brake);
          controller.setWheelSteering(i, input.steering);
        });
        controller.updateVehicle(dt, undefined, queryGroups(spec.mask));
      },
      wheel(i, out) {
        out.inContact = controller.wheelIsInContact(i);
        out.suspensionLength = controller.wheelSuspensionLength(i) ?? 0;
        out.suspensionForce = controller.wheelSuspensionForce(i) ?? 0;
        out.rotation = controller.wheelRotation(i) ?? 0;
        const point = controller.wheelContactPoint(i);
        const normal = controller.wheelContactNormal(i);
        if (point !== null) write(out.contactPoint, point);
        if (normal !== null) write(out.contactNormal, normal);
        const ground = out.inContact ? controller.wheelGroundObject(i) : null;
        out.ground = ground === null ? null : bodyOfCollider.get(ground.handle) ?? null;
        return out;
      },
      speed: () => controller.currentVehicleSpeed(),
      dispose() {
        if (bound.delete(link)) link.free();
      },
    };
  };

  const backend: PhysicsBackend = {
    name: "rapier",
    capabilities: { rotation: true, ccd: true, shapes: ["box", "sphere", "capsule", "convex", "trimesh", "heightfield"], joints: ["fixed", "hinge", "ball", "distance", "spring"] },
    addBody(d: BodyDesc) {
      const h = next++;
      const bd = d.kind === "static" ? R.RigidBodyDesc.fixed() : d.kind === "kinematic" ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.dynamic();
      const v = d.velocity ?? [0, 0, 0];
      bd.setTranslation(d.position[0], d.position[1], d.position[2]).setRotation(quat(d.rotation)).setLinvel(v[0], v[1], v[2]).setAngvel(vec3(va, d.angularVelocity ?? [0, 0, 0]));
      if (d.mass !== undefined) bd.setAdditionalMass(d.mass);
      if (d.ccd) bd.setCcdEnabled(true);
      if (d.linearDamping !== undefined) bd.setLinearDamping(d.linearDamping);
      if (d.angularDamping !== undefined) bd.setAngularDamping(d.angularDamping);
      const body = world.createRigidBody(bd);
      const cd = colliderDesc(d.shape).setFriction(d.friction ?? 0.5).setRestitution(d.restitution ?? 0).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
      // `mass` is the body's total mass: without zero density, Rapier adds the collider's volume mass on top.
      if (d.mass !== undefined) cd.setDensity(0);
      cd.setCollisionGroups(groups(d.layers ?? 1, d.mask ?? ALL));
      const collider = world.createCollider(cd, body);
      if (d.asleep) body.sleep();
      bodies.set(h, { handle: h, body, collider, userData: d.userData, joints: null });
      bodyOfCollider.set(collider.handle, h);
      return h;
    },
    removeBody(h) {
      const r = bodies.get(h);
      if (r === undefined) return;
      if (r.joints !== null) for (const j of [...r.joints]) dropJoint(j);
      bodyOfCollider.delete(r.collider.handle);
      world.removeRigidBody(r.body);
      bodies.delete(h);
      forced.delete(h);
    },
    hasBody: (h) => bodies.has(h),
    body(h, out) {
      const r = bodies.get(h);
      if (r === undefined) return null;
      const s: BodyState = out ?? { position: [0, 0, 0], rotation: [0, 0, 0, 1], velocity: [0, 0, 0], angularVelocity: [0, 0, 0], sleeping: false };
      write(s.position, r.body.translation());
      const q = r.body.rotation();
      s.rotation[0] = q.x; s.rotation[1] = q.y; s.rotation[2] = q.z; s.rotation[3] = q.w;
      write(s.velocity, r.body.linvel());
      write(s.angularVelocity, r.body.angvel());
      s.sleeping = r.body.isSleeping();
      return s;
    },
    userDataOf: (h) => bodies.get(h)?.userData,
    setPosition(h, p) { record(h).body.setTranslation(vec3(va, p), true); },
    setRotation(h, r) { record(h).body.setRotation(quat(r), true); },
    setVelocity(h, p) { record(h).body.setLinvel(vec3(va, p), true); },
    setAngularVelocity(h, p) { record(h).body.setAngvel(vec3(va, p), true); },
    applyForce(h, f, p) {
      const b = record(h).body;
      if (p) b.addForceAtPoint(vec3(va, f), vec3(vb, p), true);
      else b.addForce(vec3(va, f), true);
      forced.add(h);
    },
    applyTorque(h, t) { record(h).body.addTorque(vec3(va, t), true); forced.add(h); },
    applyImpulse(h, i, p) { const b = record(h).body; b.applyImpulseAtPoint(vec3(va, i), p ? vec3(vb, p) : b.translation(), true); },
    setKinematicTarget(h, p, r) { const b = record(h).body; b.setNextKinematicTranslation(vec3(va, p)); if (r) b.setNextKinematicRotation(quat(r)); },
    wake(h) { record(h).body.wakeUp(); },
    addJoint(d: JointDesc) {
      const aa = d.anchorA ?? [0, 0, 0], ab = d.anchorB ?? [0, 0, 0], ar = d.axis ?? [0, 1, 0], len = Math.hypot(ar[0], ar[1], ar[2]);
      if (d.kind === "hinge" && !(len > 1e-9)) throw Error("physics: hinge joint axis must be non-zero");
      const a = { x: aa[0], y: aa[1], z: aa[2] }, b = { x: ab[0], y: ab[1], z: ab[2] }, identity = { x: 0, y: 0, z: 0, w: 1 };
      const A = record(d.bodyA), B = d.bodyB === undefined ? null : record(d.bodyB);
      let data: RAPIER.JointData;
      switch (d.kind) {
        case "fixed": data = R.JointData.fixed(a, identity, b, identity); break;
        case "hinge": data = R.JointData.revolute(a, b, { x: ar[0] / len, y: ar[1] / len, z: ar[2] / len }); break;
        case "ball": data = R.JointData.spherical(a, b); break;
        case "distance": data = R.JointData.rope(d.restLength ?? 0, a, b); break;
        case "spring": data = R.JointData.spring(d.restLength ?? 0, d.stiffness ?? 40, d.damping ?? 6, a, b); break;
      }
      const joint = world.createImpulseJoint(data, A.body, B?.body ?? worldAnchor(), true);
      if (d.kind === "hinge" && d.limits && joint instanceof R.RevoluteImpulseJoint) joint.setLimits(d.limits[0], d.limits[1]);
      const h = nextJoint++;
      joints.set(h, { joint, a: d.bodyA, b: d.bodyB ?? null });
      (A.joints ??= new Set()).add(h);
      if (B !== null) (B.joints ??= new Set()).add(h);
      return h;
    },
    removeJoint: dropJoint,
    step(dt) {
      if (!(dt > 0)) return;
      accumulator = Math.min(accumulator + dt, fixedDt * maxSubsteps);
      while (accumulator >= fixedDt) {
        world.step(events);
        hasStepped = true;
        events.drainCollisionEvents(onCollision);
        accumulator -= fixedDt;
      }
      // Rapier keeps added forces until reset; the backend contract is one step per applyForce call.
      for (const h of forced) { const b = bodies.get(h)?.body; if (b) { b.resetForces(false); b.resetTorques(false); } }
      forced.clear();
    },
    raycast(d: RayDesc, out?: RayHit) {
      const n = Math.hypot(d.direction[0], d.direction[1], d.direction[2]);
      if (!n) return null;
      updateQueryPipeline();
      ray.origin.x = d.origin[0]; ray.origin.y = d.origin[1]; ray.origin.z = d.origin[2];
      ray.dir.x = d.direction[0] / n; ray.dir.y = d.direction[1] / n; ray.dir.z = d.direction[2] / n;
      const hit = world.castRayAndGetNormal(ray, d.maxDistance, true, undefined, queryGroups(d.mask), excludeCollider(d.exclude));
      if (hit === null) return null;
      const body = bodyOfCollider.get(hit.collider.handle);
      if (body === undefined || body === d.exclude) return null;
      const result: RayHit = out ?? { body: 0, distance: 0, point: [0, 0, 0], normal: [0, 0, 0] };
      const t = hit.timeOfImpact;
      result.body = body;
      result.distance = t;
      result.point[0] = ray.origin.x + ray.dir.x * t; result.point[1] = ray.origin.y + ray.dir.y * t; result.point[2] = ray.origin.z + ray.dir.z * t;
      write(result.normal, hit.normal);
      return result;
    },
    shapecast(d: ShapeCastDesc, out?: ShapeCastHit) {
      updateQueryPipeline();
      const hit = world.castShape(vec3(va, d.position), quat(d.rotation), vec3(vb, d.motion), queryShape(d.shape), 0, 1, true, undefined, queryGroups(d.mask), excludeCollider(d.exclude));
      if (hit === null) return null;
      const n1 = hit.normal1;
      if (hit.time_of_impact <= 0 && (n1.x * d.motion[0] + n1.y * d.motion[1] + n1.z * d.motion[2]) > 0) return null;
      const body = bodyOfCollider.get(hit.collider.handle);
      if (body === undefined || body === d.exclude) return null;
      const result: ShapeCastHit = out ?? { body: 0, toi: 0, distance: 0, point: [0, 0, 0], normal: [0, 0, 0] };
      // Capsule edge contacts mix adjacent faces; query the collider surface instead.
      const verticalDrop = d.motion[1] < 0 && d.motion[0] === 0 && d.motion[2] === 0;
      const dx = verticalDrop ? 0 : -n1.x, dy = verticalDrop ? -1 : -n1.y, dz = verticalDrop ? 0 : -n1.z;
      const w = hit.witness1;
      surfaceRay.origin.x = w.x - dx * 0.01; surfaceRay.origin.y = w.y - dy * 0.01; surfaceRay.origin.z = w.z - dz * 0.01;
      surfaceRay.dir.x = dx; surfaceRay.dir.y = dy; surfaceRay.dir.z = dz;
      const surface = hit.collider.castRayAndGetNormal(surfaceRay, 0.02, true);
      result.body = body;
      result.toi = hit.time_of_impact;
      result.distance = hit.time_of_impact * Math.hypot(d.motion[0], d.motion[1], d.motion[2]);
      write(result.point, w);
      write(result.normal, surface?.normal ?? n1);
      return result;
    },
    overlap(d: OverlapDesc, into?: BodyHandle[]) {
      const out = into ?? [];
      out.length = 0;
      updateQueryPipeline();
      world.intersectionsWithShape(vec3(va, d.position), quat(d.rotation), queryShape(d.shape), (c) => {
        const h = bodyOfCollider.get(c.handle);
        if (h !== undefined && h !== d.exclude) out.push(h);
        return true;
      }, undefined, queryGroups(d.mask));
      return out;
    },
    onContact(l) { listener = l; },
    retune(c) {
      if (c.gravity) world.gravity = { x: c.gravity[0], y: c.gravity[1], z: c.gravity[2] };
      if (c.fixedDt !== undefined && c.fixedDt > 0) { fixedDt = c.fixedDt; world.timestep = fixedDt; }
      if (c.maxSubsteps !== undefined) maxSubsteps = Math.max(1, c.maxSubsteps);
    },
    snapshot(): RapierSnapshot {
      return {
        bytes: world.takeSnapshot(),
        bodies: [...bodies.values()].map((r) => ({ h: r.handle, body: r.body.handle, collider: r.collider.handle, userData: r.userData })),
        joints: [...joints].map(([h, j]) => ({ h, joint: j.joint.handle, a: j.a, b: j.b })),
        anchor: anchor?.handle ?? null,
        next,
        nextJoint,
      };
    },
    restore(state) {
      const s = readSnapshot(state);
      for (const link of bound) link.free();
      world.free();
      world = R.World.restoreSnapshot(s.bytes);
      world.timestep = fixedDt;
      bodies.clear(); bodyOfCollider.clear(); joints.clear(); forced.clear();
      for (const x of s.bodies) {
        const body = world.getRigidBody(x.body);
        const collider = world.getCollider(x.collider);
        if (!body || !collider) throw Error(`physics: snapshot body ${x.h} is missing`);
        bodies.set(x.h, { handle: x.h, body, collider, userData: x.userData, joints: null });
        bodyOfCollider.set(collider.handle, x.h);
      }
      for (const x of s.joints) {
        const joint = world.getImpulseJoint(x.joint);
        if (!joint) continue;
        joints.set(x.h, { joint, a: x.a, b: x.b });
        const A = bodies.get(x.a);
        if (A) (A.joints ??= new Set()).add(x.h);
        const B = x.b === null ? undefined : bodies.get(x.b);
        if (B) (B.joints ??= new Set()).add(x.h);
      }
      anchor = s.anchor === null ? null : world.getRigidBody(s.anchor) ?? null;
      next = s.next;
      nextJoint = s.nextJoint;
      for (const link of bound) link.rebind();
    },
    dispose() {
      for (const link of bound) link.free();
      bound.clear();
      forced.clear(); events.free(); world.free(); bodies.clear(); bodyOfCollider.clear(); joints.clear(); listener = null; anchor = null;
    },
    createCharacterMotion,
    createRayCastVehicle,
  };
  return backend;
}
