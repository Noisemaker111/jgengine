import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const packagesDir = join(import.meta.dir, "../../..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) out.push(path);
  }
  return out;
}

// three r182's deprecated PCFSoftShadowMap check falls through to BasicShadowMap, so a
// `<Canvas shadows>` / `shadows={true}` / `shadows="soft"` silently renders hard, unfiltered shadows.
/** A bare `shadows` JSX attribute, or `shadows={true}` / `shadows="soft"`. */
const BAD_SHADOWS = /(?:^|[\s<])shadows(?:\s*=\s*(?:\{\s*true\s*\}|"soft"|\{\s*"soft"\s*\})|(?=\s*\/?>|\s*$|\s+[a-z][A-Za-z]*(?:=|\s|\/?>|$)))/;

describe("engine canvases request a filtered shadow type", () => {
  test("no <Canvas> uses the default (soft) shadow type", () => {
    const offenders: string[] = [];
    for (const pkg of ["shell", "editor", "react"]) {
      for (const file of sourceFiles(join(packagesDir, pkg, "src"))) {
        const text = readFileSync(file, "utf8");
        if (!text.includes("<Canvas")) continue;
        text.split("\n").forEach((line, index) => {
          const code = line.trim();
          if (code.startsWith("//") || code.startsWith("*")) return;
          if (BAD_SHADOWS.test(code)) offenders.push(`${relative(packagesDir, file)}:${index + 1}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
