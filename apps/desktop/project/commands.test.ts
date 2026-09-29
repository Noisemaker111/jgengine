import { describe, expect, test } from "bun:test";

import {
  buildShellCommand,
  processKey,
  runnerOpenPath,
  websitePlayPath,
} from "../src/project/commands";

describe("project commands", () => {
  test("new-game shells out to the jgengine create CLI directly", () => {
    expect(buildShellCommand({ kind: "new-game", id: "my-game" }).argv).toEqual([
      "bun",
      "packages/jgengine/src/cli/index.ts",
      "create",
      "my-game",
    ]);
    expect(
      buildShellCommand({ kind: "new-game", id: "my-game", name: "My Game" }).argv,
    ).toEqual(["bun", "packages/jgengine/src/cli/index.ts", "create", "My Game"]);
  });

  test("start-game maps mount modes onto existing root scripts", () => {
    expect(buildShellCommand({ kind: "start-game", id: "odd-orbit", mount: "standalone" })).toEqual({
      label: "games:odd-orbit",
      argv: ["bun", "run", "games:odd-orbit"],
      cwd: "repo",
      stream: true,
    });
    expect(buildShellCommand({ kind: "start-game", id: "odd-orbit", mount: "website" }).argv).toEqual(
      ["bun", "run", "dev"],
    );
    expect(buildShellCommand({ kind: "start-game", id: "odd-orbit", mount: "runner" }).argv).toEqual(
      ["bun", "run", "dev:runner"],
    );
  });

  test("run-gate uses the root gate script", () => {
    expect(buildShellCommand({ kind: "run-gate" }).argv).toEqual(["bun", "run", "gate"]);
  });

  test("open paths stay on existing query/route contracts", () => {
    expect(runnerOpenPath("beacon-bastion", "editor")).toBe("?game=beacon-bastion&mode=editor");
    expect(websitePlayPath("beacon-bastion")).toBe("/play/?game=beacon-bastion");
  });

  test("process keys are stable", () => {
    expect(processKey("game", "a:standalone")).toBe("game:a:standalone");
    expect(processKey("gate")).toBe("gate");
    expect(processKey("new-game", "x")).toBe("new-game:x");
  });
});
