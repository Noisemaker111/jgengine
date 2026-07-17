import { uniformGravity, type GravityField } from "./gravityField";

/** Three-dimensional world-space vector used by the flight model. */
export type FlightVector = readonly [number, number, number];

/** Supported aerodynamic/propulsion families. */
export type AircraftKind = "fixedWing" | "rotorcraft" | "vtol";

/** Normalized pilot inputs for one flight-simulation tick. */
export interface FlightControlInput {
  throttle: number;
  pitch: number;
  roll: number;
  yaw: number;
  collective?: number;
  airbrake?: number;
  afterburner?: number;
  vectoring?: number;
}

/** Angular authority, response, damping, and self-leveling configuration. */
export interface FlightControlRates {
  pitch: number;
  roll: number;
  yaw: number;
  response: number;
  damping: number;
  stability: number;
}

/** Data-first physical tuning shared by all aircraft instances of one catalog type. */
export interface AircraftTuning {
  kind: AircraftKind;
  mass: number;
  gravity?: number;
  maxThrust: number;
  maxSpeed: number;
  drag: number;
  sideDrag: number;
  lift: number;
  stallSpeed: number;
  controls: FlightControlRates;
  afterburnerMultiplier?: number;
  hoverThrust?: number;
  rotorResponse?: number;
  groundEffectHeight?: number;
  vtolTransitionSpeed?: number;
  groundClearance?: number;
}

/** Spawn state and injectable world-field samplers for an aircraft instance. */
export interface AircraftOptions {
  position?: FlightVector;
  velocity?: FlightVector;
  rotation?: FlightVector;
  wind?: (position: FlightVector) => FlightVector;
  groundHeight?: (x: number, z: number) => number;
  gravityField?: GravityField;
}

/** Pose and aerodynamic telemetry returned after one flight tick. */
export interface AircraftStep {
  position: FlightVector;
  velocity: FlightVector;
  rotation: FlightVector;
  forwardSpeed: number;
  airspeed: number;
  verticalSpeed: number;
  angleOfAttack: number;
  liftFraction: number;
  stalled: boolean;
  grounded: boolean;
  gForce: number;
}

