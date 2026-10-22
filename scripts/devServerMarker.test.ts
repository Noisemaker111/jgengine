import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { listMarkers, markerPath, readMarker, removeMarker, writeMarker, devServerMarkerPlugin } from "./devServerMarker";

/**
 * The marker is how `bun run debug` finds the dev server Jon started with `bun dev`:
 * a write at listen, a read by the CLI, and a removal that never touches another
 * checkout's marker on the same port.
 */

const dirs: string[] = [];

function markerDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "jg-marker-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("dev server marker", () => {
  test("a written marker reads back with the identity, port, pid and head the CLI expects", () => {
    const dir = markerDir();
    writeMarker({ identity: "C:/work/tree", port: 3001, pid: 4242, head: "abc123", kind: "website" }, dir);
    expect(readMarker(3001, dir)).toEqual({
      identity: "C:/work/tree",
      port: 3001,
      pid: 4242,
      head: "abc123",
      kind: "website",
    });
    expect(existsSync(markerPath(3001, dir))).toBe(true);
  });

  test("listing finds every marker in the directory", () => {
    const dir = markerDir();
    writeMarker({ identity: "a", port: 3001, kind: "website" }, dir);
    writeMarker({ identity: "b", port: 4680, kind: "runner" }, dir);
    expect(listMarkers(dir).map((marker) => marker.port).sort()).toEqual([3001, 4680]);
  });

  test("removing owns only its own identity, so a neighbouring checkout keeps its marker", () => {
    const dir = markerDir();
    writeMarker({ identity: "mine", port: 3001, kind: "website" }, dir);
    expect(removeMarker(3001, "someone-else", dir)).toBe(false);
    expect(readMarker(3001, dir)).not.toBeNull();
    expect(removeMarker(3001, "mine", dir)).toBe(true);
    expect(readMarker(3001, dir)).toBeNull();
    expect(removeMarker(3001, "mine", dir)).toBe(false);
  });

  test("a missing marker reads as null instead of throwing", () => {
    const dir = markerDir();
    expect(readMarker(9999, dir)).toBeNull();
    expect(removeMarker(9999, "mine", dir)).toBe(false);
  });

  test("the Vite plugin publishes on listen and removes its own marker on shutdown", () => {
    const dir = markerDir();
    const listeners = new Map<string, () => void>();
    const httpServer = {
      listening: false,
      address: () => ({ address: "::1", family: "IPv6", port: 30_111 }),
      once(event: string, listener: () => void) {
        listeners.set(event, listener);
      },
    };
    const plugin = devServerMarkerPlugin({ kind: "website", dir });
    plugin.configureServer({ config: { root: process.cwd() }, httpServer });
    expect(readMarker(30_111, dir)).toBeNull();

    listeners.get("listening")!();
    expect(readMarker(30_111, dir)).toMatchObject({ port: 30_111, kind: "website", host: "localhost" });

    listeners.get("close")!();
    expect(readMarker(30_111, dir)).toBeNull();
  });
});
