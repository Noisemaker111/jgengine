import { describe, expect, test } from "bun:test";

import { emitEditorConsole, installEditorConsoleSink } from "./consoleSink";

describe("consoleSink", () => {
  test("forwards events only while a sink is installed", () => {
    const seen: string[] = [];
    emitEditorConsole("info", "rpc", "before install");
    expect(seen).toEqual([]);
    const dispose = installEditorConsoleSink((severity, source, message) => {
      seen.push(`${severity}:${source}:${message}`);
    });
    emitEditorConsole("error", "rpc", "set_parent: cycle");
    emitEditorConsole("info", "agent", "tool set_transform");
    expect(seen).toEqual(["error:rpc:set_parent: cycle", "info:agent:tool set_transform"]);
    dispose();
    emitEditorConsole("error", "rpc", "after dispose");
    expect(seen).toHaveLength(2);
  });
});
