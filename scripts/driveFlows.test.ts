import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { driveProjectDir, flowFileOf, flowsDirOf, listFlowNames, missingFlowsMessage } from "./driveFlows";

/** A checkout that only has the paths the test names, so the lookup is read without touching disk. */
function checkout(paths: string[]) {
  const present = new Set(paths.map((path) => path.replace(/\\/g, "/")));
  const exists = (path: string) => present.has(path.replace(/\\/g, "/"));
  const readdir = (dir: string) => {
    const prefix = dir.replace(/\\/g, "/") + "/";
    const names = [...present].filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/")).map((path) => path.slice(prefix.length));
    if (names.length === 0) throw new Error("ENOENT: " + dir);
    return names;
  };
  return { exists, readdir, present };
}

describe("driveProjectDir", () => {
  test("a fresh games worktree wins over this checkout's games/", () => {
    const tree = checkout(["/wt/ember-command", "/wt/ember-command/package.json", "/engine/games/ember-command", "/engine/games/ember-command/package.json"]);
    const dir = driveProjectDir({ game: "ember-command" }, "/wt", "/engine", tree.exists);
    expect(dir).toContain("ember-command");
    expect(dir).not.toContain("engine");
  });

  test("standing in the game project uses that project", () => {
    const tree = checkout(["/wt/ember-command", "/wt/ember-command/package.json"]);
    expect(driveProjectDir({ game: "ember-command" }, "/wt/ember-command", "/engine", tree.exists)).toContain("ember-command");
    expect(driveProjectDir({ game: "ember-command" }, "/wt/ember-command", "/engine", tree.exists)).not.toContain("games");
  });

  test("falls back to the engine checkout, and an external URL stays in the working directory", () => {
    const tree = checkout([]);
    expect(driveProjectDir({ game: "ember-command" }, "/elsewhere", "/engine", tree.exists)).toContain("games");
    expect(driveProjectDir({ game: "url", external: true }, "/elsewhere", "/engine", tree.exists)).toBe("/elsewhere");
  });
});

describe("flows of a game that has none", () => {
  test("listing an absent folder is empty and says what is missing", () => {
    const tree = checkout([]);
    const dir = flowsDirOf("/wt/newgame");
    expect(listFlowNames(dir, tree.readdir)).toEqual([]);
    expect(missingFlowsMessage(dir)).toContain("no flows at");
    expect(missingFlowsMessage(dir)).toContain(join("proofs", "flows"));
    expect(missingFlowsMessage(dir)).toContain("arrival it expects");
  });

  test("asking for a named flow fails with the folder and the repair, never an empty run", () => {
    const tree = checkout([]);
    const dir = flowsDirOf("/wt/newgame");
    const find = () => flowFileOf(dir, "to-skirmish", tree.exists, () => listFlowNames(dir, tree.readdir));
    expect(find).toThrow("no flow named \"to-skirmish\"");
    expect(find).toThrow("no flows at");
    expect(find).toThrow(join("proofs", "flows"));
  });

  test("a folder with flows lists them, finds one by name, and a missing name names the ones that exist", () => {
    const dir = flowsDirOf("/wt/game");
    const tree = checkout([dir + "/to-menu.flow.ts", dir + "/to-skirmish.flow.ts", dir + "/notes.md"]);
    const names = () => listFlowNames(dir, tree.readdir);
    expect(names()).toEqual(["to-menu", "to-skirmish"]);
    expect(flowFileOf(dir, "to-menu", tree.exists, names).replace(/\\/g, "/")).toBe(dir.replace(/\\/g, "/") + "/to-menu.flow.ts");
    expect(() => flowFileOf(dir, "to-level-1", tree.exists, names)).toThrow("available: to-menu, to-skirmish");
    expect(() => flowFileOf(dir, "to-menu.flow.ts", tree.exists, names)).toThrow("--flow takes a bare name");
  });
});
