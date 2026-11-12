import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { auditCases, fmt, main, parseAuditArgs } from "./gen-audit";

describe("gen-audit", () => {
  test("parses flags and rejects bad ones", () => {
    const args = parseAuditArgs(["--generator", "circuit", "--generator", "streets", "--preset", "net", "--seeds", "2", "--no-png", "--other-libm"]);
    expect(typeof args).toBe("object");
    if (typeof args === "string") return;
    expect(args.generators).toEqual(["circuit", "streets"]);
    expect(args.presets).toEqual(["net"]);
    expect(args.seeds).toBe(2);
    expect(args.png).toBe(false);
    expect(args.otherLibm).toBe(true);
    expect(parseAuditArgs(["--generator", "boats"])).toContain("--generator");
    expect(parseAuditArgs(["--seeds", "0"])).toContain("--seeds");
    expect(parseAuditArgs(["--wat"])).toContain("unknown");
  });

  test("covers every schema preset of each generator, plus the terrain and city-race cases", () => {
    const all = auditCases({ generators: ["streets", "city", "circuit", "race"], presets: [] }).map((c) => `${c.generator}/${c.preset}`);
    expect(all).toContain("streets/net");
    expect(all).toContain("streets/terrain");
    expect(all).toContain("city/default");
    expect(all).toContain("city/manhattan");
    expect(all).toContain("circuit/circuit");
    expect(all).toContain("race/street-race");
    expect(all).toContain("race/city");
    expect(auditCases({ generators: ["streets"], presets: ["circuit"] }).map((c) => c.preset)).toEqual(["circuit"]);
  });

  test("formats integers plainly and missing values as a dash", () => {
    expect(fmt(3)).toBe("3");
    expect(fmt(0.12345)).toBe("0.123");
    expect(fmt(123.6)).toBe("124");
    expect(fmt(Number.NaN)).toBe("–");
    expect(fmt(undefined)).toBe("–");
  });

  test("writes a sheet, metrics.json and report.md for one preset without Chrome", async () => {
    const out = mkdtempSync(join(tmpdir(), "gen-audit-"));
    try {
      expect(await main(["--generator", "circuit", "--seeds", "1", "--no-png", "--out", out])).toBe(0);
      expect(existsSync(join(out, "circuit-circuit.svg"))).toBe(true);
      const metrics = JSON.parse(readFileSync(join(out, "metrics.json"), "utf8")) as { runs: { metrics: Record<string, unknown>; verdicts: unknown[] }[] };
      expect(metrics.runs).toHaveLength(1);
      expect(typeof metrics.runs[0]!.metrics["cornersPerKm"]).toBe("number");
      expect(metrics.runs[0]!.verdicts.length).toBeGreaterThan(0);
      expect(readFileSync(join(out, "report.md"), "utf8")).toContain("## circuit / circuit");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
