import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

import { findProjectRoot, materializeHarness, planHarness } from "./harness";
import { browserLibMjs, shootMjs } from "./templates/gameFiles";

function makeProject(deps: Record<string, string>, opts: { scripts?: boolean } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "jg-harness-proj-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "demo", dependencies: deps }, null, 2));
  if (opts.scripts === true) {
    mkdirSync(join(dir, "scripts"), { recursive: true });
    writeFileSync(join(dir, "scripts", "shoot.mjs"), "// project shoot\n");
    writeFileSync(join(dir, "scripts", "drive.mjs"), "// project drive\n");
  }
  return dir;
}

describe("findProjectRoot", () => {
  test("finds the nearest ancestor whose package.json depends on @jgengine/*", () => {
    const root = makeProject({ "@jgengine/core": "^0.14.0" });
    const nested = join(root, "src", "game");
    mkdirSync(nested, { recursive: true });
    try {
      expect(findProjectRoot(nested)).toBe(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns null when no ancestor is a JGengine project", () => {
    const dir = mkdtempSync(join(tmpdir(), "jg-harness-empty-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "plain", dependencies: { react: "19" } }));
    try {
      expect(findProjectRoot(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("materializeHarness", () => {
  test("writes the shared browser.mjs plus the kind's CLI, byte-identical to the scaffold", () => {
    const dir = materializeHarness("shoot");
    try {
      expect(readFileSync(join(dir, "browser.mjs"), "utf8")).toBe(browserLibMjs);
      expect(readFileSync(join(dir, "shoot.mjs"), "utf8")).toBe(shootMjs);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("planHarness", () => {
  test("delegates to the project's own scripts/<kind>.mjs when present (parity with bun run shoot)", () => {
    const root = makeProject({ "@jgengine/core": "^0.14.0" }, { scripts: true });
    try {
      const plan = planHarness("shoot", root);
      expect(plan.ok).toBe(true);
      if (plan.ok) {
        expect(plan.source).toBe("project");
        expect(plan.script).toBe(join(root, "scripts", "shoot.mjs"));
        expect(plan.cwd).toBe(root);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("materializes the bundled harness when the project has no scripts/<kind>.mjs", () => {
    const root = makeProject({ "@jgengine/shell": "^0.14.0" });
    try {
      const plan = planHarness("drive", root);
      expect(plan.ok).toBe(true);
      if (plan.ok) {
        expect(plan.source).toBe("bundled");
        expect(plan.cwd).toBe(root);
        expect(existsSync(plan.script)).toBe(true);
        expect(plan.script.endsWith("drive.mjs")).toBe(true);
        // the bundled shoot.mjs imports its sibling browser.mjs — both must land together
        expect(existsSync(join(plan.script, "..", "browser.mjs"))).toBe(true);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("errors outside a project unless allowNoProject (used for --help)", () => {
    const dir = mkdtempSync(join(tmpdir(), "jg-harness-noproj-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "plain" }));
    try {
      const denied = planHarness("shoot", dir);
      expect(denied.ok).toBe(false);
      if (!denied.ok) expect(denied.error).toContain("JGengine game project");

      const allowed = planHarness("shoot", dir, { allowNoProject: true });
      expect(allowed.ok).toBe(true);
      if (allowed.ok) expect(allowed.source).toBe("bundled");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function encodePng(width: number, height: number, pixel: (x: number, y: number) => [number, number, number], filter = 0): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 255]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < width; x += 1) {
      const rgb = pixel(x, y);
      for (let c = 0; c < 3; c += 1) {
        const up = y > 0 ? pixel(x, y - 1)[c] : 0;
        raw[y * (stride + 1) + 1 + x * 3 + c] = (rgb[c] - (filter === 2 ? up : 0)) & 255;
      }
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("scaffold blank-frame guard", () => {
  test("decodes captured PNGs and refuses a one-color viewport but not a rendered one", async () => {
    const dir = materializeHarness("shoot");
    try {
      const lib = (await import(join(dir, "browser.mjs"))) as {
        decodePng(bytes: Buffer): { width: number; px: Buffer; channels: number } | null;
        isBlankFrame(bytes: Buffer): boolean;
      };
      const sky = (x: number, y: number): [number, number, number] => (y < 20 ? [120, 170, 230] : [60, 110 + (x % 7), 50]);
      const upFiltered = lib.decodePng(encodePng(32, 40, sky, 2));
      expect(upFiltered?.width).toBe(32);
      expect([...upFiltered!.px.subarray((30 * 32 + 5) * 3, (30 * 32 + 5) * 3 + 3)]).toEqual([60, 115, 50]);
      expect(lib.isBlankFrame(encodePng(64, 36, () => [0, 0, 0]))).toBe(true);
      expect(lib.isBlankFrame(encodePng(64, 36, () => [180, 190, 200]))).toBe(true);
      expect(lib.isBlankFrame(encodePng(32, 40, sky))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
