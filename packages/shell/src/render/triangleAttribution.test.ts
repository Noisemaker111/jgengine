import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { attributeTriangles, triangleProbe } from "./triangleAttribution";

/** A plane grid, so the triangle count is a number the test states instead of guesses. */
function grid(segments: number): THREE.PlaneGeometry {
  return new THREE.PlaneGeometry(1, 1, segments, segments);
}

describe("triangle attribution", () => {
  test("counts instanced geometry once per instance and names the model it belongs to", () => {
    const scene = new THREE.Scene();
    const tree = new THREE.Group();
    tree.name = "TwistedTree_2";
    const canopy = new THREE.Mesh(grid(3), new THREE.MeshStandardMaterial({ name: "Leaves" }));
    canopy.name = "tree039_1";
    tree.add(canopy);
    const palms = new THREE.InstancedMesh(canopy.geometry, canopy.material, 7);
    palms.name = "tree039_1";
    tree.add(palms);
    scene.add(tree);

    const result = attributeTriangles(scene);
    expect(result.triangles).toBe(18 * 8);
    expect(result.lines[0]).toEqual({
      label: "TwistedTree_2/tree039_1",
      perInstance: 18,
      instances: 8,
      draws: 2,
      triangles: 18 * 8,
    });
  });

  test("separates shadow casters, because the shadow pass pays them a second time", () => {
    const scene = new THREE.Scene();
    const caster = new THREE.Mesh(grid(1), new THREE.MeshStandardMaterial());
    caster.castShadow = true;
    const ground = new THREE.Mesh(grid(4), new THREE.MeshStandardMaterial());
    scene.add(caster, ground);

    const result = attributeTriangles(scene);
    expect(result.casters).toBe(2);
    expect(result.triangles).toBe(2 + 32);
  });

  test("ranks the table biggest first and drops zero-triangle nodes like empty groups and points", () => {
    const scene = new THREE.Scene();
    const small = new THREE.Mesh(grid(1), new THREE.MeshStandardMaterial({ name: "small" }));
    const large = new THREE.Mesh(grid(8), new THREE.MeshStandardMaterial({ name: "large" }));
    const points = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial());
    scene.add(new THREE.Group(), points, small, large);

    const result = attributeTriangles(scene, 1);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]!.label).toBe("large");
    expect(result.lines[0]!.triangles).toBe(128);
    expect(attributeTriangles(scene, 0).lines).toHaveLength(2);
  });

  test("the probe reads the same scene, so a snapshot names the heaviest object", () => {
    const scene = new THREE.Scene();
    const terrain = new THREE.Mesh(grid(3), new THREE.MeshStandardMaterial());
    terrain.name = "terrain";
    const caster = new THREE.Mesh(grid(1), new THREE.MeshStandardMaterial());
    caster.name = "prop";
    caster.castShadow = true;
    scene.add(terrain, caster);

    const probe = triangleProbe(scene);
    expect(probe.counters()).toEqual({ triangles: 20, casters: 2, lines: 2 });
    expect(probe.state()).toBe("20 triangles · casters 2 · top terrain 18");
  });
});
