/**
 * Provenance sidecars for captured shots, so a PNG on disk can answer three questions
 * nothing used to ask it: when was it taken, from what tree and command, and is it the
 * same pixels as the shot it replaced.
 *
 * `shots/` is gitignored and the old capture path kept whatever was already there when a
 * run failed, so a stale PNG was indistinguishable from a fresh one and a before/after
 * pair that never changed looked exactly like one that did. Clearing the target before a
 * capture (see {@link clearShotTarget}) plus a sidecar written after it closes both holes.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

import { compareSignatures } from "./shot-metrics";

export interface ShotRecord {
  v: 1;
  /** ISO timestamp of the capture that wrote the PNG beside this file. */
  capturedAt: string;
  /** The exact command that produced it, for a reproducible re-shoot. */
  command: string;
  /** sha256 of the PNG bytes. */
  sha: string;
  width?: number;
  height?: number;
  /** Commit the tree was on, plus whether the tree was dirty. */
  git?: { head: string; dirty: boolean };
  /** Coarse luminance fingerprint, for comparing this shot against a later re-capture. */
  signature?: number[];
  /** sha256 of the shot this one replaced, when there was one. */
  replacedSha?: string;
  /** Set when this capture shows the same picture as the shot it replaced. */
  unchanged?: { changedShare: number; maxDelta: number };
}

export function shotSidecarPath(pngPath: string): string {
  return `${pngPath.replace(/\.png$/i, "")}.shot.json`;
}

export function shaOf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface PreviousShot {
  sha: string;
  signature?: number[];
}

/**
 * Remove a shot and its sidecar before a capture attempt, returning what was there. A failed
 * or hung run then leaves no file at all, instead of leaving the previous shot to be read as
 * this run's result.
 */
export function clearShotTarget(pngPath: string): PreviousShot | undefined {
  let previous: PreviousShot | undefined;
  if (existsSync(pngPath)) {
    const record = readShotRecord(pngPath);
    try {
      previous = {
        sha: shaOf(readFileSync(pngPath)),
        ...(record?.signature === undefined ? {} : { signature: record.signature }),
      };
    } catch {
      previous = undefined;
    }
    rmSync(pngPath, { force: true });
  }
  rmSync(shotSidecarPath(pngPath), { force: true });
  return previous;
}

export function buildShotRecord(args: {
  bytes: Uint8Array;
  command: string;
  capturedAt: string;
  signature?: number[];
  previous?: PreviousShot;
  width?: number;
  height?: number;
  git?: { head: string; dirty: boolean };
}): ShotRecord {
  const { previous, signature } = args;
  const diff =
    previous?.signature !== undefined && signature !== undefined
      ? compareSignatures(signature, previous.signature)
      : null;
  const unchanged =
    diff?.same === true
      ? { changedShare: diff.changedShare, maxDelta: diff.maxDelta }
      : previous !== undefined && diff === null && shaOf(args.bytes) === previous.sha
        ? { changedShare: 0, maxDelta: 0 }
        : undefined;
  return {
    v: 1,
    capturedAt: args.capturedAt,
    command: args.command,
    sha: shaOf(args.bytes),
    ...(args.width === undefined ? {} : { width: args.width }),
    ...(args.height === undefined ? {} : { height: args.height }),
    ...(args.git === undefined ? {} : { git: args.git }),
    ...(signature === undefined ? {} : { signature }),
    ...(previous === undefined ? {} : { replacedSha: previous.sha }),
    ...(unchanged === undefined ? {} : { unchanged }),
  };
}

export function writeShotRecord(pngPath: string, record: ShotRecord): void {
  writeFileSync(shotSidecarPath(pngPath), `${JSON.stringify(record, null, 2)}\n`);
}

export function readShotRecord(pngPath: string): ShotRecord | null {
  const path = shotSidecarPath(pngPath);
  if (!existsSync(path)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return typeof parsed === "object" && parsed !== null ? (parsed as ShotRecord) : null;
  } catch {
    return null;
  }
}

/**
 * The line a capture prints about what it replaced. An identical result is called out
 * because it is the shape a no-op change takes: the command succeeded, the PNG looks
 * plausible, and nothing about the view actually moved.
 */
export function describeReplacement(record: ShotRecord): string | null {
  if (record.replacedSha === undefined || record.unchanged === undefined) return null;
  return (
    "SAME PICTURE as the shot it replaced — this view did not change, so the capture proves " +
    "nothing about the change under test (re-check what you captured, or capture the view that moved)"
  );
}

/**
 * Group shot paths that show the same picture. Compares luminance signatures when both
 * sidecars carry one and falls back to content hash, so a before/after pair re-encoded by
 * two separate captures is still caught.
 */
export function findDuplicateShots(files: readonly { path: string; bytes: Uint8Array }[]): string[][] {
  const entries = files.map((file) => ({
    path: file.path,
    sha: shaOf(file.bytes),
    signature: readShotRecord(file.path)?.signature,
  }));
  const groups: { paths: string[]; sha: string; signature?: number[] }[] = [];
  for (const entry of entries) {
    const match = groups.find((group) => {
      if (group.signature !== undefined && entry.signature !== undefined) {
        return compareSignatures(group.signature, entry.signature)?.same === true;
      }
      return group.sha === entry.sha;
    });
    if (match === undefined) {
      groups.push({ paths: [entry.path], sha: entry.sha, ...(entry.signature === undefined ? {} : { signature: entry.signature }) });
    } else {
      match.paths.push(entry.path);
    }
  }
  return groups.filter((group) => group.paths.length > 1).map((group) => group.paths);
}
