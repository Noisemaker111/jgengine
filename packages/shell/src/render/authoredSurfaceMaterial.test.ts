import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { authoredSurfaceTextures, configureAuthoredSurface } from "./authoredSurfaceMaterial";

describe("authored PBR surface", () => {
  test("physical color maps use sRGB while numeric maps stay linear on independently owned views", () => {
    const source = new THREE.Texture();
    const roles = ["color", "emissive", "sheenColor", "specularColor", "normal", "roughness", "metalness", "ao", "alpha", "height", "sheenRoughness", "anisotropy", "clearcoat", "clearcoatRoughness", "clearcoatNormal", "specularIntensity", "transmission", "thickness", "iridescence", "iridescenceThickness"];
    const textures = authoredSurfaceTextures(Object.fromEntries(roles.map(role => [role, `${role}.png`])), roles.map(() => source));
    const views = Object.values(textures);
    expect(new Set(views).size).toBe(roles.length);
    for (const role of ["color", "emissive", "sheenColor", "specularColor"] as const) expect(textures[role]!.colorSpace).toBe(THREE.SRGBColorSpace);
    for (const role of ["normal", "roughness", "metalness", "ao", "alpha", "height", "sheenRoughness", "anisotropy", "clearcoat", "clearcoatRoughness", "clearcoatNormal", "specularIntensity", "transmission", "thickness", "iridescence", "iridescenceThickness"] as const) expect(textures[role]!.colorSpace).toBe(THREE.NoColorSpace);
    const material = new THREE.MeshPhysicalMaterial();
    configureAuthoredSurface(material, { sheen: 0.6, specularIntensity: 0.7 }, textures, "box");
    expect(material.sheenColorMap).toBe(textures.sheenColor!);
    expect(material.specularColorMap).toBe(textures.specularColor!);
    expect(source.colorSpace).toBe(THREE.NoColorSpace);
    expect(source.wrapS).toBe(THREE.ClampToEdgeWrapping);
    let sourceDisposed = 0, viewsDisposed = 0;
    source.addEventListener("dispose", () => sourceDisposed++);
    for (const view of views) {
      expect(view).not.toBe(source);
      view.addEventListener("dispose", () => viewsDisposed++);
      view.dispose();
    }
    material.dispose();
    expect(viewsDisposed).toBe(roles.length);
    expect(sourceDisposed).toBe(0);
  });

  test("owns sampler/color-space clones without changing cached maps", () => {
    const source = new THREE.Texture();
    const textures = authoredSurfaceTextures({ color: "a", normal: "b", emissive: "c", roughness: "d" }, [source, source, source, source], { wrapping: "mirror", anisotropy: 4 });
    expect(textures.color).not.toBe(source);
    expect(textures.color!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(textures.emissive!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(textures.normal!.colorSpace).toBe(THREE.NoColorSpace);
    expect(textures.roughness!.colorSpace).toBe(THREE.NoColorSpace);
    expect(textures.normal!.wrapS).toBe(THREE.MirroredRepeatWrapping);
    expect(textures.color!.anisotropy).toBe(4);
    expect(source.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(source.colorSpace).toBe(THREE.NoColorSpace);
    let sourceDisposed = 0;
    source.addEventListener("dispose", () => sourceDisposed++);
    Object.values(textures).forEach(texture => texture.dispose());
    expect(sourceDisposed).toBe(0);
  });

  test("composes metre UVs with rim shading, all map roles and physical normal scale", () => {
    const material = new THREE.MeshStandardMaterial();
    const normal = new THREE.Texture();
    configureAuthoredSurface(material, { color: "#123456", repeatMetres: 1.2, normalScale: [0.22, 0.3], rim: { color: "#654321", strength: 0.4 }, transparent: true, opacity: 0.7, depthWrite: false }, { normal }, "box");
    expect(material.normalMap).toBe(normal);
    expect(material.normalScale.toArray()).toEqual([0.22, 0.3]);
    expect(material.opacity).toBe(0.7);
    expect(material.depthWrite).toBe(false);
    const shader = { uniforms: {}, vertexShader: "#include <uv_vertex>", fragmentShader: "#include <common>\n#include <opaque_fragment>" };
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain("modelMatrix * instanceMatrix");
    expect(shader.vertexShader).toContain("vDisplacementMapUv *= surfaceRepeat");
    expect(shader.fragmentShader).toContain("uJgRimColor");
    expect(material.customProgramCacheKey()).toContain("authored-surface:box:1.2");
    const cylinder = new THREE.MeshStandardMaterial();
    configureAuthoredSurface(cylinder, { repeatMetres: 2 }, {}, "cylinder");
    const cylinderShader = { ...shader, vertexShader: "#include <uv_vertex>" };
    cylinder.onBeforeCompile(cylinderShader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(cylinderShader.vertexShader).toContain("6.28318530718");
    expect(cylinder.customProgramCacheKey()).not.toBe(material.customProgramCacheKey());
    expect(() => configureAuthoredSurface(material, { repeatMetres: 0 }, {}, "box")).toThrow();
    expect(() => configureAuthoredSurface(material, { normalScale: [NaN, 1] }, {}, "box")).toThrow();
    material.dispose(); cylinder.dispose(); normal.dispose();
  });
});

test("mounted textured surfaces dispose clones on retune/unmount and retain loader-cached maps", async () => {
  const { act, createRoot } = await import("@react-three/fiber");
  const { createElement, Suspense } = await import("react");
  const { useAuthoredSurfaceMaterial } = await import("./authoredSurfaceMaterial");
  const source = new THREE.Texture();
  let sourceDisposals = 0;
  source.addEventListener("dispose", () => sourceDisposals++);
  const originalLoad = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = (_url, onLoad) => { onLoad?.(source); return source; };
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot({} as HTMLCanvasElement);
  await root.configure({ frameloop: "never", size: { width: 100, height: 100, top: 0, left: 0 }, dpr: 1,
    gl: () => ({ render() {}, setSize() {}, setPixelRatio() {} }) as unknown as THREE.WebGLRenderer });
  let material!: THREE.MeshStandardMaterial;
  function Surface({ color }: { color: string }) {
    material = useAuthoredSurfaceMaterial({ color, maps: { color: "test-owned-surface-color.png", normal: "test-owned-surface-normal.png" } });
    return createElement("primitive", { object: material });
  }
  const render = async (color: string) => act(async () => root.render(createElement(Suspense, { fallback: null }, createElement(Surface, { color }))));
  try {
    await render("#ffffff");
    const first = material;
    expect(first.map).not.toBe(source);
    expect(first.normalMap).not.toBe(source);
    let released = 0;
    first.addEventListener("dispose", () => released++);
    first.map!.addEventListener("dispose", () => released++);
    first.normalMap!.addEventListener("dispose", () => released++);
    await render("#ffffff");
    expect(material).toBe(first);
    await render("#123456");
    expect(material).not.toBe(first);
    expect(released).toBe(3);
    let lastReleased = 0;
    material.addEventListener("dispose", () => lastReleased++);
    material.map!.addEventListener("dispose", () => lastReleased++);
    material.normalMap!.addEventListener("dispose", () => lastReleased++);
    await act(async () => root.render(null));
    expect(lastReleased).toBe(3);
    expect(sourceDisposals).toBe(0);
    expect(source.colorSpace).toBe(THREE.NoColorSpace);
    expect(source.wrapS).toBe(THREE.ClampToEdgeWrapping);
  } finally {
    await act(async () => root.unmount());
    THREE.TextureLoader.prototype.load = originalLoad;
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
