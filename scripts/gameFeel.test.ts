import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findGameFeelGaps } from "./gameFeel";

function scan(files: Record<string, string>) { const root = mkdtempSync(join(process.cwd(), "feel-")); try { for (const [file, text] of Object.entries(files)) { const path = join(root, file); mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, text); } return findGameFeelGaps(root).map((x) => x.key); } finally { rmSync(root, { recursive: true, force: true }); } }

describe("findGameFeelGaps", () => {
  test("reports missing feedback", () => expect(scan({ "Games/probe/src/index.tsx": "const camera = true; const attack = true;" })).toEqual(["probe#camera-smoothing", "probe#combat-feedback", "probe#input-audio"]));
  test("accepts all feedback seams", () => expect(scan({ "Games/probe/src/index.tsx": "camera targetSmoothing; attack; audio.play(); hitReaction;" })).toEqual([]));
  test("scans created-game", () => expect(scan({ "created-game/src/index.tsx": "interact" })).toEqual(["created-game#input-audio"]));
});
