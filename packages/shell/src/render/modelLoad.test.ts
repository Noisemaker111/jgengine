import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

import type { AssetLoadDiagnosis } from "@jgengine/core/scene/assetDiagnostics";

import { createFallbackModel, handleModelLoadFailure, probeModelUrl } from "./modelLoad";

function stubResponse(body: Uint8Array, init: { status?: number; contentType?: string; statusText?: string }): Response {
  return new Response(body, {
    status: init.status ?? 200,
    statusText: init.statusText ?? "",
    headers: init.contentType === undefined ? undefined : { "content-type": init.contentType },
  });
}

function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i);
  return out;
}

const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]);

describe("probeModelUrl", () => {
  test("a served GLB probes ok", async () => {
    const diagnosis = await probeModelUrl(
      "/models/pack/Tree.glb",
      "pack/Tree",
      (async () => stubResponse(GLB, { status: 200 })) as unknown as typeof fetch,
    );
    expect(diagnosis.ok).toBe(true);
    expect(diagnosis.kind).toBe("ok");
  });

  test("a dev-server HTML fallback probes as html and names the asset", async () => {
    const diagnosis = await probeModelUrl(
      "/models/missing/Prop.glb",
      "missing/Prop",
      (async () =>
        stubResponse(ascii("<!doctype html><html><body>Cannot GET</body></html>"), {
          status: 200,
          contentType: "text/html; charset=utf-8",
        })) as unknown as typeof fetch,
    );
    expect(diagnosis.kind).toBe("html");
    expect(diagnosis.message).toContain("missing/Prop");
    expect(diagnosis.message).toContain("/models/missing/Prop.glb");
  });

  test("a 404 probes as missing", async () => {
    const diagnosis = await probeModelUrl(
      "/models/x.glb",
      undefined,
      (async () => stubResponse(ascii("not found"), { status: 404, statusText: "Not Found" })) as unknown as typeof fetch,
    );
    expect(diagnosis.kind).toBe("missing");
  });

  test("a fetch that throws degrades to a missing diagnosis instead of throwing", async () => {
    const diagnosis = await probeModelUrl(
      "/models/x.glb",
      undefined,
      (async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    );
    expect(diagnosis.kind).toBe("missing");
    expect(diagnosis.ok).toBe(false);
  });
});

describe("createFallbackModel", () => {
  test("produces a mountable GLTF whose scene is a single placeholder primitive", () => {
    const gltf = createFallbackModel();
    expect(gltf.scene).toBeInstanceOf(THREE.Group);
    const meshes: THREE.Mesh[] = [];
    gltf.scene.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
    });
    expect(meshes.length).toBe(1);
    expect(meshes[0]!.geometry).toBeInstanceOf(THREE.BufferGeometry);
    expect(gltf.animations).toEqual([]);
    expect(gltf.userData.jgengineFallback).toBe(true);
  });

  test("stashes the diagnosis on userData for debugging", () => {
    const diagnosis: AssetLoadDiagnosis = {
      kind: "html",
      ok: false,
      url: "/models/missing/Prop.glb",
      byteSignature: "html",
      message: "missing",
    };
    expect(createFallbackModel(diagnosis).userData.jgengineDiagnosis).toBe(diagnosis);
  });
});

describe("handleModelLoadFailure", () => {
  const htmlDiagnosis: AssetLoadDiagnosis = {
    kind: "html",
    ok: false,
    url: "/models/missing/Prop.glb",
    byteSignature: "html",
    message: 'Asset "/models/missing/Prop.glb" resolved to an HTML page, not a model.',
  };

  test("an HTML-instead-of-GLB response resolves to a fallback primitive and never calls onError", async () => {
    let loaded: GLTF | null = null;
    let errored = false;
    const warnings: string[] = [];
    await handleModelLoadFailure(
      "/models/missing/Prop.glb",
      new Error("Unexpected token < in JSON"),
      (gltf) => {
        loaded = gltf;
      },
      () => {
        errored = true;
      },
      { probe: async () => htmlDiagnosis, warn: (m) => warnings.push(m) },
    );
    expect(errored).toBe(false);
    expect(loaded).not.toBeNull();
    expect((loaded as unknown as GLTF).scene).toBeInstanceOf(THREE.Group);
    expect((loaded as unknown as GLTF).userData.jgengineFallback).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("HTML page");
  });

  test("a 404 (missing) response also resolves to the fallback primitive", async () => {
    let loaded = false;
    let errored = false;
    await handleModelLoadFailure(
      "/models/x.glb",
      new Error("parse failed"),
      () => {
        loaded = true;
      },
      () => {
        errored = true;
      },
      {
        probe: async () => ({ kind: "missing", ok: false, url: "/models/x.glb", byteSignature: "empty", message: "gone" }),
        warn: () => {},
      },
    );
    expect(loaded).toBe(true);
    expect(errored).toBe(false);
  });

  test("a genuine parse error over valid-looking bytes is surfaced through onError, not swallowed", async () => {
    let loaded = false;
    let erroredWith: unknown = null;
    const original = new Error("draco decode failed");
    await handleModelLoadFailure(
      "/models/real.glb",
      original,
      () => {
        loaded = true;
      },
      (event) => {
        erroredWith = event;
      },
      {
        probe: async () => ({ kind: "ok", ok: true, url: "/models/real.glb", byteSignature: "glb", message: "ok" }),
        warn: () => {},
      },
    );
    expect(loaded).toBe(false);
    expect(erroredWith).toBe(original);
  });
});
