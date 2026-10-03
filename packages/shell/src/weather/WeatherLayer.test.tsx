import { expect, test } from "bun:test";
import { act, createRoot, extend } from "@react-three/fiber";
import { createElement, type ReactElement } from "react";
import * as THREE from "three";
import { createAuthoredWeather } from "@jgengine/core/world/authoredWeather";
import type { WeatherParticleMetrics } from "./weatherUniforms";
import { WeatherLayer } from "./WeatherLayer";

async function mounted(element: ReactElement, run: (scene: THREE.Scene, frame: () => void, render: (next: ReactElement) => Promise<void>) => Promise<void>) {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  extend(THREE);
  const root = createRoot({} as HTMLCanvasElement);
  await root.configure({ frameloop: "never", camera: new THREE.PerspectiveCamera(), size: { width: 800, height: 450, top: 0, left: 0 }, dpr: 1,
    gl: () => ({ render() {}, setSize() {}, setPixelRatio() {} }) as unknown as THREE.WebGLRenderer });
  try {
    let frame = (): void => {};
    let scene!: THREE.Scene;
    const render = async (next: ReactElement) => act(async () => {
      const store = root.render(next);
      scene = store.getState().scene;
      frame = () => store.getState().advance(0, true);
    });
    await render(element);
    await run(scene, () => frame(), render);
  } finally {
    await act(async () => root.unmount());
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
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
    frame();
    let meshes = weatherMeshes(scene);
    expect(meshes.map((mesh) => mesh.geometry.instanceCount)).toEqual([20, 0, 0, 8]);
    const sharedTime = meshes[0]!.material.uniforms.uTime;
    expect(meshes.every((mesh) => mesh.material.uniforms.uTime === sharedTime)).toBe(true);
    expect(sharedTime!.value).toBe(31);
    expect((meshes[0]!.material.uniforms.uWind!.value as THREE.Vector3).toArray()).toEqual([3, 0, 0]);
    expect(impactQueries).toBe(8);
    expect(metrics).toEqual({ rain: { count: 20, capacity: 20 }, snow: { count: 0, capacity: 12 }, dust: { count: 0, capacity: 10 }, impacts: { count: 8, capacity: 8, heightQueries: 8, exposureQueries: 8, queryBudget: 16 } });
    expect(meshes[3]!.geometry.getAttribute("aExposure").getX(0)).toBe(0);
    frame();
    expect(sharedTime!.value).toBe(31);
    time = 40;
    frame();
    expect(meshes.map((mesh) => mesh.geometry.instanceCount)).toEqual([0, 12, 0, 8]);
    await render(tree(false));
    frame();
    expect(weatherMeshes(scene).length).toBe(0);
    expect(metrics.rain.count + metrics.snow.count + metrics.dust.count + metrics.impacts.count).toBe(0);
    time = 31;
    await render(tree());
    frame();
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
  const { AuthoredWeatherLayer } = await import("./AuthoredWeatherLayer");
  const document = createEmptyEditorDocument();
  document.simulation = { weather: { ambient: { mode: "rain", intensity: 1 } } };
  const ctx = createGameContext({ definition: defineGameDefinition({ name: "Weather probe", authoredDocument: document, multiplayer: "off", persist: false }), content: {}, player: { userId: "observer", isNew: true } });
  const tree = (diagnostics: boolean) => createElement(GameProvider, { context: ctx }, createElement(AuthoredWeatherLayer, { document, diagnostics, rain: { count: 20, density: 1 }, snow: false, dust: false, heightAt: () => 0 }));
  await mounted(tree(true), async (_scene, frame, render) => {
    frame();
    const probe = devtools.probes.read()["weatherParticles"] as WeatherParticleMetrics & { scope: string };
    expect(probe.scope).toBe("procedural-weather");
    expect(probe.rain).toEqual({ count: 20, capacity: 20 });
    expect(probe.snow).toEqual({ count: 0, capacity: 0 });
    expect(probe.impacts).toEqual({ count: 64, capacity: 64, heightQueries: 64, exposureQueries: 64, queryBudget: 128 });
    await render(tree(false));
    expect(devtools.probes.read()["weatherParticles"]).toBeUndefined();
  });
});
