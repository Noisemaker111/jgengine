import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { ChaseCameraConfig, ChaseView } from "@jgengine/core/game/playableGame";
import { resolvePlayerMovementTuning, stepPlayerMovement } from "@jgengine/core/movement/playerMovement";
import { createKinematicVehicle } from "@jgengine/core/physics/kinematicVehicle";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createCameraDirector } from "@jgengine/core/runtime/cameraDirector";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { resolveChaseHeading } from "./chaseHeading";
import { createChaseRigState, resolveChase, seatPose, stepChase } from "./rigMath";

const DT = 1 / 60;

describe("chase heading ownership", () => {
  test("held walking directions stay straight as body facing changes under an input-owned chase", () => {
    for (const action of ["moveForward", "moveRight", "moveBack", "moveLeft"]) {
      const ctx = createGameContext({
        definition: defineGameDefinition({ name: "Chase heading", assets: createAssetCatalog(), multiplayer: "off", features: { players: true } }),
        content: { entityById: () => ({ stats: { health: { max: 10 } } }) },
        player: { userId: "actor", isNew: true },
      });
      ctx.scene.entity.spawn("actor", { id: "actor", position: [0, 0, 0], rotationY: 0.8 });
      const movement = resolvePlayerMovementTuning({ movement: { turnSpeed: 8, collideObjects: false } });
      const config: ChaseCameraConfig = { headingSource: "input", yawResponse: 5 };
      const resolved = resolveChase(config);
      const state = createChaseRigState();
      let inputYaw = 0.8;
      let distance = 0;
      for (let frame = 0; frame < 360; frame++) {
        const previous = ctx.scene.entity.get("actor")!.position;
        stepPlayerMovement(ctx, "actor", { held: [action], pointer: null }, DT, movement, inputYaw);
        const actor = ctx.scene.entity.get("actor")!;
        distance += Math.hypot(actor.position[0] - previous[0], actor.position[2] - previous[2]);
        const step = stepChase(state, {
          follow: { x: actor.position[0], y: actor.position[1], z: actor.position[2] },
          yaw: resolveChaseHeading(config, actor.rotationY, inputYaw),
          bodyPitch: 0,
          velocity: null,
          lookBack: false,
          fovKick: 0,
        }, resolved, DT);
        inputYaw = resolveChaseHeading(config, step.anchorYaw, inputYaw);
      }
      const actor = ctx.scene.entity.get("actor")!;
      expect(distance).toBeGreaterThan(10);
      expect(Math.hypot(actor.position[0], actor.position[2])).toBeGreaterThan(distance * 0.99);
      expect(inputYaw).toBe(0.8);
      if (action !== "moveForward") expect(actor.rotationY).not.toBeCloseTo(inputYaw, 3);
    }
  });

  test("camera smoothing and look-back do not overwrite changed input aim", () => {
    const config: ChaseCameraConfig = { headingSource: "input", yawResponse: 5 };
    const state = createChaseRigState();
    const resolved = resolveChase(config);
    const at = { x: 0, y: 0, z: 0 };
    stepChase(state, { follow: at, yaw: 0, bodyPitch: 0, velocity: null, lookBack: false, fovKick: 0 }, resolved, DT);
    const changed = stepChase(state, { follow: at, yaw: resolveChaseHeading(config, -2, 1.2), bodyPitch: 0, velocity: null, lookBack: true, fovKick: 0 }, resolved, DT);
    expect(changed.anchorYaw).toBeGreaterThan(0);
    expect(changed.anchorYaw).toBeLessThan(1.2);
    expect(resolveChaseHeading(config, changed.anchorYaw, 1.2)).toBe(1.2);
  });

  test("the default and explicit body source still follow a turning vehicle and return its chase aim", () => {
    const car = createKinematicVehicle({ engineAccel: 12, brakeAccel: 18, topSpeed: 20, reverseSpeed: 6, turnRate: 2, turnSpeedRef: 5, gripStrength: 7, handbrakeGrip: 0.4 });
    const camera = createChaseRigState();
    const resolved = resolveChase({ yawResponse: 5 });
    let inputYaw = -2;
    let lastHeading = 0;
    for (let frame = 0; frame < 120; frame++) {
      const carStep = car.tick(DT, { throttle: 1, brake: 0, steer: 0.4, handbrake: 0 });
      lastHeading = carStep.heading;
      const yaw = resolveChaseHeading(undefined, carStep.heading, inputYaw);
      expect(yaw).toBe(carStep.heading);
      expect(resolveChaseHeading({ headingSource: "body" }, carStep.heading, inputYaw)).toBe(yaw);
      const step = stepChase(camera, { follow: { x: carStep.position[0], y: 0, z: carStep.position[2] }, yaw, bodyPitch: 0, velocity: null, lookBack: false, fovKick: 0 }, resolved, DT);
      inputYaw = resolveChaseHeading(undefined, step.anchorYaw, inputYaw);
      expect(inputYaw).toBe(step.anchorYaw);
    }
    expect(Math.abs(lastHeading)).toBeGreaterThan(0.5);
    expect(Math.abs(inputYaw - lastHeading)).toBeLessThan(0.3);
  });

  test("seat views keep body heading and runtime source overlays restore the authored input mode", () => {
    const base: ChaseCameraConfig = { headingSource: "input" };
    const director = createCameraDirector();
    director.setChaseTuning({ headingSource: "body" });
    expect(resolveChaseHeading({ ...base, ...director.chaseTuning() }, 0, 1.2)).toBe(0);
    director.setChaseTuning(null);
    expect(resolveChaseHeading({ ...base, ...director.chaseTuning() }, 0, 1.2)).toBe(1.2);
    for (const view of ["hood", "cockpit", "rear"] as ChaseView[]) {
      const yaw = resolveChaseHeading({ ...base, view }, 0, 1.2);
      expect(yaw).toBe(0);
      const pose = seatPose({ x: 0, y: 0, z: 0 }, yaw, { x: 0, y: 1, z: 1.4 }, 60);
      expect(pose.position.x).toBe(0);
      expect(pose.position.z).toBe(1.4);
      expect(pose.lookAt.x).toBe(0);
    }
  });
});
