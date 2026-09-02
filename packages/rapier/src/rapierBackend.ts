import type {
  BodyShape, BodyState, ContactEvent, OverlapDesc, PhysicsBackend,
  PhysicsBackendConfig, PhysicsQuat, PhysicsVec3, RayDesc, ShapeCastDesc,
} from "@jgengine/core/physics/physicsBackend";

/** Construction options for the Rapier-backed {@link PhysicsBackend}. */
export interface RapierBackendOptions extends PhysicsBackendConfig { warn?: boolean }

const q = (r: PhysicsQuat | undefined) => ({ x: r?.[0] ?? 0, y: r?.[1] ?? 0, z: r?.[2] ?? 0, w: r?.[3] ?? 1 });
const vec = (x: any): PhysicsVec3 => Object.assign([x.x, x.y, x.z], { x: x.x, y: x.y, z: x.z }) as unknown as PhysicsVec3;
const ALL = 0xffffffff;
const eventHandle = (value: number): number => {
  if (Number.isInteger(value)) return value;
  const bits = new ArrayBuffer(8);
  new DataView(bits).setFloat64(0, value, true);
  const decoded = Number(new DataView(bits).getBigUint64(0, true));
  return Number.isSafeInteger(decoded) ? decoded : value;
};

/** Create a Rapier-backed {@link PhysicsBackend}; initialization loads Rapier's WASM module asynchronously.
 *
 * @capability rapier-physics-backend native capsules, shapecasts, rotation, CCD, joints, and collision queries
 */
