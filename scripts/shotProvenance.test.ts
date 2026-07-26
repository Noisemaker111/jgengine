import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildShotRecord,
  clearShotTarget,
  describeReplacement,
  findDuplicateShots,
  readShotRecord,
  shaOf,
  shotSidecarPath,
  writeShotRecord,
} from "./shotProvenance";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const scratch = (): string => mkdtempSync(join(tmpdir(), "shot-provenance-"));

describe("clearShotTarget", () => {
  it("removes the shot and its sidecar, returning what was there", () => {
    const dir = scratch();
    const png = join(dir, "a.png");
    writeFileSync(png, bytes("old"));
    writeFileSync(shotSidecarPath(png), "{}");

    expect(clearShotTarget(png)?.sha).toBe(shaOf(bytes("old")));
    expect(existsSync(png)).toBe(false);
    expect(existsSync(shotSidecarPath(png))).toBe(false);
  });

  it("is a no-op on a path that does not exist yet", () => {
    expect(clearShotTarget(join(scratch(), "missing.png"))).toBeUndefined();
  });
});

const flatSignature = (value: number): number[] => new Array(576).fill(value);

describe("buildShotRecord", () => {
  it("flags a re-capture that shows the same picture despite different bytes", () => {
    const signature = flatSignature(100);
    const nudged = [...signature];
    nudged[0] = 101;
    const record = buildShotRecord({
      bytes: bytes("re-encoded, same view"),
      command: "bun run shoot x",
      capturedAt: "2026-01-01T00:00:00.000Z",
      signature: nudged,
      previous: { sha: shaOf(bytes("original bytes")), signature },
    });
    expect(record.unchanged).toEqual({ changedShare: 0, maxDelta: 1 });
    expect(describeReplacement(record)).toContain("SAME PICTURE");
  });

  it("reports a genuine visual change", () => {
    const record = buildShotRecord({
      bytes: bytes("new"),
      command: "bun run shoot x",
      capturedAt: "2026-01-01T00:00:00.000Z",
      signature: flatSignature(200),
      previous: { sha: shaOf(bytes("old")), signature: flatSignature(20) },
    });
    expect(record.unchanged).toBeUndefined();
    expect(describeReplacement(record)).toBeNull();
  });

  it("falls back to byte equality when the previous shot has no signature", () => {
    const record = buildShotRecord({
      bytes: bytes("same"),
      command: "bun run shoot x",
      capturedAt: "2026-01-01T00:00:00.000Z",
      previous: { sha: shaOf(bytes("same")) },
    });
    expect(record.unchanged).toEqual({ changedShare: 0, maxDelta: 0 });
  });

  it("says nothing about replacement for a first capture", () => {
    const record = buildShotRecord({
      bytes: bytes("first"),
      command: "bun run shoot x",
      capturedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(record.replacedSha).toBeUndefined();
    expect(describeReplacement(record)).toBeNull();
  });
});

describe("shot record round trip", () => {
  it("writes and reads the sidecar beside the png", () => {
    const dir = scratch();
    const png = join(dir, "b.png");
    const record = buildShotRecord({
      bytes: bytes("frame"),
      command: "bun run shoot b",
      capturedAt: "2026-01-01T00:00:00.000Z",
      git: { head: "abc123", dirty: true },
    });
    writeShotRecord(png, record);

    expect(shotSidecarPath(png)).toBe(join(dir, "b.shot.json"));
    expect(readShotRecord(png)).toEqual(record);
    expect(readFileSync(shotSidecarPath(png), "utf8").endsWith("\n")).toBe(true);
  });

  it("returns null for a missing or corrupt sidecar", () => {
    const dir = scratch();
    expect(readShotRecord(join(dir, "gone.png"))).toBeNull();
    const png = join(dir, "bad.png");
    writeFileSync(shotSidecarPath(png), "{ not json");
    expect(readShotRecord(png)).toBeNull();
  });
});

describe("findDuplicateShots", () => {
  it("groups byte-identical images and ignores distinct ones", () => {
    expect(
      findDuplicateShots([
        { path: "before.png", bytes: bytes("same") },
        { path: "after.png", bytes: bytes("same") },
        { path: "other.png", bytes: bytes("different") },
      ]),
    ).toEqual([["before.png", "after.png"]]);
  });

  it("finds nothing when every image differs", () => {
    expect(
      findDuplicateShots([
        { path: "a.png", bytes: bytes("a") },
        { path: "b.png", bytes: bytes("b") },
      ]),
    ).toEqual([]);
  });
});
