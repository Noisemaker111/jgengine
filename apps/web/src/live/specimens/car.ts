/**
 * Live demo: the engine's car lapping a track, seen from above. `createVehicleDynamics` runs the real
 * tire model every frame and the sliders `retune` it mid-lap. A small autopilot works the same pedals a
 * player would (throttle, brake, steer, handbrake) until the visitor presses a key on it.
 */
import type { AxisInput } from "@jgengine/core/input/axisInput";
import { createVehicleDynamics } from "@jgengine/core/physics/vehicleDynamics";
import { vehicleTuning, type VehicleSpecAids, type VehicleSpecBrakes, type VehicleSpecChassis, type VehicleSpecSteering } from "@jgengine/core/physics/vehicleSpec";

import { at } from "../at";
import { drawKeycaps, drawPill, heldKeys, mountCanvas2d, takeover } from "../canvas2d";
import type { Trace } from "../trace";

/**
 * The demo's three driver-aid setups; grip and drift come from the dials. A looser car (more drift) gets less
 * traction control and more caster, so the slide it is built for is still catchable.
 */
interface CarAidSet {
  brakes: Pick<VehicleSpecBrakes, "abs">;
  aids: Pick<VehicleSpecAids, "stability" | "tractionControl">;
  steering: Pick<VehicleSpecSteering, "selfAlign" | "steerRate">;
  chassis: VehicleSpecChassis;
}

const CAR_AIDS = {
  arcade: {
    brakes: { abs: 1 },
    aids: { stability: 1, tractionControl: 0.7 },
    steering: { selfAlign: 0.6, steerRate: 4.4 },
    chassis: { bodyRoll: 0.4 },
  },
  sim: {
    brakes: { abs: 0.25 },
    aids: { stability: 0.55, tractionControl: 0.175 },
    steering: { selfAlign: 0.3375, steerRate: 2.9 },
    chassis: { bodyRoll: 0.6 },
  },
  drift: {
    brakes: { abs: 0.55 },
    aids: { stability: 0.73, tractionControl: 0.385 },
    steering: { selfAlign: 0.4425, steerRate: 3.5 },
    chassis: { bodyRoll: 0.6 },
  },
} as const satisfies Record<string, CarAidSet>;

function aidsFor(style: CarStyle, drift: number): CarAidSet {
  const aids = CAR_AIDS[style];
  return {
    brakes: { abs: aids.brakes.abs },
    aids: { stability: aids.aids.stability, tractionControl: aids.aids.tractionControl * (1 - 0.5 * drift) },
    steering: { selfAlign: aids.steering.selfAlign + 0.25 * drift, steerRate: aids.steering.steerRate },
    chassis: aids.chassis,
  };
}

export type CarStyle = keyof typeof CAR_AIDS;

export function isCarStyle(value: unknown): value is CarStyle {
  return typeof value === "string" && Object.hasOwn(CAR_AIDS, value);
}

export interface CarDials {
  style: CarStyle;
  topSpeed: number;
  accel: number;
  turnRate: number;
  grip: number;
  drift: number;
}

export interface CarSpecimen {
  setDials(dials: CarDials): void;
  dispose(): void;
}

const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);
const TRACK_WIDTH = 11;
const MAX_SKIDS = 1400;
/** Autopilot planning numbers, m/s²: sideways grip it trusts in a bend, and braking. */
const LATERAL_GRIP = 3;
const BRAKING = 10;

/** Corner points of the circuit in metres (x, z); a smooth loop runs through them. */
const CORNERS: readonly (readonly [number, number])[] = [
  [0, -40], [55, -42], [80, -20], [70, 8], [40, 10], [30, 28], [52, 44], [20, 52], [-30, 48], [-62, 30], [-70, 0], [-48, -12], [-22, 2], [-30, -32],
];

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** The centre line, sampled every metre or so. */
function buildTrack(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const n = CORNERS.length;
  for (let i = 0; i < n; i++) {
    const p0 = at(CORNERS, (i - 1 + n) % n), p1 = at(CORNERS, i), p2 = at(CORNERS, (i + 1) % n), p3 = at(CORNERS, (i + 2) % n);
    const steps = Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push({ x: catmull(p0[0], p1[0], p2[0], p3[0], t), z: catmull(p0[1], p1[1], p2[1], p3[1], t) });
    }
  }
  return out;
}

const TRACK = buildTrack();

function tuningFrom(d: CarDials) {
  const aids = aidsFor(d.style, d.drift);
  return vehicleTuning({
    engine: { topSpeed: d.topSpeed, accel: d.accel },
    brakes: { ...aids.brakes, brake: 16 },
    aids: aids.aids,
    steering: { ...aids.steering, turnRate: d.turnRate },
    chassis: aids.chassis,
    tires: { grip: d.grip, drift: d.drift },
  });
}

