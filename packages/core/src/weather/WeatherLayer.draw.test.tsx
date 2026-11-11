/** @jsxImportSource @jgengine/core/ui/jsx */
import { expect, test } from "bun:test";
import { createElement, type ReactElement } from "@jgengine/core/ui/jsx";
import * as THREE from "three";
import { createAuthoredWeather } from "@jgengine/core/weather/authoredWeather";
import { mountTestDraws } from "@jgengine/core/frame/testEngineHost.draw";
import type { WeatherParticleMetrics } from "./weatherUniforms.draw";
import { WeatherLayer } from "./WeatherLayer.draw";

async function mounted(element: ReactElement, run: (scene: THREE.Scene, frame: () => Promise<void>, render: (next: ReactElement) => Promise<void>) => Promise<void>) {
  const m = await mountTestDraws(element, { width: 800, height: 450 });
  try {
    const frame = async () => m.advance(1 / 60);
    const render = async (next: ReactElement) => m.render(next);
    await run(m.scene, frame, render);
  } finally {
    await m.unmount();
  }
}

function weatherMeshes(scene: THREE.Scene): THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>[] {
  const result: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>[] = [];
  scene.traverse((object) => { if ((object as THREE.Mesh).isMesh) result.push(object as typeof result[number]); });
  return result;
}

test("mounted weather uses one authoritative source through shifts, pause, disable and restored remount", async () => {
  const weather = createAuthoredWeather({ initialProfileId: "rain", profiles: [{ id: "rain", mode: "rain", intensity: 1 }, { id: "snow", mode: "snow", intensity: 1 }], schedule: [{ atSeconds: 40, profileId: "snow" }], wind: { direction: [1, 0], speed: 3 } });
  let time = 31;
  let impactQueries = 0;
  const metrics: WeatherParticleMetrics = { rain: { count: 0, capacity: 0 }, snow: { count: 0, capacity: 0 }, dust: { count: 0, capacity: 0 }, impacts: { count: 0, capacity: 0, heightQueries: 0, exposureQueries: 0, queryBudget: 0 } };
  const source = (x: number, z: number) => weather.sample(x, z, time);
  const tree = (enabled = true) => createElement(WeatherLayer, { enabled, metrics, sample: source, rain: { count: 20, density: 1 }, snow: { count: 12, density: 1 }, dust: { count: 10, density: 1 }, impacts: { count: 8, heightAt: () => 2, exposureAt: () => { impactQueries += 1; return 0; } } });
  await mounted(tree(), async (scene, frame, render) => {
    await frame();
    let meshes = weatherMeshes(scene);
    expect(meshes.map((mesh) => mesh.geometry.instanceCount)).toEqual([20, 0, 0, 8]);
    const sharedTime = meshes[0]!.material.uniforms.uTime;
    expect(meshes.every((mesh) => mesh.material.uniforms.uTime === sharedTime)).toBe(true);
    expect(sharedTime!.value).toBe(31);
    expect((meshes[0]!.material.uniforms.uWind!.value as THREE.Vector3).toArray()).toEqual([3, 0, 0]);
    expect(impactQueries).toBe(8);
    expect(metrics).toEqual({ rain: { count: 20, capacity: 20 }, snow: { count: 0, capacity: 12 }, dust: { count: 0, capacity: 10 }, impacts: { count: 8, capacity: 8, heightQueries: 8, exposureQueries: 8, queryBudget: 16 } });
    expect(meshes[3]!.geometry.getAttribute("aExposure").getX(0)).toBe(0);
    await frame();
    expect(sharedTime!.value).toBe(31);
    time = 40;
    await frame();
    expect(meshes.map((mesh) => mesh.geometry.instanceCount)).toEqual([0, 12, 0, 8]);
    await render(tree(false));
    await frame();
    expect(weatherMeshes(scene).length).toBe(0);
    expect(metrics.rain.count + metrics.snow.count + metrics.dust.count + metrics.impacts.count).toBe(0);
    time = 31;
    await render(tree());
    await frame();
    meshes = weatherMeshes(scene);
    expect(meshes[0]!.material.uniforms.uTime!.value).toBe(31);
    expect(meshes.map((mesh) => mesh.geometry.instanceCount)).toEqual([20, 0, 0, 8]);
  });
});

test("authored weather probe reports actual shader pools and retires with diagnostics", async () => {
  const { devtools } = await import("@jgengine/core/devtools/devtools");
  const { GameProvider } = await import("@jgengine/react/provider");
  const { createGameContext } = await import("@jgengine/core/runtime/gameContext");
  const { defineGameDefinition } = await import("@jgengine/core/game/defineGame");
  const { createEmptyEditorDocument } = await import("@jgengine/core/editor/document");
  const { AuthoredWeatherLayer } = await import("./AuthoredWeatherLayer.draw");
  const document = createEmptyEditorDocument();
  document.simulation = { weather: { ambient: { mode: "rain", intensity: 1 } } };
  const ctx = createGameContext({ definition: defineGameDefinition({ name: "Weather probe", authoredDocument: document, multiplayer: "off", persist: false }), content: {}, player: { userId: "observer", isNew: true } });
  const tree = (diagnostics: boolean) => createElement(GameProvider, { context: ctx }, createElement(AuthoredWeatherLayer, { document, diagnostics, rain: { count: 20, density: 1 }, snow: false, dust: false, heightAt: () => 0 }));
  await mounted(tree(true), async (_scene, frame, render) => {
    await frame();
    const probe = devtools.probes.read()["weatherParticles"] as WeatherParticleMetrics & { scope: string };
    expect(probe.scope).toBe("procedural-weather");
    expect(probe.rain).toEqual({ count: 20, capacity: 20 });
    expect(probe.snow).toEqual({ count: 0, capacity: 0 });
    expect(probe.impacts).toEqual({ count: 64, capacity: 64, heightQueries: 64, exposureQueries: 64, queryBudget: 128 });
    await render(tree(false));
    expect(devtools.probes.read()["weatherParticles"]).toBeUndefined();
  });
});
