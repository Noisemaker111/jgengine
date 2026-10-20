import { afterEach, describe, expect, test } from "bun:test";
import * as THREE from "three";

import { applyMaterialOverrideToMaterial } from "../materialOverride";
import { cloneModelScene } from "./modelRender";
import { applyModelSurface, configureModelSurface, materialSurfaceLevel } from "./modelSurface";

function sceneWith(...materials: THREE.Material[]): THREE.Group {
  const root = new THREE.Group();
  for (const material of materials) root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  return root;
}

function compile(material: THREE.Material, base: "physical" | "standard" = "physical") {
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib[base].vertexShader,
    fragmentShader: THREE.ShaderLib[base].fragmentShader,
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, undefined as unknown as THREE.WebGLRenderer);
  return shader;
}

afterEach(() => configureModelSurface(true, "full"));

describe("applyModelSurface", () => {
  test("normalizes exported glossy and default-metal params into the painted range", () => {
    const glossy = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0 });
    const exporterDefault = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 1 });
    applyModelSurface(sceneWith(glossy, exporterDefault));
    expect(glossy.roughness).toBeCloseTo(0.775);
    expect(glossy.envMapIntensity).toBe(0.8);
    expect(exporterDefault.metalness).toBe(0.1);
    applyModelSurface(sceneWith(glossy));
    expect(glossy.roughness).toBeCloseTo(0.775);
  });

  test("leaves normal-mapped, cutout, transparent and non-standard materials alone", () => {
    const mapped = new THREE.MeshStandardMaterial({ roughness: 0.5, normalMap: new THREE.Texture() });
    const cutout = new THREE.MeshStandardMaterial({ roughness: 0.5, alphaTest: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ roughness: 0.5, transparent: true });
    const basic = new THREE.MeshBasicMaterial();
    applyModelSurface(sceneWith(mapped, cutout, glass, basic));
    for (const material of [mapped, cutout, glass]) {
      expect(material.roughness).toBe(0.5);
      expect(material.onBeforeCompile).toBe(THREE.Material.prototype.onBeforeCompile);
    }
  });

  test("shares one cache key per level and injects the detail chunks", () => {
    const a = new THREE.MeshStandardMaterial({ color: "#c33" });
    const b = new THREE.MeshPhysicalMaterial({ color: "#3c3" });
    applyModelSurface(sceneWith(a, b));
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
    const full = compile(a);
    expect(full.fragmentShader).toContain("jgSurfNoise");
    expect(full.fragmentShader).toContain("jgGrad");
    expect(full.vertexShader).toContain("vJgSurfPos = transformed");
    expect(full.vertexShader).toContain("#include <skinning_vertex>");

    configureModelSurface(true, "lite");
    expect(a.customProgramCacheKey()).toContain("lite");
    const lite = compile(a, "standard");
    expect(lite.fragmentShader).toContain("jgWear");
    expect(lite.fragmentShader).not.toContain("jgGrad");
  });

  test("tier change flags compiled materials for recompilation; game opt-out compiles plain", () => {
    const material = new THREE.MeshStandardMaterial();
    applyModelSurface(sceneWith(material));
    compile(material);
    const version = material.version;
    configureModelSurface(false, "full");
    expect(material.version).toBeGreaterThan(version);
    expect(materialSurfaceLevel(material)).toBe("off");
    expect(compile(material).fragmentShader).not.toContain("jgSurf");

    const later = new THREE.MeshStandardMaterial({ roughness: 0.5 });
    applyModelSurface(sceneWith(later));
    expect(later.roughness).toBe(0.5);
  });
});

describe("per-model opt-out and overrides", () => {
  test("a clone with surfaceDetail false restores exported params and compiles plain", () => {
    const source = sceneWith(new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 1 }));
    applyModelSurface(source);
    const clone = cloneModelScene(source, { surfaceDetail: false });
    const material = (clone.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(material.roughness).toBe(0.4);
    expect(material.metalness).toBe(1);
    expect(materialSurfaceLevel(material)).toBe("off");
    const shared = (cloneModelScene(source).children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(materialSurfaceLevel(shared)).toBe("full");
  });

  test("an explicit override wins and a rim keeps following the live level", () => {
    const material = new THREE.MeshStandardMaterial({ roughness: 0.5 });
    applyModelSurface(sceneWith(material));
    const target = applyMaterialOverrideToMaterial(material, { roughness: 0.2, rim: { strength: 0.5 } }, true, undefined) as THREE.MeshStandardMaterial;
    expect(target.roughness).toBe(0.2);
    expect(target.customProgramCacheKey()).toContain("jg-surface:v1:full");
    configureModelSurface(true, "lite");
    expect(target.customProgramCacheKey()).toContain("jg-surface:v1:lite");
  });
});