export async function createRapierBackend(options: RapierBackendOptions = {}): Promise<PhysicsBackend> {
  const R: any = await import("@dimforge/rapier3d-compat");
  await R.init();
  let world = new R.World({ x: options.gravity?.[0] ?? 0, y: options.gravity?.[1] ?? -9.81, z: options.gravity?.[2] ?? 0 });
  const events = new R.EventQueue(false);
  const bodies = new Map<number, any>();
  const colliders = new Map<number, any>();
  const joints = new Map<number, any>();
  let next = 1;
  let nextJoint = 1;
  let hasStepped = false;
  let listener: ((event: ContactEvent) => void) | null = null;

  const shape = (s: BodyShape): any => {
    switch (s.kind) {
      case "box": return R.ColliderDesc.cuboid(...s.halfExtents);
      case "sphere": return R.ColliderDesc.ball(s.radius);
      case "capsule": return R.ColliderDesc.capsule(s.halfHeight, s.radius);
      case "convex": return R.ColliderDesc.convexHull(s.points.flatMap((p) => p)) ?? R.ColliderDesc.ball(0.01);
      case "trimesh": return R.ColliderDesc.trimesh(Array.from(s.vertices), Array.from(s.indices));
      case "heightfield": return R.ColliderDesc.heightfield(s.rows, s.columns, Array.from(s.heights), s.scale);
    }
  };
  const get = (h: number) => {
    const b = bodies.get(h);
    if (!b) throw Error(`physics: unknown body handle ${h}`);
    return b;
  };
  const find = (map: Map<number, any>, native: any) => {
    if (typeof native === "function") native = native();
    if (native && typeof native === "object") native = native.handle;
    native = eventHandle(native);
    return [...map].find(([, value]) => {
      const handle = typeof value.handle === "function" ? value.handle() : value.handle;
      return eventHandle(handle) === native;
    })?.[0];
  };
  const updateQueryPipeline = () => {
    if (hasStepped) return;
    const timestep = world.timestep;
    world.timestep = 0;
    world.step();
    world.timestep = timestep;
  };
  const queryGroups = (mask: number | undefined) => ((mask ?? ALL) << 16) | 0xffff;

  const backend: PhysicsBackend = {
    name: "rapier",
    capabilities: { rotation: true, ccd: true, shapes: ["box", "sphere", "capsule", "convex", "trimesh", "heightfield"], joints: ["fixed", "hinge", "ball", "distance", "spring"] },
    addBody(d) {
      const h = next++;
      const bd = d.kind === "static" ? R.RigidBodyDesc.fixed() : d.kind === "kinematic" ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.dynamic();
      bd.setTranslation(...d.position).setRotation(q(d.rotation)).setLinvel(...(d.velocity ?? [0, 0, 0])).setAngvel(vec({ x: (d.angularVelocity ?? [0, 0, 0])[0], y: (d.angularVelocity ?? [0, 0, 0])[1], z: (d.angularVelocity ?? [0, 0, 0])[2] }));
      if (d.mass !== undefined) bd.setAdditionalMass(d.mass);
      if (d.ccd) bd.setCcdEnabled(true);
      const b = world.createRigidBody(bd);
      const c = world.createCollider(shape(d.shape).setFriction(d.friction ?? 0.5).setRestitution(d.restitution ?? 0).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS), b);
      c.setCollisionGroups(((d.mask ?? ALL) << 16) | (d.layers ?? 1));
      b.__jg = { d, h };
      if (d.asleep) b.sleep();
      bodies.set(h, b); colliders.set(h, c);
      return h;
    },
    removeBody(h) {
      const b = bodies.get(h);
      if (!b) return;
      for (const [id, j] of joints) if (j.a === h || j.b === h) { world.removeImpulseJoint(j.joint, true); joints.delete(id); }
      world.removeRigidBody(b); bodies.delete(h); colliders.delete(h);
    },
    hasBody: (h) => bodies.has(h),
    body(h, out) {
      const b = bodies.get(h); if (!b) return null;
      const p = b.translation(), r = b.rotation(), v = b.linvel(), a = b.angvel(), s: any = out ?? {};
      s.position = vec(p); s.rotation = [r.x, r.y, r.z, r.w]; s.velocity = vec(v); s.angularVelocity = vec(a); s.sleeping = b.isSleeping();
      return s as BodyState;
    },
    userDataOf: (h) => bodies.get(h)?.__jg.d.userData,
    setPosition(h, p) { get(h).setTranslation({ x: p[0], y: p[1], z: p[2] }, true); },
    setRotation(h, r) { get(h).setRotation(q(r), true); },
    setVelocity(h, p) { get(h).setLinvel({ x: p[0], y: p[1], z: p[2] }, true); },
    setAngularVelocity(h, p) { get(h).setAngvel({ x: p[0], y: p[1], z: p[2] }, true); },
    applyImpulse(h, i, p) { const b = get(h); b.applyImpulseAtPoint({ x: i[0], y: i[1], z: i[2] }, p ? { x: p[0], y: p[1], z: p[2] } : b.translation(), true); },
    setKinematicTarget(h, p, r) { const b = get(h); b.setNextKinematicTranslation({ x: p[0], y: p[1], z: p[2] }); if (r) b.setNextKinematicRotation(q(r)); },
    wake(h) { get(h).wakeUp(); },
    addJoint(d) {
      const aa = d.anchorA ?? [0, 0, 0], ab = d.anchorB ?? [0, 0, 0], a = { x: aa[0], y: aa[1], z: aa[2] }, b = { x: ab[0], y: ab[1], z: ab[2] }, ar = d.axis ?? [0, 1, 0], len = Math.hypot(...ar);
      if (d.kind === "hinge" && !(len > 1e-9)) throw Error("physics: hinge joint axis must be non-zero");
      const ax = { x: ar[0] / len, y: ar[1] / len, z: ar[2] / len }, A = get(d.bodyA), B = d.bodyB === undefined ? null : get(d.bodyB); let data: any;
      switch (d.kind) { case "fixed": data = R.JointData.fixed(a, { x: 0, y: 0, z: 0, w: 1 }, b, { x: 0, y: 0, z: 0, w: 1 }); break; case "hinge": data = R.JointData.revolute(a, b, ax); break; case "ball": data = R.JointData.spherical(a, b); break; case "distance": data = R.JointData.rope(d.restLength ?? 0, a, b); break; case "spring": data = R.JointData.spring(d.restLength ?? 0, d.stiffness ?? 40, d.damping ?? 6, a, b); break; }
      const joint = world.createImpulseJoint(data, A, B, true); if (d.kind === "hinge" && d.limits) joint.setLimits(d.limits[0], d.limits[1]); const h = nextJoint++; joints.set(h, { joint, a: d.bodyA, b: d.bodyB ?? -1, d: { ...d } }); return h;
    },
    removeJoint(h) { const j = joints.get(h); if (j) { world.removeImpulseJoint(j.joint, true); joints.delete(h); } },
    step(dt) {
      if (dt <= 0) return; world.timestep = options.fixedDt ?? dt; world.step(events); hasStepped = true;
      events.drainCollisionEvents((rawX: number, rawY: number, started: boolean) => { if (!listener || !started) return; const x = eventHandle(rawX), y = eventHandle(rawY), ca = world.getCollider(x), cb = world.getCollider(y), ha = find(colliders, x), hb = find(colliders, y); if (!ca || !cb || ha === undefined || hb === undefined) return; const m = world.contactPair(ca, cb)?.manifolds?.()[0], n = vec(m?.normal?.() ?? { x: 0, y: 1, z: 0 }), va = ca.parent()?.linvel?.() ?? { x: 0, y: 0, z: 0 }, vb = cb.parent()?.linvel?.() ?? { x: 0, y: 0, z: 0 }; listener({ a: ha, b: hb, normal: n, approachSpeed: Math.max(0, -((vb.x - va.x) * n[0] + (vb.y - va.y) * n[1] + (vb.z - va.z) * n[2])), impulse: Number(m?.totalImpulse?.() ?? 0) }); });
    },
    raycast(d: RayDesc) {
      const n = Math.hypot(...d.direction); if (!n) return null;
      updateQueryPipeline();
      const ray = new R.Ray({ x: d.origin[0], y: d.origin[1], z: d.origin[2] }, { x: d.direction[0] / n, y: d.direction[1] / n, z: d.direction[2] / n });
      const h = world.castRay(ray, d.maxDistance, true, undefined, queryGroups(d.mask)); if (!h) return null;
      const intersection = h.collider.castRayAndGetNormal(ray, h.timeOfImpact, true);
      const b = find(colliders, h.collider ?? h.colliderHandle); return b === undefined || b === d.exclude ? null : { body: b, distance: h.timeOfImpact, point: vec(ray.pointAt(h.timeOfImpact)), normal: vec(intersection.normal) };
    },
    shapecast(d: ShapeCastDesc) {
      updateQueryPipeline();
      const h = world.castShape({ x: d.position[0], y: d.position[1], z: d.position[2] }, q(d.rotation), { x: d.motion[0], y: d.motion[1], z: d.motion[2] }, shape(d.shape).shape, 0, 1, true, undefined, queryGroups(d.mask)); if (!h) return null;
      if (h.time_of_impact <= 0 && h.normal1 && (h.normal1.x * d.motion[0] + h.normal1.y * d.motion[1] + h.normal1.z * d.motion[2]) > 0) return null;
      const horizontal = Math.hypot(d.motion[0], d.motion[2]);
      const castBottom = d.position[1] - (d.shape.kind === "capsule" ? d.shape.halfHeight + d.shape.radius : d.shape.kind === "sphere" ? d.shape.radius : d.shape.kind === "box" ? d.shape.halfExtents[1] : 0);
      const raisedWitness = h.witness1 && h.witness2 && (h.witness1.y > castBottom + 0.01 || h.witness2.y > castBottom + 0.01);
      const edgeNormal = h.normal1 && raisedWitness && horizontal > 0 && h.normal1.y > 0.1
        ? (Math.hypot(h.normal1.x, h.normal1.z) > 1e-6
          ? { x: h.normal1.x / Math.hypot(h.normal1.x, h.normal1.z), y: 0, z: h.normal1.z / Math.hypot(h.normal1.x, h.normal1.z) }
          : { x: -d.motion[0] / horizontal, y: 0, z: -d.motion[2] / horizontal })
        : h.normal1;
      const cornerLanding = d.motion[1] < 0 && h.normal1 && h.normal1.y > 0 && h.witness1 && h.witness1.y < castBottom - 0.01;
      const contactNormal = cornerLanding ? { x: 0, y: 1, z: 0 } : edgeNormal;
      const b = find(colliders, h.collider ?? h.colliderHandle); return b === undefined || b === d.exclude ? null : { body: b, toi: h.time_of_impact, distance: h.time_of_impact * Math.hypot(...d.motion), point: vec(h.witness1), normal: vec(contactNormal) };
    },
    overlap(d: OverlapDesc) { const out: number[] = [], s = shape(d.shape); updateQueryPipeline(); world.intersectionsWithShape({ x: d.position[0], y: d.position[1], z: d.position[2] }, q(d.rotation), s.shape, (c: any) => { const h = find(colliders, c.handle); if (h !== undefined && h !== d.exclude) out.push(h); return true; }, undefined, queryGroups(d.mask)); return out; },
    onContact(l) { listener = l; },
    retune(c) { if (c.gravity) world.gravity = { x: c.gravity[0], y: c.gravity[1], z: c.gravity[2] }; },
    snapshot() { return { bytes: world.takeSnapshot(), bodies: [...bodies].map(([h, b]) => ({ h, n: b.handle, d: b.__jg.d })), colliders: [...colliders].map(([h, c]) => ({ h, n: c.handle })), joints: [...joints].map(([h, j]) => ({ h, n: j.joint.handle, a: j.a, b: j.b, d: j.d })), next, nextJoint }; },
    restore(s: any) { if (!s?.bytes) throw Error("physics: invalid Rapier snapshot"); world.free(); world = R.World.restoreSnapshot(s.bytes); bodies.clear(); colliders.clear(); joints.clear(); for (const x of s.bodies ?? []) { const b = world.getRigidBody(x.n); if (!b) throw Error(`physics: snapshot body ${x.h} is missing`); b.__jg = { d: x.d, h: x.h }; bodies.set(x.h, b); } for (const x of s.colliders ?? []) { const c = world.getCollider(x.n); if (!c) throw Error(`physics: snapshot collider ${x.h} is missing`); colliders.set(x.h, c); } for (const x of s.joints ?? []) { const j = world.getImpulseJoint(x.n); if (j) joints.set(x.h, { joint: j, a: x.a, b: x.b, d: x.d }); } next = s.next ?? (Math.max(0, ...bodies.keys()) + 1); nextJoint = s.nextJoint ?? (Math.max(0, ...joints.keys()) + 1); },
    dispose() { events.free?.(); world.free(); bodies.clear(); colliders.clear(); joints.clear(); listener = null; },
  };
  return backend;
}
