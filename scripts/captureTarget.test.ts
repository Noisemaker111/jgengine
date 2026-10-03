import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureClickPoint, driveTargetUrl, externalCaptureUrl, parseCaptureDevice, requireReusableCaptureStorage } from "./captureTarget";
import { shotSidecarPath } from "./shotProvenance";
import { applyDevice, DEVICES, scaleProfile, screencastCapturesFully, type CdpSession } from "./browser-lib";

describe("shared drive device profiles", () => {
  test("validates shared device names before browser startup", () => {
    for (const device of Object.keys(DEVICES)) expect(parseCaptureDevice(device)).toBe(device);
    for (const invalid of [undefined, "phone", "both", "toString", "__proto__"]) {
      expect(() => parseCaptureDevice(invalid)).toThrow("--device must be");
    }
    for (const flags of [["--device"], ["--device", "phone"]]) {
      const result = spawnSync(process.execPath, ["scripts/drive-dev.ts", ...flags, "--help"], {
        cwd: import.meta.dir + "/..", encoding: "utf8", timeout: 5_000,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("--device must be");
    }
  });

  test("parsed phone profile drives the shared viewport, touch, and user agent protocol", async () => {
    const sent: { method: string; params: Record<string, unknown> }[] = [];
    const session = { async send(method: string, params: Record<string, unknown>) { sent.push({ method, params }); return {}; } } as unknown as CdpSession;
    const device = parseCaptureDevice("mobile");
    await applyDevice(session, device, "full");
    expect(sent.find((call) => call.method === "Emulation.setDeviceMetricsOverride")?.params)
      .toEqual({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    expect(sent.find((call) => call.method === "Emulation.setTouchEmulationEnabled")?.params).toEqual({ enabled: true, maxTouchPoints: 5 });
    expect(sent.find((call) => call.method === "Emulation.setUserAgentOverride")?.params.userAgent).toContain("iPhone");
    const profile = scaleProfile(DEVICES[device], "full");
    expect([profile.width * profile.deviceScaleFactor, profile.height * profile.deviceScaleFactor]).toEqual([780, 1688]);
    expect(screencastCapturesFully(profile)).toBe(false);
  });

  test("landscape and half size retain shared device semantics and native URL content", () => {
    const device = parseCaptureDevice("mobile-landscape");
    expect(scaleProfile(DEVICES[device], "half")).toEqual({ width: 422, height: 195, deviceScaleFactor: 2, mobile: true });
    for (const target of [{ url: "http://native/room?map=courtyard" }, { site: "/playground?map=courtyard" }, {}]) {
      const url = driveTargetUrl({ game: "co-op", mode: "play", device, ...target }, "http://runner");
      expect(url.searchParams.get("device")).toBe("mobile");
      if ("url" in target || "site" in target) expect(url.searchParams.get("map")).toBe("courtyard");
    }
  });
});

describe("external capture targets", () => {
  test("storage reuse requires an existing browser instead of a fresh disposable profile", () => {
    expect(() => requireReusableCaptureStorage(true, false, false)).toThrow("--connect <port>");
    expect(() => requireReusableCaptureStorage(true, true, false)).not.toThrow();
    expect(() => requireReusableCaptureStorage(true, false, true)).not.toThrow();
    expect(() => requireReusableCaptureStorage(false, false, false)).not.toThrow();
  });

  test("an unconnected storage reuse drive fails before server or browser startup, even with --keep", () => {
    const cwd = mkdtempSync(join(tmpdir(), "jg-reuse-no-daemon-"));
    try {
      for (const keep of [[], ["--keep"]]) {
        const result = spawnSync(process.execPath, [
          import.meta.dir + "/drive-dev.ts", "--url", "http://127.0.0.1:1", "--reuse-storage", ...keep,
        ], { cwd, env: { ...process.env, JG_CHROME_PORT: "1" }, encoding: "utf8", timeout: 5_000 });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("--reuse-storage requires a live warm browser");
        expect(result.stderr).toContain("--keep alone only preserves the new profile");
        expect(result.stderr).not.toContain("nothing is listening");
        expect(result.stderr).not.toContain("starting");
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("normalizes loopback and preserves the native document and query", () => {
    const native = externalCaptureUrl("http://localhost:5518/play?map=courtyard#room-2");
    const url = driveTargetUrl({ url: native, game: "url", mode: "play" }, "http://runner:4517");
    expect(url.toString()).toBe("http://127.0.0.1:5518/play?map=courtyard#room-2");
    expect(url.searchParams.has("game")).toBe(false);
    expect(url.searchParams.has("mode")).toBe(false);
  });

  test("preserves a native editor mode unless the drive explicitly overrides it", () => {
    const args = { url: "http://native/play?mode=editor", game: "url", mode: "play" };
    expect(driveTargetUrl(args, "http://runner").searchParams.get("mode")).toBe("editor");
    expect(driveTargetUrl({ ...args, modeExplicit: true }, "http://runner").searchParams.get("mode")).toBe("play");
  });

  test("keeps managed game and website targeting", () => {
    expect(driveTargetUrl({ game: "probe", mode: "editor" }, "http://runner:4517").toString())
      .toBe("http://runner:4517/?game=probe&mode=editor");
    expect(driveTargetUrl({ game: "site", mode: "play", site: "playground?inspect=1" }, "http://runner:5517").toString())
      .toBe("http://runner:5517/playground?inspect=1");
  });

  test("rejects missing, malformed, unsupported, and conflicting targets", () => {
    for (const raw of [undefined, "--rpc", "native-game", "file:///tmp/game.html"]) {
      expect(() => externalCaptureUrl(raw)).toThrow("--url requires");
    }
    expect(() => driveTargetUrl({ game: "url", mode: "play", url: "http://native", site: "/" }, "http://runner"))
      .toThrow("pass one");
  });

  test("drive rejects unknown flags and clock-resetting recordings before startup", () => {
    for (const args of [
      ["--urll", "http://127.0.0.1:5518"],
      ["--url", "http://127.0.0.1:5518", "--record", "restore", "--reload"],
      ["probe", "--url", "http://127.0.0.1:5518"],
    ]) {
      const result = spawnSync(process.execPath, ["scripts/drive-dev.ts", ...args], {
        cwd: import.meta.dir + "/..", encoding: "utf8", timeout: 5_000,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/unknown option|cannot reset the clock|omit the game id/);
      expect(result.stderr).not.toContain("starting");
    }
  });

  test("an unavailable external server fails both commands and removes planned stale evidence", () => {
    const listener = Bun.serve({ port: 0, fetch: () => new Response("ready") });
    const url = `http://127.0.0.1:${listener.port}`;
    listener.stop(true);
    const dir = mkdtempSync(join(tmpdir(), "jg-native-stale-"));
    try {
      for (const script of ["drive-dev", "shoot-dev"]) {
        const out = join(dir, `${script}.png`);
        const sidecar = shotSidecarPath(out);
        writeFileSync(out, "prior capture");
        writeFileSync(sidecar, "{}");
        const result = spawnSync(process.execPath, [
          `scripts/${script}.ts`, "--url", url, "--timeout", "1",
          script === "drive-dev" ? "--shot" : "--out", out,
        ], {
          cwd: import.meta.dir + "/..", encoding: "utf8", timeout: 5_000,
        });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("start that external server first");
        expect(result.stderr).not.toContain("starting");
        expect(existsSync(out)).toBe(false);
        expect(existsSync(sidecar)).toBe(false);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

type Node = ReturnType<Parameters<typeof captureClickPoint>[0]["querySelectorAll"]>[number];

function node(text: string, label: string | null = null, top = 20, interactive = true): Node {
  return {
    textContent: text,
    getAttribute: () => label,
    matches: () => interactive,
    getBoundingClientRect: () => ({ left: 20, top, width: 100, height: 30 }),
  };
}

function document(nodes: Node[]) {
  return { querySelectorAll: () => nodes, defaultView: { innerWidth: 800, innerHeight: 450 } };
}

describe("native click diagnostics", () => {
  test("matches an exact aria-label even when the button has visible icon text", () => {
    const point = captureClickPoint(document([node("Settings panel", null, 20, false), node("⚙", "Settings", 80)]), "Settings");
    expect(point).toEqual({ x: 70, y: 95, offscreen: false });
  });

  test("prefers the interactive exact match over its wrapper", () => {
    expect(captureClickPoint(document([node("Drop Weight", null, 20, false), node("Drop Weight", null, 80)]), "Drop Weight"))
      .toEqual({ x: 70, y: 95, offscreen: false });
  });

  test("reports a clipped exact target instead of clicking its visible ancestor", () => {
    expect(captureClickPoint(document([node("Drop Weight", null, -50), node("Hold Drop Weight", null, 20, false)]), "Drop Weight"))
      .toEqual({ x: 70, y: -35, offscreen: true });
    expect(captureClickPoint(document([node("Drop Weight", null, 450)]), "Drop Weight")?.offscreen).toBe(true);
  });

  test("returns no match for absent controls and serializes into the native page", () => {
    expect(captureClickPoint(document([]), "Drop Weight")).toBeNull();
    const serialized = new Function(`return (${captureClickPoint.toString()})`)() as typeof captureClickPoint;
    expect(serialized(document([node("Begin expedition")]), "Begin expedition"))
      .toEqual({ x: 70, y: 35, offscreen: false });
  });
});
