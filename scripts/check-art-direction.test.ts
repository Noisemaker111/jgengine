import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const sections = ["Reference images", "World palette", "Material language", "Lighting mood", "Silhouette rules", "UI typography", "Chosen look"];
const documentFor = (filled: boolean) => `# Art direction\n\n${sections.map((section) => `## ${section}\n${filled ? "Done" : "TODO: fill in"}`).join("\n\n")}\n`;

function run(dir: string): { code: number; output: string } {
  const source = readFileSync(new URL("./check-art-direction.ts", import.meta.url), "utf8");
  const script = join(dir, "check.ts");
  writeFileSync(script, source);
  const result = Bun.spawnSync([process.execPath, script], { cwd: dir });
  return { code: result.exitCode, output: new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr) };
}

describe("check-art-direction", () => {
  test("fails a fixture with placeholders and names the section", () => {
    const dir = mkdtempSync(join(process.cwd(), ".check-art-direction-"));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "game.config.ts"), "export {};");
    writeFileSync(join(dir, "src", "art-direction.md"), documentFor(false));
    const result = run(dir);
    rmSync(dir, { recursive: true, force: true });
    expect(result.code).toBe(1);
    expect(result.output).toContain("Reference images");
  });

  test("passes a filled fixture", () => {
    const dir = mkdtempSync(join(process.cwd(), ".check-art-direction-"));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "game.config.ts"), "export {};");
    writeFileSync(join(dir, "src", "art-direction.md"), documentFor(true));
    const result = run(dir);
    rmSync(dir, { recursive: true, force: true });
    expect(result.code).toBe(0);
  });
});
