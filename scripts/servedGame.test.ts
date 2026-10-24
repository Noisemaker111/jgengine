import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

import { devServerIdentity, resolveDevPort } from "./browser-lib";
import { checkoutIdentity } from "./devServerMarker";
import { serveGameDir, splitGameDir } from "./servedGame";

const posix = (path: string): string => path.split(sep).join("/");

function game(prefix: string, name = "harbor-heat"): string {
  // Plain bytes on disk with no engine imports: the code under test only needs a folder to name.
  // fixture-location: allow the subject is a path outside the workspace, which is what --game-dir serves
  const dir = join(mkdtempSync(join(tmpdir(), `served-${prefix}-`)), name);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "index.tsx"), "export const game = {};\n");
  return dir;
}

const saved: Record<string, string | undefined> = {};
function remember(key: string): void {
  saved[key] = process.env[key];
}

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    delete saved[key];
  }
});

describe("splitGameDir", () => {
  test("takes the path out of argv and leaves the capture flags alone", () => {
    const split = splitGameDir(["harbor-heat", "--game-dir", "C:/games/harbor-heat", "--view", "boulevard"]);
    expect(split.dir).toBe("C:/games/harbor-heat");
    expect(split.argv).toEqual(["harbor-heat", "--view", "boulevard"]);
  });

  test("accepts the = form and refuses a flag with no value", () => {
    expect(splitGameDir(["--game-dir=C:/games/harbor-heat"]).dir).toBe("C:/games/harbor-heat");
    expect(() => splitGameDir(["--game-dir", "--view"])).toThrow(/needs a path/);
    expect(splitGameDir(["harbor-heat"]).dir).toBeNull();
  });
});

describe("serveGameDir", () => {
  test("points the launcher, Vite and the pin reader at that checkout", () => {
    remember("JG_GAME_DIR");
    remember("VITE_JG_GAME_DIR");
    remember("JG_GAMES_DIR");
    const dir = game("serve");
    serveGameDir(dir, "harbor-heat");
    expect(posix(process.env["JG_GAME_DIR"]!)).toBe(posix(dir));
    expect(process.env["VITE_JG_GAME_DIR"]!).toBe(posix(dir));
    expect(posix(process.env["JG_GAMES_DIR"]!)).toBe(posix(dir).split("/").slice(0, -1).join("/"));
  });

  test("refuses a folder that is not the named game, or not a game at all", () => {
    remember("JG_GAME_DIR");
    const dir = game("other", "harbor-heat");
    expect(() => serveGameDir(dir, "ember-command")).toThrow(/is game "harbor-heat", not "ember-command"/);
    // fixture-location: allow an empty folder is the subject - nothing is imported from it
    expect(() => serveGameDir(mkdtempSync(join(tmpdir(), "not-a-game-")), undefined)).toThrow(/no src\/index.tsx/);
  });

  test("a served run owns its own runner, so it never attaches to the clone's", () => {
    remember("JG_GAME_DIR");
    remember("JG_DEV_PORT");
    delete process.env["JG_DEV_PORT"];
    expect(devServerIdentity()).toBe(checkoutIdentity());
    const clonePort = resolveDevPort();
    const dir = game("identity");
    serveGameDir(dir, "harbor-heat");
    expect(devServerIdentity()).not.toBe(checkoutIdentity());
    expect(devServerIdentity()).toContain("game-dir:");
    expect(resolveDevPort()).not.toBe(clonePort);
  });
});