/** Stateful six-degree-of-freedom aircraft simulation. */
export interface AircraftDynamics {
  tick(dt: number, input: FlightControlInput): AircraftStep;
  pose(): { position: FlightVector; rotation: FlightVector };
  velocity(): FlightVector;
  resetTo(position: FlightVector, rotation?: FlightVector): void;
  setVelocity(velocity: FlightVector): void;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const length = (v: FlightVector): number => Math.hypot(v[0], v[1], v[2]);

function axes(rotation: FlightVector): { forward: FlightVector; right: FlightVector; up: FlightVector } {
  const [pitch, yaw, roll] = rotation;
  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const sr = Math.sin(roll);
  const cr = Math.cos(roll);
  const forward: FlightVector = [sy * cp, sp, cy * cp];
  const flatRight: FlightVector = [cy, 0, -sy];
  const flatUp: FlightVector = [-sy * sp, cp, -cy * sp];
  return {
    forward,
    right: [flatRight[0] * cr + flatUp[0] * sr, flatUp[1] * sr, flatRight[2] * cr + flatUp[2] * sr],
    up: [-flatRight[0] * sr + flatUp[0] * cr, flatUp[1] * cr, -flatRight[2] * sr + flatUp[2] * cr],
  };
}

function dot(a: FlightVector, b: FlightVector): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function wrapAngle(value: number): number {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

/** Six-degree-of-freedom arcade flight model for fixed-wing, helicopter, and VTOL aircraft.
 * @capability flight-dynamics simulate fixed-wing, helicopter, and VTOL aircraft
 */
export function createAircraftDynamics(tuning: AircraftTuning, options: AircraftOptions = {}): AircraftDynamics {
  let position: [number, number, number] = [...(options.position ?? [0, 0, 0])];
  let velocity: [number, number, number] = [...(options.velocity ?? [0, 0, 0])];
  let rotation: [number, number, number] = [...(options.rotation ?? [0, 0, 0])];
  let angular: [number, number, number] = [0, 0, 0];
  let rotor = 0;
  let lastVerticalSpeed = velocity[1];
  const gravity = Math.abs(tuning.gravity ?? 9.81);
  const gravityField = options.gravityField ?? uniformGravity([0, -gravity, 0]);
  const windAt = options.wind ?? (() => [0, 0, 0]);
  const groundAt = options.groundHeight ?? (() => 0);

  return {
    tick(dt, input) {
      const stepDt = clamp(dt, 0, 0.05);
      const wind = windAt(position);
      const gravityVector = gravityField.sample(position);
      const gravityMagnitude = Math.max(0.001, length(gravityVector));
      const relative: FlightVector = [velocity[0] - wind[0], velocity[1] - wind[1], velocity[2] - wind[2]];
      const airspeed = length(relative);
      const basis = axes(rotation);
      const forwardSpeed = dot(relative, basis.forward);
      const rightSpeed = dot(relative, basis.right);
      const upSpeed = dot(relative, basis.up);
      const angleOfAttack = Math.atan2(-upSpeed, Math.max(0.01, Math.abs(forwardSpeed)));
      const speedAuthority = clamp(airspeed / Math.max(1, tuning.stallSpeed), 0.12, 1);
      const rotorTarget = tuning.kind === "fixedWing" ? 0 : clamp(input.collective ?? input.throttle, 0, 1);
      const rotorResponse = Math.max(0.01, tuning.rotorResponse ?? 3.5);
      rotor += (rotorTarget - rotor) * (1 - Math.exp(-rotorResponse * stepDt));
      const vectoring = tuning.kind === "vtol" ? clamp(input.vectoring ?? 1, 0, 1) : tuning.kind === "rotorcraft" ? 1 : 0;
      const transition = tuning.kind === "vtol"
        ? clamp(Math.max(vectoring, 1 - airspeed / Math.max(1, tuning.vtolTransitionSpeed ?? 32)), 0, 1)
        : vectoring;
      const controlAuthority = transition + (1 - transition) * speedAuthority;
      const rates = tuning.controls;
      const targets: FlightVector = [
        clamp(input.pitch, -1, 1) * rates.pitch * controlAuthority,
        clamp(input.yaw, -1, 1) * rates.yaw * controlAuthority,
        clamp(input.roll, -1, 1) * rates.roll * controlAuthority,
      ];
      const response = 1 - Math.exp(-Math.max(0, rates.response) * stepDt);
      angular[0] += (targets[0] - angular[0]) * response;
      angular[1] += (targets[1] - angular[1]) * response;
      angular[2] += (targets[2] - angular[2]) * response;
      const damping = Math.max(0, 1 - rates.damping * stepDt);
      angular[0] *= damping;
      angular[1] *= damping;
      angular[2] *= damping;
      const stability = clamp(rates.stability * stepDt, 0, 1);
      if (Math.abs(input.pitch) < 0.05) angular[0] += -rotation[0] * stability;
      if (Math.abs(input.roll) < 0.05) angular[2] += -rotation[2] * stability;
      rotation[0] = clamp(rotation[0] + angular[0] * stepDt, -Math.PI * 0.49, Math.PI * 0.49);
      rotation[1] = wrapAngle(rotation[1] + angular[1] * stepDt);
      rotation[2] = wrapAngle(rotation[2] + angular[2] * stepDt);

      const updated = axes(rotation);
      const throttle = clamp(input.throttle, 0, 1);
      const afterburner = 1 + clamp(input.afterburner ?? 0, 0, 1) * ((tuning.afterburnerMultiplier ?? 1) - 1);
      const thrustAccel = tuning.maxThrust * throttle * afterburner / Math.max(0.01, tuning.mass);
      const hoverAccel = (tuning.hoverThrust ?? gravity * tuning.mass * 1.08) * rotor / Math.max(0.01, tuning.mass);
      const ground = groundAt(position[0], position[2]);
      const clearance = Math.max(0, position[1] - ground);
      const groundEffectHeight = Math.max(0.1, tuning.groundEffectHeight ?? 8);
      const groundEffect = transition > 0 ? 1 + clamp(1 - clearance / groundEffectHeight, 0, 1) * 0.18 : 1;
      const liftFraction = clamp((Math.abs(forwardSpeed) / Math.max(0.1, tuning.stallSpeed)) ** 2, 0, 1.35);
      const stallAngle = Math.PI * 0.22;
      const aoaEfficiency = clamp(1 - Math.max(0, Math.abs(angleOfAttack) - stallAngle) / (Math.PI * 0.3), 0.08, 1);
      const wingLift = tuning.lift * liftFraction * aoaEfficiency * (1 - transition);
      const rotorLift = hoverAccel * groundEffect * transition;
      const forwardThrust = thrustAccel * (1 - transition * 0.82);
      const cyclicForward = transition * hoverAccel * Math.sin(rotation[0]) * 0.75;
      const cyclicSide = -transition * hoverAccel * Math.sin(rotation[2]) * 0.75;
      const dragScale = tuning.drag * (1 + clamp(input.airbrake ?? 0, 0, 1) * 4);
      const speedRatio = airspeed / Math.max(1, tuning.maxSpeed);
      const dragAccel = dragScale * airspeed * (1 + speedRatio * speedRatio);
      const invAir = airspeed > 0.001 ? 1 / airspeed : 0;
      velocity[0] += (updated.forward[0] * (forwardThrust + cyclicForward) + updated.right[0] * cyclicSide + updated.up[0] * wingLift - relative[0] * invAir * dragAccel - updated.right[0] * rightSpeed * tuning.sideDrag + updated.up[0] * rotorLift + gravityVector[0]) * stepDt;
      velocity[1] += (updated.forward[1] * (forwardThrust + cyclicForward) + updated.right[1] * cyclicSide + updated.up[1] * wingLift - relative[1] * invAir * dragAccel - updated.right[1] * rightSpeed * tuning.sideDrag + updated.up[1] * rotorLift + gravityVector[1]) * stepDt;
      velocity[2] += (updated.forward[2] * (forwardThrust + cyclicForward) + updated.right[2] * cyclicSide + updated.up[2] * wingLift - relative[2] * invAir * dragAccel - updated.right[2] * rightSpeed * tuning.sideDrag + updated.up[2] * rotorLift + gravityVector[2]) * stepDt;

      const newSpeed = length(velocity);
      if (newSpeed > tuning.maxSpeed * afterburner && newSpeed > 0) {
        const scale = tuning.maxSpeed * afterburner / newSpeed;
        velocity[0] *= scale;
        velocity[1] *= scale;
        velocity[2] *= scale;
      }
      position[0] += velocity[0] * stepDt;
      position[1] += velocity[1] * stepDt;
      position[2] += velocity[2] * stepDt;
      const floor = ground + (tuning.groundClearance ?? 0.6);
      let grounded = false;
      if (position[1] < floor) {
        position[1] = floor;
        if (velocity[1] < 0) velocity[1] *= -0.08;
        velocity[0] *= 0.985;
        velocity[2] *= 0.985;
        grounded = true;
      }
      const verticalAcceleration = stepDt > 0 ? (velocity[1] - lastVerticalSpeed) / stepDt : 0;
      lastVerticalSpeed = velocity[1];
      return {
        position: [...position],
        velocity: [...velocity],
        rotation: [...rotation],
        forwardSpeed,
        airspeed,
        verticalSpeed: velocity[1],
        angleOfAttack,
        liftFraction,
        stalled: transition < 0.5 && (Math.abs(forwardSpeed) < tuning.stallSpeed || aoaEfficiency < 0.35),
        grounded,
        gForce: (verticalAcceleration - gravityVector[1]) / gravityMagnitude,
      };
    },
    pose: () => ({ position: [...position], rotation: [...rotation] }),
    velocity: () => [...velocity],
    resetTo(nextPosition, nextRotation = [0, 0, 0]) {
      position = [...nextPosition];
      velocity = [0, 0, 0];
      rotation = [...nextRotation];
      angular = [0, 0, 0];
      rotor = 0;
      lastVerticalSpeed = 0;
    },
    setVelocity(nextVelocity) {
      velocity = [...nextVelocity];
      lastVerticalSpeed = velocity[1];
    },
  };
}
