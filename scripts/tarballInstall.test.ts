import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeExposedSubpaths,
  distExists,
  isForbiddenSubpath,
  packageDir,
  publishedPackages,
  readPackageJson,
} from "./exportManifest";

const built = publishedPackages.every((pkg) => distExists(pkg));

interface PackEntry {
  path: string;
}

function packedFiles(pkg: (typeof publishedPackages)[number]): string[] {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: packageDir(pkg),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const parsed = JSON.parse(out) as Array<{ files: PackEntry[] }>;
  return parsed[0].files.map((f) => f.path.replaceAll("\\", "/"));
}

function explicitExportTargets(pkg: (typeof publishedPackages)[number]): string[] {
  const exportsMap = readPackageJson(pkg).exports ?? {};
  const targets: string[] = [];
  for (const [key, value] of Object.entries(exportsMap)) {
    if (key.includes("*")) continue;
    const record = value as Record<string, unknown>;
    const target = record.default ?? record.types;
    if (typeof target === "string") targets.push(target.replace(/^\.\//, ""));
  }
  return targets;
}

describe.if(built)("published tarball contents", () => {
  test.each(publishedPackages)("@jgengine/%s ships dist but never a test fixture or spec", (pkg) => {
    const files = packedFiles(pkg);
    expect(files.some((f) => f.startsWith("dist/"))).toBe(true);
    const leaked = files.filter((f) => isForbiddenSubpath(f.replace(/^dist\//, "").replace(/\.js$|\.d\.ts$/, "")));
    expect({ pkg, leaked }).toEqual({ pkg, leaked: [] });
    for (const target of explicitExportTargets(pkg)) {
      expect(files).toContain(target);
    }
  });
});

function installTarball(pkg: (typeof publishedPackages)[number]): { consumer: string; scope: string } {
  const work = mkdtempSync(join(tmpdir(), `jgengine-tarball-${pkg}-`));
  const packed = execFileSync("npm", ["pack", "--pack-destination", work, "--json"], {
    cwd: packageDir(pkg),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const tgz = (JSON.parse(packed) as Array<{ filename: string }>)[0].filename;
  const extractDir = join(work, "extract");
  mkdirSync(extractDir, { recursive: true });
  execFileSync("tar", ["-xzf", join(work, tgz), "-C", extractDir]);
  const scope = join(work, "consumer", "node_modules", "@jgengine");
  mkdirSync(scope, { recursive: true });
  renameSync(join(extractDir, "package"), join(scope, pkg));
  return { consumer: join(work, "consumer"), scope };
}

describe.if(built)("clean-consumer resolution of the real tarball (zero-dep packages, offline)", () => {
  test("@jgengine/core resolves its public entry but not its build-excluded test fixtures", () => {
    const { consumer } = installTarball("core");
    try {
      const script = [
        "import { VERSION } from '@jgengine/core';",
        "if (typeof VERSION !== 'string') throw new Error('VERSION not exported');",
        "let blocked = false;",
        "try { await import('@jgengine/core/testFixtures'); } catch { blocked = true; }",
        "if (!blocked) throw new Error('testFixtures was importable from the tarball');",
        "console.log('ok');",
      ].join("\n");
      const out = execFileSync("node", ["--input-type=module", "-e", script], {
        cwd: consumer,
        encoding: "utf8",
      });
      expect(out.trim()).toBe("ok");
    } finally {
      rmSync(join(consumer, ".."), { recursive: true, force: true });
    }
  });

  test("@jgengine/github resolves its public entry, wildcard rejects unknown subpaths", () => {
    const { consumer } = installTarball("github");
    try {
      const script = [
        "await import('@jgengine/github');",
        "let blocked = false;",
        "try { await import('@jgengine/github/testFixtures'); } catch { blocked = true; }",
        "if (!blocked) throw new Error('unknown subpath resolved');",
        "console.log('ok');",
      ].join("\n");
      const out = execFileSync("node", ["--input-type=module", "-e", script], {
        cwd: consumer,
        encoding: "utf8",
      });
      expect(out.trim()).toBe("ok");
    } finally {
      rmSync(join(consumer, ".."), { recursive: true, force: true });
    }
  });
});

test.if(built)("node test fixtures exist in source but are build-excluded", () => {
  expect(existsSync(join(packageDir("node"), "src", "testFixtures.ts"))).toBe(true);
  expect(computeExposedSubpaths("node")).not.toContain("./testFixtures");
  const distFixtures = readdirSync(join(packageDir("node"), "dist")).filter((f) => f.includes("testFixtures"));
  expect(distFixtures).toEqual([]);
});
