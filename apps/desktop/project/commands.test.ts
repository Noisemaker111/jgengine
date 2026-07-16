import { describe, expect, test } from "bun:test";

import {
  buildShellCommand,
  processKey,
  runnerOpenPath,
  websitePlayPath,
} from "../src/project/commands";

describe("project commands", () => {
  test("new:game wires bun run new:game with optional name", () => {
    expect(buildShellCommand({ kind: "new-game", id: "my-game" }).argv).toEqual([
      "bun",
      "run",
      "new:game",
      "my-game",
    ]);
    expect(
      buildShellCommand({ kind: "new-game", id: "my-game", name: "My Game" }).argv,
    ).toEqual(["bun", "run", "new:game", "my-game", "--name", "My Game"]);
  });

  test("start-game maps mount modes onto existing root scripts", () => {
    expect(buildShellCommand({ kind: "start-game", id: "starhome", mount: "standalone" })).toEqual({
      label: "games:starhome",
      argv: ["bun", "run", "games:starhome"],
      cwd: "repo",
      stream: true,
    });
    expect(buildShellCommand({ kind: "start-game", id: "starhome", mount: "website" }).argv).toEqual(
      ["bun", "run", "dev"],
    );
    expect(buildShellCommand({ kind: "start-game", id: "starhome", mount: "runner" }).argv).toEqual(
      ["bun", "run", "dev:runner"],
    );
  });

  test("run-gate uses the root gate script", () => {
    expect(buildShellCommand({ kind: "run-gate" }).argv).toEqual(["bun", "run", "gate"]);
  });

  test("open paths stay on existing query/route contracts", () => {
    expect(runnerOpenPath("tower-guard", "editor")).toBe("?game=tower-guard&mode=editor");
    expect(websitePlayPath("tower-guard")).toBe("/play/?game=tower-guard");
  });

  test("process keys are stable", () => {
    expect(processKey("game", "a:standalone")).toBe("game:a:standalone");
    expect(processKey("gate")).toBe("gate");
    expect(processKey("new-game", "x")).toBe("new-game:x");
  });
});
