import { describe, expect, test } from "bun:test";

import { probeModelUrl } from "./modelLoad";

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
