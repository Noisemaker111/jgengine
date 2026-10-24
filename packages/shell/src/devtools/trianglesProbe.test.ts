import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { devtools } from "@jgengine/core/devtools/devtools";

import { triangleProbe } from "../render/triangleAttribution";
import { DevtoolsRendererProbe } from "./DevtoolsOverlay";

describe("devtools renderer probe", () => {
  test("publishes the triangle table under the probe id a snapshot reads", () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 2, 2), new THREE.MeshStandardMaterial());
    mesh.name = "terrain";
    scene.add(mesh);

    const disposeProbe = devtools.probes.register("render/triangles", () => triangleProbe(scene).table());
    const table = devtools.probes.read()["render/triangles"] as { triangles: number };
    disposeProbe();
    expect(table.triangles).toBe(8);
    expect(devtools.probes.read()["render/triangles"]).toBeUndefined();
    expect(typeof DevtoolsRendererProbe).toBe("function");
  });
});
