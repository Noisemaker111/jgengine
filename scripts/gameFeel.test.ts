import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findGameFeelGaps } from "./gameFeel";

function scan(files: Record<string, string>) { const root = mkdtempSync(join(process.cwd(), "feel-")); try { for (const [file, text] of Object.entries(files)) { const path = join(root, file); mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, text); } return findGameFeelGaps(root).map((x) => x.key); } finally { rmSync(root, { recursive: true, force: true }); } }

describe("findGameFeelGaps", () => {
  test("reports missing feedback", () => expect(scan({ "Games/probe/src/index.tsx": "const camera = true; const attack = true;" })).toEqual(["probe#camera-smoothing", "probe#combat-feedback", "probe#input-audio"]));
  test("accepts all feedback seams", () => expect(scan({ "Games/probe/src/index.tsx": "camera targetSmoothing; attack; audio.play(); hitReaction;" })).toEqual([]));
  test("accepts responsive engine first-person camera without imposing smoothing", () => {
    expect(scan({ "Games/probe/src/index.tsx": `camera: { perspective: "first", firstPerson: { sensitivity: 0.0021 } }` })).toEqual([]);
    expect(scan({ "Games/probe/src/index.tsx": `camera: { perspective: "third" }; const firstPerson = true;` })).toEqual(["probe#camera-smoothing"]);
  });
  test("accepts positive engine chase spring damping, but not an unrelated or disabled spring", () => {
    expect(scan({ "Games/probe/src/index.tsx": `camera: { rig: "chase", chase: { springDamping: 6.5 } }` })).toEqual([]);
    for (const source of [`camera: { rig: "chase", chase: { springDamping: 0 } }`, `camera: { rig: "orbit" }; physics: { springDamping: 6.5 }`]) {
      expect(scan({ "Games/probe/src/index.tsx": source })).toEqual(["probe#camera-smoothing"]);
    }
  });
  test("accepts conditional rendered damage feedback and muzzle flash", () => {
    for (const feedback of [`{dive.hurt > 0 && <div className="damage" />}`, `{dive.flash > 0 ? "+" : "�"}`]) {
      expect(scan({ "Games/probe/src/index.tsx": `attack; audio.play(); ${feedback}` })).toEqual([]);
    }
  });
  test("bare feedback state and nonrendered conditions do not satisfy combat feedback", () => {
    for (const feedback of [`const hurt = 0; const flash = true;`, `if (dive.hurt > 0) updateState();`, `{ flash: dive.flash > 0 }`]) {
      expect(scan({ "Games/probe/src/index.tsx": `attack; audio.play(); ${feedback}` })).toEqual(["probe#combat-feedback"]);
    }
  });
  test("scans created-game", () => expect(scan({ "created-game/src/index.tsx": "interact" })).toEqual(["created-game#input-audio"]));
  test("skips the games repo's tooling folders, which are not games", () => {
    expect(scan({ "Games/scripts/framework-check.ts": "/damage|combat/i", "Games/probe/src/index.tsx": "audio.play();" })).toEqual([]);
  });
});
