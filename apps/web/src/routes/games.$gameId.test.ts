import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "games.$gameId.tsx"), "utf-8");

describe("games.$gameId play route", () => {
  test("never renders a heading or button as page chrome", () => {
    expect(source).not.toMatch(/<h1[\s>]/);
    expect(source).not.toMatch(/<button[\s>]/);
  });

  test("never gates the game behind a click-through poster", () => {
    expect(source).not.toMatch(/Enter\s+game/i);
    expect(source).not.toMatch(/presents/i);
    expect(source).toMatch(/type GamePhase = "loading" \| "playing"/);
  });

  test("mounts the /play iframe unconditionally, not behind a gate phase", () => {
    const iframeIndex = source.indexOf("<iframe");
    const firstPhaseGate = source.search(/phase !== "playing"/);
    expect(iframeIndex).toBeGreaterThan(-1);
    expect(firstPhaseGate).toBeGreaterThan(-1);
    expect(iframeIndex).toBeLessThan(firstPhaseGate);
  });
});
