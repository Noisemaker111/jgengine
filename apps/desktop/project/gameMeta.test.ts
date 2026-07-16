import { describe, expect, test } from "bun:test";

import {
  applyGameSettingsPatch,
  parseCaptureSettings,
  parseCreditFromConfig,
  parseCreditFromPackageJson,
  parseDisplayName,
  patchCapturePlay,
  patchCreditExport,
  patchDisplayName,
  resolveGameSettings,
  validateNewGameId,
} from "../src/project/gameMeta";

const SAMPLE_CONFIG = `import { defineGame } from "@jgengine/shell/defineGame";

export const game = defineGame({
  name: "Tower Guard",
  world,
  capture: {
    play: ["startRun", "skipIntro"],
    settleMs: 1200,
    states: { lobby: ["openLobby"], store: ["openStore"] },
  },
});
`;

describe("gameMeta", () => {
  test("parses display name, capture play, settle, and state names", () => {
    expect(parseDisplayName(SAMPLE_CONFIG, "tower-guard")).toBe("Tower Guard");
    const capture = parseCaptureSettings(SAMPLE_CONFIG);
    expect(capture.play).toEqual(["startRun", "skipIntro"]);
    expect(capture.settleMs).toBe(1200);
    expect(capture.stateNames).toEqual(["lobby", "store"]);
  });

  test("patches display name and capture.play in place", () => {
    const named = patchDisplayName(SAMPLE_CONFIG, "Keep Watch");
    expect(named).toContain('name: "Keep Watch"');
    expect(named).not.toContain('name: "Tower Guard"');

    const captured = patchCapturePlay(SAMPLE_CONFIG, ["boot", "play"]);
    expect(captured).toContain('play: ["boot", "play"]');
    expect(captured).not.toContain("startRun");
  });

  test("inserts capture block when missing", () => {
    const bare = `export const game = defineGame({\n  name: "Solo",\n  world,\n});\n`;
    const next = patchCapturePlay(bare, ["start"]);
    expect(next).toContain("capture:");
    expect(next).toContain('play: ["start"]');
  });

  test("credit export round-trips as string or object", () => {
    const withString = `${SAMPLE_CONFIG}\nexport const credit = "Port of X · Author";\n`;
    expect(parseCreditFromConfig(withString)).toEqual({ text: "Port of X · Author" });

    const withObject = patchCreditExport(SAMPLE_CONFIG, {
      text: "Levy Street",
      url: "https://github.com/levy-street/world-of-claudecraft",
      handle: "levy-street",
    });
    expect(parseCreditFromConfig(withObject)).toEqual({
      text: "Levy Street",
      url: "https://github.com/levy-street/world-of-claudecraft",
      handle: "levy-street",
    });
  });

  test("package.json jgengine.credit parses", () => {
    const pkg = JSON.stringify(
      {
        name: "@games/demo",
        jgengine: {
          credit: "Classic homage",
          url: "https://example.com",
          handle: "demo",
        },
      },
      null,
      2,
    );
    expect(parseCreditFromPackageJson(pkg)).toEqual({
      text: "Classic homage",
      url: "https://example.com",
      handle: "demo",
    });
  });

  test("applyGameSettingsPatch composes name + capture + credit", () => {
    const next = applyGameSettingsPatch(SAMPLE_CONFIG, {
      displayName: "Renamed",
      capturePlay: ["go"],
      credit: { text: "Someone" },
    });
    expect(parseDisplayName(next, "x")).toBe("Renamed");
    expect(parseCaptureSettings(next).play).toEqual(["go"]);
    expect(parseCreditFromConfig(next)?.text).toBe("Someone");
  });

  test("resolveGameSettings prefers config credit over package credit", () => {
    const settings = resolveGameSettings({
      id: "demo",
      configSource: `${SAMPLE_CONFIG}\nexport const credit = "From config";\n`,
      packageSource: JSON.stringify({ jgengine: { credit: "From package" } }),
    });
    expect(settings.credit?.text).toBe("From config");
  });

  test("validateNewGameId rejects invalid ids", () => {
    expect(validateNewGameId("good-game")).toBeNull();
    expect(validateNewGameId("Bad")).not.toBeNull();
    expect(validateNewGameId("")).not.toBeNull();
  });
});
