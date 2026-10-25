import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { EDITOR_SCENE_FILENAME, handleSaveRequest } from "./devSavePlugin";

const roots: string[] = [];

function makeGamesDir(gameId: string, files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "jg-dev-save-"));
  roots.push(root);
  const src = join(root, gameId, "src");
  mkdirSync(src, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(src, name), content);
  }
  return root;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("dev save endpoint", () => {
  test("a save for the game served from another checkout lands in that checkout, not games/<id>", () => {
    const gamesDir = makeGamesDir("beacon-bastion", { [EDITOR_SCENE_FILENAME]: "{}\n" });
    const lane = makeGamesDir("beacon-bastion", {});
    const json = JSON.stringify({ version: 1, markers: [], volumes: [], paths: [], annotations: [] });
    const body = JSON.stringify({ kind: "editor-document", gameId: "beacon-bastion", json });
    const result = handleSaveRequest(gamesDir, body, join(lane, "beacon-bastion"));
    expect(result).toMatchObject({ ok: true, path: join(lane, "beacon-bastion", "src", EDITOR_SCENE_FILENAME) });
    expect(readFileSync(join(gamesDir, "beacon-bastion", "src", EDITOR_SCENE_FILENAME), "utf8")).toBe("{}\n");
    // Another game still saves to games/<id>.
    expect(handleSaveRequest(gamesDir, body, join(lane, "other-game"))).toMatchObject({ ok: true, path: join(gamesDir, "beacon-bastion", "src", EDITOR_SCENE_FILENAME) });
  });

  test("editor document round-trips to games/<id>/src", () => {
    const gamesDir = makeGamesDir("proving-grounds", {});
    const json = JSON.stringify({
      version: 1,
      markers: [{ id: "boss", kind: "boss", position: { x: 1, y: 0, z: 2 } }],
      volumes: [],
      paths: [],
      annotations: [],
    });
    const result = handleSaveRequest(
      gamesDir,
      JSON.stringify({ kind: "editor-document", gameId: "proving-grounds", json }),
    );
    expect(result.ok).toBe(true);
    const saved = JSON.parse(
      readFileSync(join(gamesDir, "proving-grounds/src", EDITOR_SCENE_FILENAME), "utf8"),
    ) as { markers: { id: string }[] };
    expect(saved.markers[0]?.id).toBe("boss");
  });

  test("rejects unknown and malicious game ids", () => {
    const gamesDir = makeGamesDir("real-game", {});
    for (const gameId of ["missing", "../evil", "a/../../b"]) {
      const result = handleSaveRequest(
        gamesDir,
        JSON.stringify({ kind: "editor-document", gameId, json: "{}" }),
      );
      expect(result.ok).toBe(false);
    }
  });

  test("tunable deltas rewrite module exports and scanned tables", () => {
    const gamesDir = makeGamesDir("proving-grounds", {
      "game.config.ts": `export const GRAVITY = -22;\nexport const TITLE = "x";\n`,
      "tables.ts": `export const ENEMIES = {\n  bandit: { hp: 100, speed: 4 },\n};\n`,
    });
    const result = handleSaveRequest(
      gamesDir,
      JSON.stringify({
        kind: "tunables",
        gameId: "proving-grounds",
        deltas: [
          { table: "game.config", key: "GRAVITY", value: -30 },
          { table: "ENEMIES", key: "bandit.hp", value: 250 },
          { table: "ENEMIES", key: "bandit.missing", value: 1 },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(2);
    expect(result.skipped).toHaveLength(1);
    const config = readFileSync(join(gamesDir, "proving-grounds/src/game.config.ts"), "utf8");
    expect(config).toContain("export const GRAVITY = -30;");
    const tables = readFileSync(join(gamesDir, "proving-grounds/src/tables.ts"), "utf8");
    expect(tables).toContain("hp: 250");
    expect(tables).toContain("speed: 4");
  });
});
