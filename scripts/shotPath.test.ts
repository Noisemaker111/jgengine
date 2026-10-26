import { expect, test } from "bun:test";
import { join, resolve } from "node:path";

import { driveShotPath, shootOutPath, shotsDir } from "./shotPath";

const dir = shotsDir(resolve(import.meta.dir, "fixture-repo"));

test("a drive shot lands in shots/<game>/, never a game's docs folder", () => {
  expect(driveShotPath(dir, "harbor-heat", "before")).toBe(join(dir, "harbor-heat", "before.png"));
  expect(driveShotPath(dir, "harbor-heat", "../docs/escape")).toBe(join(dir, "harbor-heat", "escape.png"));
});

test("shoot --out: a bare name lands in shots/, a docs path is refused with the fix, any other path stands", () => {
  expect(shootOutPath("harbor-boot", dir)).toBe(join(dir, "harbor-boot.png"));
  expect(shootOutPath("harbor-boot.png", dir)).toBe(join(dir, "harbor-boot.png"));
  expect(() => shootOutPath("docs/harbor-boot.png", dir)).toThrow("shots/ folder");
  expect(() => shootOutPath("games/harbor-heat/docs/x.png", dir)).toThrow("--out x.png");
  expect(shootOutPath(".scratch/x.png", dir)).toBe(resolve(".scratch/x.png"));
});
