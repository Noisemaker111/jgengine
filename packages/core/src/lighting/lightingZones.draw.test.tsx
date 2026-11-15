/** @jsxImportSource @jgengine/core/ui/jsx */
import { expect, test } from "bun:test";
import * as THREE from "three";
import { createElement } from "@jgengine/core/ui/jsx";
import { mountTestDraws } from "@jgengine/core/frame/testEngineHost.draw";
import type { LightingConfig } from "@jgengine/core/game/playableGame";

import { ConfiguredLighting } from "./SceneLighting.draw";
import { readLightingZoneFactors } from "./lightingZones.draw";

function lights(scene: THREE.Scene) {
  const found = { ambient: [] as THREE.AmbientLight[], hemisphere: [] as THREE.HemisphereLight[], directional: [] as THREE.DirectionalLight[] };
  scene.traverse((object) => {
    if (object instanceof THREE.AmbientLight) found.ambient.push(object);
    if (object instanceof THREE.HemisphereLight) found.hemisphere.push(object);
    if (object instanceof THREE.DirectionalLight) found.directional.push(object);
  });
  return { ambient: found.ambient[0]!, hemisphere: found.hemisphere[0]!, key: found.directional[0]! };
}

const RIG: LightingConfig = {
  ambient: { color: "#ffffff", intensity: 0.4 },
  hemisphere: { skyColor: "#ffffff", groundColor: "#808080", intensity: 0.8 },
  directional: [{ position: [0, 30, 0], intensity: 2, color: "#ffffff" }],
  zones: [
    {
      area: { w: 100, d: 100, position: [0, 500] },
      fade: 20,
      key: { intensity: 0.25, color: "#ff8800" },
      fill: { intensity: 0.5, color: "#0000ff", groundColor: "#000000" },
      environment: 0.2,
      exposure: 0.6,
    },
  ],
};

test("a zoned rig re-lights as the camera enters a zone, blends at its edge and restores outside", async () => {
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000);
  camera.position.set(0, 5, 0);
  const m = await mountTestDraws(createElement(ConfiguredLighting, { lighting: RIG }), { camera });
  try {
    await m.advance(1 / 60);
    let rig = lights(m.scene);
    expect(rig.ambient.intensity).toBeCloseTo(0.4, 5);
    expect(rig.hemisphere.intensity).toBeCloseTo(0.8, 5);
    expect(rig.key.intensity).toBeCloseTo(2, 5);
    expect(rig.key.color.getHexString()).toBe("ffffff");
    expect(readLightingZoneFactors(m.scene)).toEqual({ exposure: 1, environment: 1 });

    camera.position.set(0, 5, 500);
    await m.advance(1 / 60);
    rig = lights(m.scene);
    expect(rig.ambient.intensity).toBeCloseTo(0.2, 5);
    expect(rig.hemisphere.intensity).toBeCloseTo(0.4, 5);
    expect(rig.key.intensity).toBeCloseTo(0.5, 5);
    expect(rig.key.color.getHexString()).toBe(new THREE.Color("#ff8800").getHexString());
    expect(rig.hemisphere.groundColor.getHexString()).toBe("000000");
    expect(readLightingZoneFactors(m.scene)).toEqual({ exposure: 0.6, environment: 0.2 });

    // Ten metres past the north edge is halfway through the fade.
    camera.position.set(0, 5, 560);
    await m.advance(1 / 60);
    rig = lights(m.scene);
    expect(rig.key.intensity).toBeCloseTo(2 * 0.625, 5);
    expect(readLightingZoneFactors(m.scene)!.exposure).toBeCloseTo(0.8, 5);

    camera.position.set(0, 5, 0);
    await m.advance(1 / 60);
    rig = lights(m.scene);
    expect(rig.key.intensity).toBeCloseTo(2, 5);
    expect(rig.ambient.color.getHexString()).toBe("ffffff");
  } finally {
    await m.unmount();
  }
  expect(readLightingZoneFactors(m.scene)).toBeUndefined();
});

test("a rig without zones publishes nothing and keeps its authored lights", async () => {
  const m = await mountTestDraws(createElement(ConfiguredLighting, { lighting: { ...RIG, zones: undefined } }));
  try {
    await m.advance(1 / 60);
    expect(readLightingZoneFactors(m.scene)).toBeUndefined();
    expect(lights(m.scene).key.intensity).toBeCloseTo(2, 5);
  } finally {
    await m.unmount();
  }
});
