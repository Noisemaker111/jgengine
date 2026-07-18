import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createProjectSurfaceHost } from "./processManager";

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("project surface host settings", () => {
  test("saveSettings patches game.config.ts in place", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "jg-project-host-"));
    roots.push(repoRoot);
    const gamesDir = join(repoRoot, "Games");
    const src = join(gamesDir, "demo", "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(gamesDir, "demo", "package.json"), JSON.stringify({ name: "@games/demo" }));
    writeFileSync(
      join(src, "game.config.ts"),
      `export const game = defineGame({\n  name: "Demo",\n  world,\n});\n`,
    );

    const host = createProjectSurfaceHost({ repoRoot, gamesDir });
    const result = host.saveSettings("demo", {
      displayName: "Demo Two",
      capturePlay: ["start"],
      credit: { text: "Someone" },
    });
    expect(result.ok).toBe(true);
    const source = readFileSync(join(src, "game.config.ts"), "utf8");
    expect(source).toContain('name: "Demo Two"');
    expect(source).toContain('play: ["start"]');
    expect(source).toContain('export const credit = "Someone"');
    expect(host.get("demo")?.displayName).toBe("Demo Two");
  });
});

describe("project surface host thumbnails", () => {
  function makeGame(gamesDir: string, id: string): void {
    const src = join(gamesDir, id, "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(gamesDir, id, "package.json"), JSON.stringify({ name: `@games/${id}` }));
  }

  test("readThumbnail returns the image bytes and content type when present", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "jg-project-host-"));
    roots.push(repoRoot);
    const gamesDir = join(repoRoot, "Games");
    makeGame(gamesDir, "withpng");
    const publicDir = join(gamesDir, "withpng", "public");
    mkdirSync(publicDir, { recursive: true });
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    writeFileSync(join(publicDir, "thumbnail.png"), bytes);

    const host = createProjectSurfaceHost({ repoRoot, gamesDir });
    const thumb = host.readThumbnail("withpng");
    expect(thumb).not.toBeNull();
    expect(thumb?.contentType).toBe("image/png");
    expect(Buffer.compare(thumb!.data, bytes)).toBe(0);
  });

  test("readThumbnail returns null when the game has no thumbnail or is unknown", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "jg-project-host-"));
    roots.push(repoRoot);
    const gamesDir = join(repoRoot, "Games");
    makeGame(gamesDir, "nothumb");

    const host = createProjectSurfaceHost({ repoRoot, gamesDir });
    expect(host.readThumbnail("nothumb")).toBeNull();
    expect(host.readThumbnail("missing")).toBeNull();
    expect(host.readThumbnail("../etc")).toBeNull();
  });
});
