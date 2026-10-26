import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { readBuildEnv } from "./saveEndpoint";

const PACKAGES = ["../../../core/src", "../../../shell/src"].map((relative) => join(import.meta.dir, relative));

function sourceFiles(dir: string, into: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, into);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) into.push(path);
  }
  return into;
}

/** Code lines that read `import.meta` whole, or `import.meta.env` other than as `import.meta.env.<NAME>`. */
function dynamicEnvReads(file: string): string[] {
  const hits: string[] = [];
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      const code = line.trim();
      if (code.startsWith("*") || code.startsWith("//") || code.startsWith("/*")) return;
      if (/import\.meta(?!\.)|import\.meta\.env(?!\.[A-Za-z_])/.test(code)) hits.push(`${file}:${index + 1}: ${code}`);
    });
  return hits;
}

describe("build env", () => {
  // Vite's server module runner replaces only `import.meta.env.<NAME>` and throws on any other read,
  // so one whole-object read anywhere in engine source breaks server rendering of every page using it.
  test("engine source reads import.meta.env only by literal name", () => {
    const hits = PACKAGES.flatMap((dir) => sourceFiles(dir)).flatMap(dynamicEnvReads);
    expect(hits).toEqual([]);
  });

  test("readBuildEnv answers off Vite without throwing", () => {
    const env = readBuildEnv();
    expect(typeof env).toBe("object");
  });
});
