import { spawnSync } from "node:child_process";
import { describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sections = ["Reference images", "World palette", "Material language", "Lighting mood", "Silhouette rules", "UI typography", "Chosen look"];
const documentFor = (filled: boolean) => `# Art direction\n\n${sections.map((section) => `## ${section}\n${filled ? "Done" : "TODO: fill in"}`).join("\n\n")}\n`;

function run(dir: string): { code: number; output: string } {
  const source = readFileSync(new URL("./check-art-direction.ts", import.meta.url), "utf8");
  const script = join(dir, "check.ts");
  writeFileSync(script, source);
  const result = Bun.spawnSync([process.execPath, script], { cwd: dir, env: { ...process.env, CI: "" } });
  return { code: result.exitCode, output: new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr) };
}

describe("check-art-direction", () => {
  test("fails a fixture with placeholders and names the section", () => {
    const dir = mkdtempSync(join(tmpdir(), "check-art-direction-"));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "game.config.ts"), "export {};");
    writeFileSync(join(dir, "src", "art-direction.md"), documentFor(false));
    const result = run(dir);
    rmSync(dir, { recursive: true, force: true });
    expect(result.code).toBe(1);
    expect(result.output).toContain("Reference images");
  });

  test("passes a filled fixture", () => {
    const dir = mkdtempSync(join(tmpdir(), "check-art-direction-"));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "game.config.ts"), "export {};");
    writeFileSync(join(dir, "src", "art-direction.md"), documentFor(true));
    const result = run(dir);
    rmSync(dir, { recursive: true, force: true });
    expect(result.code).toBe(0);
  });
});

function fixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "jg-art-gate-"));
  try {
    mkdirSync(join(root, "scripts"));
    copyFileSync(join(import.meta.dir, "check-art-direction.ts"), join(root, "scripts/check-art-direction.ts"));
    writeFileSync(join(root, "scripts/art-direction-baseline.json"), "[]");
    for (const [file, text] of Object.entries(files)) {
      const path = join(root, file);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, text);
    }
    return spawnSync(process.execPath, ["scripts/check-art-direction.ts"], {
      cwd: root, encoding: "utf8", env: { ...process.env, CI: "true" }, timeout: 10_000,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("art gate ignores helper packages and validates playable game art", () => {
  const result = fixture({
    "Games/registry/src/index.ts": "export {};",
    "Games/shared/src/index.ts": "export {};",
    "Games/studios/src/index.ts": "export {};",
    "Games/probe/src/index.tsx": "export {};",
    "Games/probe/src/art-direction.md": "## Palette\n- Amber against slate.\n",
  });
  expect(result.status).toBe(0);
});

test("art gate requires documents for either game entry and rejects unfinished art", () => {
  const result = fixture({
    "Games/entry/src/index.tsx": "export {};",
    "Games/config/src/game.config.ts": "export {};",
    "Games/unfinished/src/index.tsx": "export {};",
    "Games/unfinished/src/art-direction.md": "## Palette\nTODO: fill in\n",
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("entry: missing src/art-direction.md");
  expect(result.stderr).toContain("config: missing src/art-direction.md");
  expect(result.stderr).toContain("unfinished: Palette: TODO: fill in");
});
