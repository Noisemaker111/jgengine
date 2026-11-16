import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The README's "API in four files" quotes these files, which check-types compiles; this keeps the quote exact.
const readme = readFileSync(join(import.meta.dir, "../../../../README.md"), "utf8");

for (const file of ["tour-rules.ts", "tour-loop.ts", "tour-hud.tsx", "tour-game.ts"]) {
  test(`README quotes ${file} as it compiles`, () => {
    const code = readFileSync(join(import.meta.dir, file), "utf8").trimEnd();
    expect(readme).toContain(code);
  });
}
