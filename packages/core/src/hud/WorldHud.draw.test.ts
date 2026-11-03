import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { pointInTelegraph, type TelegraphShape } from "@jgengine/core/combat/telegraph";
import { telegraphDecalPose, telegraphPulseOpacity } from "@jgengine/core/combat/telegraphPulse";

describe("telegraphPulseOpacity", () => {
  test("pulses from 0.45 to 0.95 across the windup without needing React state", () => {
    expect(telegraphPulseOpacity(1000, 1000, 1000)).toBeCloseTo(0.45, 5);
    expect(telegraphPulseOpacity(1000, 1000, 1500)).toBeCloseTo(0.7, 5);
    expect(telegraphPulseOpacity(1000, 1000, 2000)).toBeCloseTo(0.95, 5);
    expect(telegraphPulseOpacity(1000, 1000, 3000)).toBeCloseTo(0.95, 5);
  });
});

/** The geometry `TelegraphDecal` draws for a shape, before it is posed. */
function decalGeometry(shape: TelegraphShape): THREE.BufferGeometry {
  if (shape.kind === "circle") return new THREE.CircleGeometry(shape.radius, 48);
  if (shape.kind === "ring") return new THREE.RingGeometry(shape.innerRadius, shape.radius, 48);
  if (shape.kind === "cone") return new THREE.CircleGeometry(shape.radius, 40, -shape.angle / 2, shape.angle);
  return new THREE.PlaneGeometry(shape.width, shape.length);
}

describe("telegraphDecalPose", () => {
  const shapes: TelegraphShape[] = [
    { kind: "cone", radius: 3, angle: (80 * Math.PI) / 180 },
    { kind: "line", length: 9, width: 0.7 },
    { kind: "circle", radius: 4 },
  ];
  const at: [number, number, number] = [5, 0, -2];

  for (const shape of shapes) {
    test(`a ${shape.kind} decal covers the ground its hit test covers, at every facing`, () => {
      for (const dir of [0, 0.7, Math.PI / 2, 2.4, -1.1, Math.PI]) {
        const pose = telegraphDecalPose(shape, at, dir);
        const mesh = new THREE.Object3D();
        mesh.position.set(...pose.position);
        mesh.rotation.set(...pose.rotation);
        mesh.updateMatrixWorld(true);
        const vertices = decalGeometry(shape).getAttribute("position");
        const centre = new THREE.Vector3();
        for (let i = 0; i < vertices.count; i += 1) centre.add(new THREE.Vector3().fromBufferAttribute(vertices, i));
        centre.divideScalar(vertices.count);
        for (let i = 0; i < vertices.count; i += 1) {
          // Pulled a hair toward the middle so an edge vertex does not hinge on rounding.
          const local = new THREE.Vector3().fromBufferAttribute(vertices, i).lerp(centre, 0.02);
          const world = local.applyMatrix4(mesh.matrixWorld);
          expect(pointInTelegraph({ shape, at, dir }, [world.x, world.y, world.z])).toBe(true);
        }
      }
    });
  }
});
