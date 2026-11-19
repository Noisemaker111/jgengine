// Tests that read a game's downloaded models from `public/`. CI never downloads models (Jon, 25 Oct),
// so these run only on a machine with the shared asset store: verify:fast and lane:close run them
// there, and a worktree links the packs at creation. On a machine without them they fail naming
// every missing file and the one command that fixes it, instead of a bare `false`.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "bun:test";

export const inCi = (env: Readonly<Record<string, string | undefined>> = process.env): boolean =>
  env.CI !== undefined && env.CI !== "" && env.CI !== "false";

export const assetTest: typeof test = inCi() ? (test.skip as typeof test) : test;

export function missingServed(publicRoot: string, urls: readonly string[]): string[] {
  return urls
    .filter((url) => !existsSync(join(publicRoot, url)))
    .map((url) => `${url} is not on disk; run: bun run games:provision`);
}
