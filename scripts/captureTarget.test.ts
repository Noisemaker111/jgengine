import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureClickPoint, driveTargetUrl, externalCaptureUrl } from "./captureTarget";
import { shotSidecarPath } from "./shotProvenance";

describe("external capture targets", () => {
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
