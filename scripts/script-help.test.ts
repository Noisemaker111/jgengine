import { describe, expect, test } from "bun:test";

import { isHelpAsked, printHelpIfAsked, renderUsage, type Usage } from "./script-help";

const USAGE: Usage = {
  summary: "do the one thing",
  usage: "bun run thing [--dry]",
  flags: [{ flag: "--dry", detail: "print what would happen" }],
  example: "bun run thing --dry",
  exits: ["0 done", "1 failed"],};

describe("usage block", () => {
  test("names the command, its flags, one example and its exits", () => {
    const text = renderUsage("thing", USAGE);
    expect(text.split("\n")[0]).toBe("thing: do the one thing");
    expect(text).toContain("Usage:");
    expect(text).toContain("bun run thing [--dry]");
    expect(text).toContain("--dry");
    expect(text).toContain("--help, -h");
    expect(text).toContain("Example:");
    expect(text).toContain("bun run thing --dry");
    expect(text).toContain("Exit:");
    expect(text).toContain("0 done");
  });

  test("only --help and -h ask for it", () => {
    expect(isHelpAsked(["--help"])).toBe(true);
    expect(isHelpAsked(["-h"])).toBe(true);
    expect(isHelpAsked(["--verbose"])).toBe(false);
    expect(isHelpAsked([])).toBe(false);
  });

  test("printing happens for a help flag and not otherwise", () => {
    const lines: string[] = [];
    const log = console.log;
    console.log = (line: string) => lines.push(line);
    try {
      expect(printHelpIfAsked("thing", USAGE, ["--dry"])).toBe(false);
      expect(printHelpIfAsked("thing", USAGE, ["--help"])).toBe(true);
    } finally {
      console.log = log;
    }
    expect(lines.join("\n")).toContain("thing: do the one thing");
  });
});
