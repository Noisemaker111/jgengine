import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

function installTarballs(packages: readonly (typeof publishedPackages)[number][]): { consumer: string; scope: string } {
  const work = mkdtempSync(join(tmpdir(), "jgengine-tarballs-"));
  const scope = join(work, "consumer", "node_modules", "@jgengine");
  mkdirSync(scope, { recursive: true });
  for (const pkg of packages) {
    const packed = execFileSync("npm", ["pack", "--pack-destination", work, "--json"], {
      cwd: packageDir(pkg),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const tgz = (JSON.parse(packed) as Array<{ filename: string }>)[0].filename;
    const extractDir = join(work, `extract-${pkg}`);
    mkdirSync(extractDir, { recursive: true });
    execFileSync("tar", ["-xzf", join(work, tgz), "-C", extractDir]);
    renameSync(join(extractDir, "package"), join(scope, pkg));
  }
  return { consumer: join(work, "consumer"), scope };
}

function linkPeer(consumer: string, packageName: string): void {
  const packageRoot = join(packageDir("react"), "node_modules", packageName);
  const target = join(consumer, "node_modules", packageName);
  mkdirSync(dirname(target), { recursive: true });
  symlinkSync(packageRoot, target, "junction");
}

describe.if(built)("clean-consumer resolution of the real tarball (zero-dep packages, offline)", () => {
  test("@jgengine/core resolves its public entry but not its build-excluded test fixtures", () => {
    const { consumer } = installTarballs(["core"]);
    try {
      const script = [
        "import { VERSION } from '@jgengine/core';",
        "import { createEffectSystem } from '@jgengine/core/combat/effects';",
        "import { applyStatPoolDelta, createStatPool } from '@jgengine/core/stats/statPool';",
        "if (typeof VERSION !== 'string') throw new Error('VERSION not exported');",
        "const resources = { rover: { energy: createStatPool({ current: 8, max: 10 }) } };",
        "const access = { get: (owner, stat) => resources[owner]?.[stat] ?? null, set: (owner, stat, next) => { resources[owner][stat] = next; } };",
        "const changed = applyStatPoolDelta(access, 'rover', 'energy', -3);",
        "if (changed.status !== 'ok' || resources.rover.energy.current !== 5) throw new Error('portable stat pool failed');",
        "const effects = createEffectSystem({ resolveReceive: () => ({ damage: { order: ['energy'] } }), statPools: access, getStat: () => null, spatial: { inRadius: () => [], hasLineOfSight: () => true, positionOf: () => undefined } });",
        "const applied = effects.applyEffect({ from: 'hazard', to: 'rover', effect: 'damage', via: { amount: 2 } });",
        "if (applied[0]?.applied[0]?.delta !== -2 || resources.rover.energy.current !== 3) throw new Error('portable effects failed');",
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
  }, 180_000);

  test("@jgengine/github resolves its public entry, wildcard rejects unknown subpaths", () => {
    const { consumer } = installTarballs(["github"]);
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
  }, 60_000);

  test("portable marker source and React minimap resolve together from real tarballs", () => {
    const { consumer } = installTarballs(["core", "react"]);
    try {
      linkPeer(consumer, "react");
      const script = [
        "import { createMarkerSource } from '@jgengine/core/world/markers';",
        "import { Minimap } from '@jgengine/react/map';",
        "const units = [{ id: 'u1', x: 2, z: 4 }];",
        "const markers = createMarkerSource({ getSnapshot: () => units, project: (unit) => ({ id: unit.id, position: [unit.x, 0, unit.z] }) });",
        "if (markers.getSnapshot()[0]?.id !== 'u1') throw new Error('portable marker source failed');",
        "if (typeof Minimap !== 'function') throw new Error('Minimap export failed');",
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
  }, 60_000);
});

test.if(built)("node test fixtures exist in source but are build-excluded", () => {
  expect(existsSync(join(packageDir("node"), "src", "testFixtures.ts"))).toBe(true);
  expect(computeExposedSubpaths("node")).not.toContain("./testFixtures");
  const distFixtures = readdirSync(join(packageDir("node"), "dist")).filter((f) => f.includes("testFixtures"));
  expect(distFixtures).toEqual([]);
});
