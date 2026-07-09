import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { appendPapercut, formatEntry } from "./papercut";

describe("papercut", () => {
  test("formats an entry as timestamp — model — user then the message", () => {
    const entry = formatEntry("opus-4.8", "jk", "  rg glob failed  ", "2026-07-09T00:00:00.000Z");
    expect(entry).toBe("2026-07-09T00:00:00.000Z — opus-4.8 — jk\n\nrg glob failed\n");
  });

  test("seeds the header on first write and appends after", () => {
    const dir = mkdtempSync(join(tmpdir(), "jg-papercut-"));
    const file = join(dir, "PAPERCUTS.md");

    appendPapercut(file, formatEntry("opus", "a", "first", "2026-07-09T00:00:00.000Z"));
    appendPapercut(file, formatEntry("sonnet", "b", "second", "2026-07-09T01:00:00.000Z"));
    const text = readFileSync(file, "utf8");
    rmSync(dir, { recursive: true, force: true });

    expect(text.startsWith("# Papercuts")).toBe(true);
    expect(text).toContain("2026-07-09T00:00:00.000Z — opus — a\n\nfirst");
    expect(text).toContain("2026-07-09T01:00:00.000Z — sonnet — b\n\nsecond");
    expect(text.indexOf("first")).toBeLessThan(text.indexOf("second"));
    expect(text).not.toContain("\n\n\n");
  });
});
