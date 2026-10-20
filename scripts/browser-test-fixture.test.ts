import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gotoFixture, installPublicPackages, packPublicPackage } from "./browser-test-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const built = existsSync(join(import.meta.dir, "../packages/ws/dist"));

test.skipIf(!built)("installs only the published file set and packs each package once per process", async () => {
  const [first, second] = [mkdtempSync(join(tmpdir(), "jg-public-a-")), mkdtempSync(join(tmpdir(), "jg-public-b-"))];
  roots.push(first, second);
  await Promise.all([installPublicPackages(first, ["ws"]), installPublicPackages(second, ["ws"])]);
  const installed = join(first, "node_modules/@jgengine/ws");
  expect(JSON.parse(readFileSync(join(installed, "package.json"), "utf8")).name).toBe("@jgengine/ws");
  expect(existsSync(join(installed, "dist"))).toBe(true);
  expect(existsSync(join(installed, "src"))).toBe(false);
  expect(existsSync(join(second, "node_modules/@jgengine/ws/package.json"))).toBe(true);
  expect(packPublicPackage("ws")).toBe(packPublicPackage("ws"));
});

test("a page error during load fails the fixture wait at once", async () => {
  const listeners = new Set<(error: Error) => void>();
  const page = {
    goto: async () => { for (const listener of listeners) listener(new Error("fixture exploded")); },
    once: (_event: "pageerror", listener: (error: Error) => void) => listeners.add(listener),
    off: (_event: "pageerror", listener: (error: Error) => void) => listeners.delete(listener),
  };
  await expect(gotoFixture(page, "http://fixture", () => new Promise(() => {}))).rejects.toThrow("fixture exploded");
  expect(listeners.size).toBe(0);
});
