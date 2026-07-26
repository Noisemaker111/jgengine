import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findFrontEndGaps } from "./gameFrontEnd";

function scan(files: Record<string, string>): string[] {
  const root = mkdtempSync(join(tmpdir(), "front-end-"));
  try {
    for (const [rel, source] of Object.entries(files)) {
      const path = join(root, rel);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, source);
    }
    return findFrontEndGaps(root).map((gap) => gap.key);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("findFrontEndGaps", () => {
  test("a bare game is missing both surfaces", () => {
    expect(scan({ "Games/probe/src/main.tsx": "export const x = 1;\n" })).toEqual([
      "probe#credits",
      "probe#settings",
    ]);
  });

  test("a declared settings block clears settings", () => {
    expect(
      scan({ "Games/probe/src/game.config.ts": "export const game = defineGame({\n  settings: { variant: \"sheet\" },\n});\n" }),
    ).toEqual(["probe#credits"]);
  });

  test("an imported SettingsTrigger alone does NOT clear settings — it renders null without a config block", () => {
    expect(scan({ "Games/probe/src/ui.tsx": 'import { SettingsTrigger } from "@jgengine/react";\n' })).toEqual([
      "probe#credits",
      "probe#settings",
    ]);
  });

  test("a credits screen clears credits", () => {
    expect(
      scan({ "Games/probe/src/ui.tsx": 'import { CreditsScreen } from "@jgengine/react/creditsScreen";\n' }),
    ).toEqual(["probe#settings"]);
  });

  test("generated asset credits also clear it", () => {
    expect(
      scan({ "Games/probe/src/ui.tsx": 'import { creditsForSourceIds } from "@jgengine/assets/credits";\n' }),
    ).toEqual(["probe#settings"]);
  });

  test("a game with both surfaces reports nothing", () => {
    expect(
      scan({
        "Games/probe/src/game.config.ts": "defineGame({\n  settings: { variant: \"sheet\" },\n});\n",
        "Games/probe/src/ui.tsx": 'import { CreditsScreen } from "@jgengine/react/creditsScreen";\n',
      }),
    ).toEqual([]);
  });
});
