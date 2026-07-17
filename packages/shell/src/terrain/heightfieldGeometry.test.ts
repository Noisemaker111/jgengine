import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { displaceHeightfieldGeometry, type HeightfieldRect } from "./heightfieldGeometry";

const BOUNDS: HeightfieldRect = { minX: -40, minZ: -40, maxX: 40, maxZ: 40 };
const SEGMENTS = 32;

function makeGeometry(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(
    BOUNDS.maxX - BOUNDS.minX,
    BOUNDS.maxZ - BOUNDS.minZ,
    SEGMENTS,
    SEGMENTS,
  );
  geo.rotateX(-Math.PI / 2);
  return geo;
}

const flat = (): number => 0;

function bumpField(x: number, z: number): number {
  const d = Math.hypot(x - 10, z - 5);
  return d < 12 ? (12 - d) * 0.6 : 0;
}

describe("displaceHeightfieldGeometry", () => {
  test("full pass sets every vertex height from the field at its world position", () => {
    const geo = makeGeometry();
    const field = (x: number, z: number): number => x * 0.1 + z * 0.05;
    displaceHeightfieldGeometry(geo, field, { bounds: BOUNDS });
    const position = geo.attributes.position as THREE.BufferAttribute;
    const cx = (BOUNDS.minX + BOUNDS.maxX) / 2;
    const cz = (BOUNDS.minZ + BOUNDS.maxZ) / 2;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index) + cx;
      const z = position.getZ(index) + cz;
      expect(position.getY(index)).toBeCloseTo(field(x, z), 6);
    }
  });

  test("a windowed pass over a changed region matches a from-scratch full pass exactly", () => {
    const fullGeo = makeGeometry();
    const windowGeo = makeGeometry();
    displaceHeightfieldGeometry(fullGeo, flat, { bounds: BOUNDS });
    displaceHeightfieldGeometry(windowGeo, flat, { bounds: BOUNDS });

    // The field changes only inside the bump; the windowed pass covers it with a margin.
    const region: HeightfieldRect = { minX: -6, minZ: -11, maxX: 26, maxZ: 21 };
    displaceHeightfieldGeometry(fullGeo, bumpField, { bounds: BOUNDS });
    displaceHeightfieldGeometry(windowGeo, bumpField, { bounds: BOUNDS, region });

    const fullPos = (fullGeo.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const windowPos = (windowGeo.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const fullNrm = (fullGeo.attributes.normal as THREE.BufferAttribute).array as Float32Array;
    const windowNrm = (windowGeo.attributes.normal as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < fullPos.length; i += 1) {
      expect(windowPos[i]).toBeCloseTo(fullPos[i]!, 6);
    }
    for (let i = 0; i < fullNrm.length; i += 1) {
      expect(windowNrm[i]).toBeCloseTo(fullNrm[i]!, 6);
    }
  });

  test("normals are unit length and tilt away from a slope's uphill direction", () => {
    const geo = makeGeometry();
    // Plane rising toward +x: normals must lean toward -x, stay unit length.
    displaceHeightfieldGeometry(geo, (x) => x * 0.5, { bounds: BOUNDS });
    const normals = geo.attributes.normal as THREE.BufferAttribute;
    for (let index = 0; index < normals.count; index += 1) {
      const nx = normals.getX(index);
      const ny = normals.getY(index);
      const nz = normals.getZ(index);
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
      expect(nx).toBeLessThan(0);
      expect(ny).toBeGreaterThan(0);
      expect(Math.abs(nz)).toBeLessThan(1e-6);
    }
  });

  test("bounding sphere contains every displaced vertex, including after a partial raise", () => {
    const geo = makeGeometry();
    displaceHeightfieldGeometry(geo, flat, { bounds: BOUNDS });
    const spike = (x: number, z: number): number => (Math.hypot(x - 10, z - 5) < 6 ? 25 : 0);
    displaceHeightfieldGeometry(geo, spike, {
      bounds: BOUNDS,
      region: { minX: 2, minZ: -3, maxX: 18, maxZ: 13 },
    });
    const sphere = geo.boundingSphere!;
    const position = geo.attributes.position as THREE.BufferAttribute;
    const vertex = new THREE.Vector3();
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index);
      expect(vertex.distanceTo(sphere.center)).toBeLessThanOrEqual(sphere.radius + 1e-4);
    }
  });

  test("the color hook writes only inside the window on partial passes", () => {
    const geo = makeGeometry();
    const paintAll = (_x: number, _z: number, _h: number, out: THREE.Color): void => {
      out.setRGB(0.25, 0.5, 0.75);
    };
    displaceHeightfieldGeometry(geo, flat, { bounds: BOUNDS, color: paintAll });
    const region: HeightfieldRect = { minX: 0, minZ: 0, maxX: 10, maxZ: 10 };
    const paintRed = (_x: number, _z: number, _h: number, out: THREE.Color): void => {
      out.setRGB(1, 0, 0);
    };
    displaceHeightfieldGeometry(geo, flat, { bounds: BOUNDS, region, color: paintRed });
    const colors = geo.attributes.color as THREE.BufferAttribute;
    const position = geo.attributes.position as THREE.BufferAttribute;
    let reds = 0;
    for (let index = 0; index < colors.count; index += 1) {
      const inRegion =
        position.getX(index) >= region.minX - 2.5 &&
        position.getX(index) <= region.maxX + 2.5 &&
        position.getZ(index) >= region.minZ - 2.5 &&
        position.getZ(index) <= region.maxZ + 2.5;
      if (colors.getX(index) === 1) {
        reds += 1;
        expect(inRegion).toBe(true);
      }
    }
    expect(reds).toBeGreaterThan(0);
  });

  test("a missing color attribute forces a full pass so no vertex keeps a stale color", () => {
    const geo = makeGeometry();
    const paint = (_x: number, _z: number, _h: number, out: THREE.Color): void => {
      out.setRGB(0.1, 0.9, 0.1);
    };
    // First call passes a region, but there is no color attribute yet — it must fill everything.
    displaceHeightfieldGeometry(geo, flat, {
      bounds: BOUNDS,
      region: { minX: 0, minZ: 0, maxX: 4, maxZ: 4 },
      color: paint,
    });
    const colors = geo.attributes.color as THREE.BufferAttribute;
    for (let index = 0; index < colors.count; index += 1) {
      expect(colors.getY(index)).toBeCloseTo(0.9, 6);
    }
  });
});