function headingOf(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.atan2(b.x - a.x, b.z - a.z);
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function createCarSpecimen(container: HTMLElement, trace: Trace): CarSpecimen {
  let dials: CarDials = { style: "drift", topSpeed: 34, accel: 10, turnRate: 2.4, grip: 1.1, drift: 0.85 };
  const car = createVehicleDynamics(tuningFrom(dials));
  const start = at(TRACK, 0);
  const resetCar = () => car.resetTo([start.x, 0, start.z], headingOf(start, at(TRACK, 3)));
  resetCar();
  const skids: { x: number; z: number; t: number }[] = [];
  const pilot = takeover(5000);
  let index = 0;
  let nearestPrev = 0;
  let lapStart = performance.now();
  let bestLap: number | null = null;

  function nearestIndex(x: number, z: number): number {
    let best = index, bestD = Infinity;
    for (let k = -30; k <= 60; k++) {
      const i = (index + k + TRACK.length) % TRACK.length;
      const p = at(TRACK, i);
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function autopilot(x: number, z: number, heading: number, speed: number): AxisInput {
    const ahead = (m: number) => at(TRACK, (index + Math.round(m)) % TRACK.length);
    const target = ahead(6 + speed * 0.3);
    const dx = target.x - x, dz = target.z - z;
    const fwd = dx * Math.sin(heading) + dz * Math.cos(heading);
    // Positive steer turns toward -x when facing +z.
    const right = -dx * Math.cos(heading) + dz * Math.sin(heading);
    const offAxis = Math.atan2(right, fwd);
    const steer = Math.max(-1, Math.min(1, offAxis * 2));
    // The fastest speed that can still slow down in time for every bend in the next 60 m.
    let carry = dials.topSpeed;
    for (let m = 0; m <= 60; m += 4) {
      const bend = Math.abs(wrapAngle(headingOf(ahead(m + 4), ahead(m + 8)) - headingOf(ahead(m), ahead(m + 4)))) / 4;
      const cornerSpeed = Math.sqrt(LATERAL_GRIP / Math.max(bend, 1e-4));
      carry = Math.min(carry, Math.sqrt(cornerSpeed * cornerSpeed + 2 * BRAKING * m));
    }
    return {
      // Off the throttle while the road is well off the nose, so a slide can't spin into the grass.
      throttle: speed < carry && Math.abs(offAxis) < 0.8 ? 1 : 0,
      brake: speed > carry + 4 ? 1 : 0,
      steer,
      handbrake: speed > carry + 7 ? 1 : 0,
    };
  }

  const view = mountCanvas2d(container, ({ ctx, width, height, dt }) => {
    const before = car.pose();
    const [px, , pz] = before.position;
    const speedNow = Math.hypot(...car.velocity());
    index = nearestIndex(px, pz);

    const k = keys.held;
    const on = (...codes: string[]) => (codes.some((c) => k.has(c)) ? 1 : 0);
    const visitor = pilot.byVisitor();
    const axis: AxisInput = visitor
      ? { throttle: on("KeyW", "ArrowUp"), brake: on("KeyS", "ArrowDown"), steer: on("KeyD", "ArrowRight") - on("KeyA", "ArrowLeft"), handbrake: on("Space") }
      : autopilot(px, pz, before.heading, speedNow);
    const step = car.tick(dt, axis);
    const [x, , z] = step.position;

    const throttle = (axis.throttle ?? 0) > 0, brake = (axis.brake ?? 0) > 0, handbrake = (axis.handbrake ?? 0) > 0;
    const steer = axis.steer ?? 0;
    if (throttle) trace.hit("throttle");
    if (brake) trace.hit("brake");
    if (Math.abs(steer) > 0.15) trace.hit("steer");
    if (handbrake) trace.hit("handbrake");
    const sliding = step.rearSaturation >= 1 && Math.abs(step.forwardSpeed) > 3;
    if (sliding) trace.hit("slide");
    trace.hit("move");

    const now = performance.now();
    if (sliding) {
      skids.push({ x, z, t: now });
      if (skids.length > MAX_SKIDS) skids.shift();
    }
    const here = at(TRACK, index);
    if (Math.hypot(here.x - x, here.z - z) > 30) {
      // Put the car back on the road where it left it.
      car.resetTo([here.x, 0, here.z], headingOf(here, at(TRACK, (index + 3) % TRACK.length)));
    }
    if (index < 20 && nearestPrev > TRACK.length - 20 && now - lapStart > 4000) {
      const lap = (now - lapStart) / 1000;
      bestLap = bestLap === null ? lap : Math.min(bestLap, lap);
      lapStart = now;
    }
    nearestPrev = index;

    // Fit the whole circuit; world +x is drawn to the left so a right turn looks like one.
    const scale = Math.min((width - 40) / 160, (height - 70) / 104);
    const cx = width / 2, cy = height / 2 + 6;
    const sx = (wx: number) => cx - (wx - 4) * scale;
    const sy = (wz: number) => cy - (wz - 5) * scale;

    ctx.fillStyle = "#0f1a14";
    ctx.fillRect(0, 0, width, height);
    const road = (w: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = w * scale;
      ctx.lineJoin = "round";
      ctx.beginPath();
      TRACK.forEach((p, i) => (i === 0 ? ctx.moveTo(sx(p.x), sy(p.z)) : ctx.lineTo(sx(p.x), sy(p.z))));
      ctx.closePath();
      ctx.stroke();
    };
    road(TRACK_WIDTH + 2, "#e8e8e8");
    road(TRACK_WIDTH, "#2a3038");
    ctx.setLineDash([6, 8]);
    road(0.3, "rgba(255,255,255,0.25)");
    ctx.setLineDash([]);
    // Start line.
    const s0 = at(TRACK, 0), s1 = at(TRACK, 2);
    const h0 = headingOf(s0, s1);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx(s0.x + Math.cos(h0) * TRACK_WIDTH / 2), sy(s0.z - Math.sin(h0) * TRACK_WIDTH / 2));
    ctx.lineTo(sx(s0.x - Math.cos(h0) * TRACK_WIDTH / 2), sy(s0.z + Math.sin(h0) * TRACK_WIDTH / 2));
    ctx.stroke();

    for (const s of skids) {
      const age = (now - s.t) / 9000;
      if (age > 1) continue;
      ctx.fillStyle = `rgba(0,0,0,${0.55 * (1 - age)})`;
      ctx.fillRect(sx(s.x) - 1.2, sy(s.z) - 1.2, 2.4, 2.4);
    }

    ctx.save();
    ctx.translate(sx(x), sy(z));
    ctx.rotate(-step.heading);
    const w = Math.max(7, 1.9 * scale * 1.6), l = Math.max(14, 4.3 * scale * 1.6);
    ctx.fillStyle = sliding ? "#ff5a3c" : "#f2f4f7";
    ctx.beginPath();
    ctx.roundRect(-w / 2, -l / 2, w, l, 2);
    ctx.fill();
    ctx.fillStyle = "#1d2733";
    ctx.fillRect(-w / 2 + 1.5, -l / 2 + l * 0.2, w - 3, l * 0.22);
    if (brake || handbrake) {
      ctx.fillStyle = "#ff2b2b";
      ctx.fillRect(-w / 2, l / 2 - 2, w, 2);
    }
    ctx.restore();

    drawPill(ctx, visitor ? "You're driving" : "Autopilot · press a key to drive", 12, 12, visitor ? "live" : "accent");
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(Math.abs(step.forwardSpeed) * 3.6)} km/h`, width - 12, 24);
    ctx.fillText(`lap ${((now - lapStart) / 1000).toFixed(1)} s`, width - 12, 40);
    if (bestLap !== null) ctx.fillText(`best ${bestLap.toFixed(1)} s`, width - 12, 56);
    ctx.fillStyle = sliding ? "#ff8a70" : "rgba(255,255,255,0.55)";
    ctx.fillText(sliding ? "rear tires sliding" : "rear tires gripping", width - 12, height - 16);
    ctx.textAlign = "start";
    drawKeycaps(ctx, [
      { label: "A", on: steer < -0.15 },
      { label: "W", on: throttle },
      { label: "S", on: brake },
      { label: "D", on: steer > 0.15 },
      { label: "Space", on: handbrake, wide: true },
    ], 12, height - 36);
  }, { label: "A car lapping a track by itself. Press W, A, S, D or Space on it to drive." });

  const keys = heldKeys(view.canvas, GAME_KEYS);
  const onKey = (e: KeyboardEvent) => {
    if (GAME_KEYS.has(e.code)) pilot.touch();
  };
  const onPointer = () => view.canvas.focus();
  view.canvas.addEventListener("keydown", onKey);
  view.canvas.addEventListener("pointerdown", onPointer);
  // Keys held count as driving, so the autopilot waits while a key stays down.
  const holdTimer = setInterval(() => {
    if (keys.held.size > 0) pilot.touch();
  }, 200);

  return {
    setDials(next) {
      dials = next;
      car.retune(tuningFrom(dials));
    },
    dispose() {
      clearInterval(holdTimer);
      keys.dispose();
      view.canvas.removeEventListener("keydown", onKey);
      view.canvas.removeEventListener("pointerdown", onPointer);
      view.dispose();
    },
  };
}
