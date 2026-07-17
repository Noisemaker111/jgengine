import { describe, expect, test } from "bun:test";

import {
  classifyAssetResponse,
  readByteSignature,
  type AssetByteSignature,
} from "./assetDiagnostics";

function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i);
  return out;
}

const GLB_HEADER = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]); // "glTF" + version 2

describe("readByteSignature", () => {
  const cases: [string, Uint8Array, AssetByteSignature][] = [
    ["glb magic", GLB_HEADER, "glb"],
    ["gltf-json leading brace", ascii('{"asset":{"version":"2.0"}}'), "gltf-json"],
    ["gltf-json with BOM + whitespace", new Uint8Array([0xef, 0xbb, 0xbf, 0x20, 0x20, 0x0a, 0x7b]), "gltf-json"],
    ["html doctype", ascii("<!doctype html><html>"), "html"],
    ["html bare tag", ascii("<html><head>"), "html"],
    ["png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "png"],
    ["jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "jpeg"],
    ["zip", new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "zip"],
    ["empty", new Uint8Array([]), "empty"],
    ["garbage", new Uint8Array([0x00, 0x01, 0x02, 0x03]), "unknown"],
  ];
  for (const [name, bytes, expected] of cases) {
    test(name, () => {
      expect(readByteSignature(bytes)).toBe(expected);
    });
  }
});

describe("classifyAssetResponse", () => {
  test("a served GLB is ok", () => {
    const d = classifyAssetResponse({ url: "/models/pack/Tree.glb", logicalId: "pack/Tree", status: 200, bytes: GLB_HEADER });
    expect(d.kind).toBe("ok");
    expect(d.ok).toBe(true);
    expect(d.byteSignature).toBe("glb");
  });

  test("a glTF-JSON body is ok", () => {
    const d = classifyAssetResponse({ url: "/models/pack/scene.gltf", status: 200, bytes: ascii("{\n  \"asset\": {} }") });
    expect(d.kind).toBe("ok");
  });

  test("a 404 is missing and names the asset + url", () => {
    const d = classifyAssetResponse({
      url: "/models/kaykit-adventurers/Barbarian.glb",
      logicalId: "kaykit-adventurers/Barbarian",
      status: 404,
      statusText: "Not Found",
    });
    expect(d.kind).toBe("missing");
    expect(d.ok).toBe(false);
    expect(d.message).toContain("kaykit-adventurers/Barbarian");
    expect(d.message).toContain("/models/kaykit-adventurers/Barbarian.glb");
    expect(d.message).toContain("404");
  });

  test("status 0 (network failure) is missing", () => {
    expect(classifyAssetResponse({ url: "/x.glb", status: 0 }).kind).toBe("missing");
  });

  test("an HTML fallback page (200) is html, not corrupt", () => {
    const d = classifyAssetResponse({
      url: "/models/missing/Prop.glb",
      logicalId: "missing/Prop",
      status: 200,
      contentType: "text/html; charset=utf-8",
      bytes: ascii("<!doctype html><html><body>Cannot GET</body></html>"),
    });
    expect(d.kind).toBe("html");
    expect(d.message.toLowerCase()).toContain("html page");
    expect(d.message).toContain("missing/Prop");
  });

  test("html content-type with no readable bytes still flags html", () => {
    const d = classifyAssetResponse({ url: "/x.glb", status: 200, contentType: "text/html" });
    expect(d.kind).toBe("html");
  });

  test("a PNG served in place of a model is unsupported", () => {
    const d = classifyAssetResponse({
      url: "/models/pack/icon.glb",
      status: 200,
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    });
    expect(d.kind).toBe("unsupported");
    expect(d.message).toContain("png");
  });

  test("an empty 200 body is corrupt", () => {
    const d = classifyAssetResponse({ url: "/x.glb", status: 200, bytes: new Uint8Array([]) });
    expect(d.kind).toBe("corrupt");
  });

  test("unrecognizable bytes are corrupt", () => {
    const d = classifyAssetResponse({ url: "/x.glb", status: 200, bytes: new Uint8Array([0x00, 0x01, 0x02, 0x03]) });
    expect(d.kind).toBe("corrupt");
  });

  test("logical id is omitted from the message when unknown but url is always present", () => {
    const d = classifyAssetResponse({ url: "/x.glb", status: 404 });
    expect(d.logicalId).toBeUndefined();
    expect(d.message).toContain("/x.glb");
  });
});
