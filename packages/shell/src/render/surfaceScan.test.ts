import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as THREE from "three";

import { applyMaterialOverrideToMaterial } from "../materialOverride";
import { configureModelScan } from "./modelScan";
import { SURFACE_SCAN_PARS_GLSL, surfaceScanDefines, surfaceScanKeyPart, surfaceScanUniforms } from "./surfaceScanShader";
import { acquireSurfaceScan, setSurfaceScanLoader, surfaceScanKey } from "./surfaceScanTextures";

const MAPS = { color: "/m/a/color.jpg", normal: "/m/a/normal.jpg", roughness: "/m/a/roughness.jpg" };

/** A loader that records requests and lets the test resolve or fail each URL. */
function fakeLoader() {
  const pending = new Map<string, { onLoad: (texture: THREE.Texture) => void; onError: () => void }>();
  const requested: string[] = [];
  setSurfaceScanLoader((url, onLoad, onError) => {
    requested.push(url);
    pending.set(url, { onLoad, onError });
  });
  return {
    requested,
    resolveAll() {
      for (const [url, handlers] of [...pending]) {
        pending.delete(url);
        handlers.onLoad(new THREE.Texture());
      }
    },
    fail(url: string) {
      const handlers = pending.get(url);
      pending.delete(url);
      handlers?.onError();
    },
  };
}

function compile(material: THREE.Material): { vertexShader: string; fragmentShader: string; uniforms: Record<string, unknown> } {
  const shader = { vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader as unknown as { vertexShader: string; fragmentShader: string; uniforms: Record<string, unknown> };
}

afterEach(() => {
  setSurfaceScanLoader(null);
  configureModelScan(true);
});

describe("surface scan textures", () => {
  test("holders of the same maps share one decode and the last release frees it", () => {
    const loader = fakeLoader();
    let ready = 0;
    const a = acquireSurfaceScan(MAPS, () => (ready += 1));
    const b = acquireSurfaceScan(MAPS, () => (ready += 1));
    expect(loader.requested).toEqual([MAPS.color, MAPS.normal, MAPS.roughness]);
    expect(a.current()).toBeNull();
    loader.resolveAll();
    expect(ready).toBe(2);
    const textures = a.current()!;
    expect(textures.color.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(textures.normal.colorSpace).toBe(THREE.NoColorSpace);
    expect(textures.color.wrapS).toBe(THREE.RepeatWrapping);
    expect(b.current()).toBe(textures);
    let disposed = 0;
    textures.color.addEventListener("dispose", () => (disposed += 1));
    a.release();
    expect(disposed).toBe(0);
    b.release();
    expect(disposed).toBe(1);
    // A fresh holder after the last release decodes again.
    acquireSurfaceScan(MAPS, () => {}).release();
    expect(loader.requested.length).toBe(6);
  });

  test("a map that fails to load leaves the scan null and warns once", () => {
    const loader = fakeLoader();
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    let changes = 0;
    const handle = acquireSurfaceScan({ color: "/m/b/color.jpg", normal: "/m/b/normal.jpg" }, () => (changes += 1));
    loader.fail("/m/b/normal.jpg");
    loader.resolveAll();
    expect(handle.current()).toBeNull();
    expect(changes).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("/m/b/normal.jpg");
    warn.mockRestore();
    handle.release();
  });

  test("the key names every map role, so two scans differing in one map never share", () => {
    expect(surfaceScanKey(MAPS)).not.toBe(surfaceScanKey({ ...MAPS, roughness: "/m/a/other.jpg" }));
    expect(surfaceScanKey({ color: "c", normal: "n" })).toBe("color:c|normal:n");
  });
});

describe("surface scan shader", () => {
  test("blend settings clamp to what the shader can draw", () => {
    const uniforms = surfaceScanUniforms({ repeat: 0, strength: 3, tint: -1 }, null);
    expect(uniforms.uScanRepeat.value).toBe(0.01);
    expect(uniforms.uScanStrength.value).toBe(1);
    expect(uniforms.uScanTint.value).toBe(0);
    expect(uniforms.uScanColor.value).toBeNull();
  });

  test("defines and cache key follow the optional maps", () => {
    const base = { color: new THREE.Texture(), normal: new THREE.Texture() };
    expect(surfaceScanDefines(base)).toEqual({ JG_SCAN: "" });
    expect(surfaceScanDefines({ ...base, roughness: new THREE.Texture(), ao: new THREE.Texture() })).toEqual({ JG_SCAN: "", JG_SCAN_ROUGH: "", JG_SCAN_AO: "" });
    expect(surfaceScanKeyPart(null)).toBe("noscan");
    expect(surfaceScanKeyPart(base)).toBe("scan");
    expect(surfaceScanKeyPart({ ...base, ao: new THREE.Texture() })).toBe("scan-ao");
    expect(SURFACE_SCAN_PARS_GLSL.trim().startsWith("#ifdef JG_SCAN")).toBe(true);
  });
});

describe("model material scan", () => {
  test("compiles without the scan until the maps arrive, then projects it triplanar", () => {
    const loader = fakeLoader();
    const source = new THREE.MeshStandardMaterial({ color: "#ff8800" });
    const target = applyMaterialOverrideToMaterial(source, { scan: { maps: MAPS, repeat: 2, tint: 0 } }, true, undefined) as THREE.MeshStandardMaterial;
    expect(target).not.toBe(source);
    const before = target.customProgramCacheKey();
    expect(before).toContain("jg-scan:noscan");
    expect(compile(target).fragmentShader).not.toContain("JG_SCAN");

    loader.resolveAll();
    const after = target.customProgramCacheKey();
    expect(after).not.toBe(before);
    expect(after).toContain("jg-scan:scan-r");
    const shader = compile(target);
    expect(shader.fragmentShader.startsWith("#define JG_SCAN\n#define JG_SCAN_ROUGH")).toBe(true);
    expect(shader.vertexShader).toContain("vJgScnPos = transformed * jgScnS;");
    expect(shader.fragmentShader).toContain("jgScanAlbedo(diffuseColor.rgb");
    expect((shader.uniforms["uScanTint"] as { value: number }).value).toBe(0);
    expect((shader.uniforms["uScanRepeat"] as { value: number }).value).toBe(2);
    target.dispose();
  });

  test("the low tier turns scans off without losing them", () => {
    const loader = fakeLoader();
    const target = applyMaterialOverrideToMaterial(new THREE.MeshStandardMaterial(), { scan: { maps: MAPS } }, true, undefined);
    loader.resolveAll();
    configureModelScan(false);
    expect(target.customProgramCacheKey()).toContain("jg-scan:off");
    expect(compile(target).fragmentShader).not.toContain("JG_SCAN");
    configureModelScan(true);
    expect(compile(target).fragmentShader).toContain("#define JG_SCAN");
    target.dispose();
  });

  test("disposing the material releases its hold on the shared maps", () => {
    const loader = fakeLoader();
    const target = applyMaterialOverrideToMaterial(new THREE.MeshStandardMaterial(), { scan: { maps: MAPS } }, true, undefined);
    loader.resolveAll();
    const shared = acquireSurfaceScan(MAPS, () => {});
    const color = shared.current()!.color;
    let disposed = 0;
    color.addEventListener("dispose", () => (disposed += 1));
    target.dispose();
    expect(disposed).toBe(0);
    shared.release();
    expect(disposed).toBe(1);
  });
});
