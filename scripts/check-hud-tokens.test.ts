import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

function run(): { code: number; output: string } {
  const result = Bun.spawnSync([process.execPath, join(import.meta.dir, "check-hud-tokens.ts")], { cwd: root, env: { ...process.env, CI: "" }, timeout: 60_000 });
  return { code: result.exitCode, output: new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr) };
}

describe("check-hud-tokens", () => {
  test("every --jg-* token the shipped components read is emitted by the theme or listed as opt-in", () => {
    const result = run();
    expect(result.output).toContain("check-hud-tokens: ok");
    expect(result.code).toBe(0);
  });

  test("the kit-pane opt-in tokens are read only with a theme-token fallback", async () => {
    const settings = await Bun.file(join(root, "packages/react/src/settingsBlocks.tsx")).text();
    for (const match of settings.matchAll(/var\(--jg-(on-accent|accent-text), ([^)]*)/g)) expect(match[2]!.startsWith("var(--jg-")).toBe(true);
    expect(settings).toContain("var(--jg-on-accent, var(--jg-surface-deep");
  });
});
