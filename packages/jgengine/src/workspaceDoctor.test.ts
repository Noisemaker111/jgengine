import { expect, test, spyOn } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { diagnose, runDoctor } from "./doctor";
import { inspectWorkspaceSdkInstall } from "./workspaceDoctor";

function manifest(dir: string, data: object) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "package.json"), JSON.stringify(data)); }
async function fixture(run: (root: string, studio: string) => void | Promise<void>, pattern = "games/*") {
  const root = mkdtempSync(join(tmpdir(), "jgengine-workspace-doctor-"));
  const studio = join(root, ".linked", "studio");
  try {
    manifest(root, { workspaces: { packages: [pattern], catalog: { "@jgengine/core": "0.19.0", "@jgengine/shell": "0.19.0" }, catalogs: { runtime: { "@jgengine/ws": "0.19.0" } } } });
    const gameBase = pattern === "*" ? root : join(root, "games");
    manifest(join(gameBase, "field"), { name: "field", dependencies: { "@jgengine/core": "catalog:", "@jgengine/shell": "catalog:", "@example/studio": "file:../../.linked/studio" } });
    manifest(join(gameBase, "server"), { name: "server", dependencies: { "@jgengine/core": "catalog:", "@jgengine/ws": "catalog:runtime" } });
    for (const [name, deps] of [["core", {}], ["shell", { "@jgengine/core": "^0.19.0" }], ["ws", { "@jgengine/core": "^0.19.0" }]] as const) {
      manifest(join(root, "node_modules", "@jgengine", name), { name: `@jgengine/${name}`, version: "0.19.0", dependencies: deps });
    }
    manifest(studio, { name: "@example/studio", version: "1.0.0", peerDependencies: { "@jgengine/core": "^0.19.0" } });
    manifest(join(studio, "node_modules", "@jgengine", "core"), { name: "@jgengine/core", version: "0.18.1" });
    mkdirSync(join(root, "node_modules", "@example"), { recursive: true });symlinkSync(studio, join(root, "node_modules", "@example", "studio"), "dir");
    await run(root, studio);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test.each(["games/*", "*"])("one root command checks distinct workspace consumers under %s and catches one private stale SDK", async pattern => {
  await fixture((root, studio) => {
    const normal = diagnose(root).find(finding => finding.label === "installed SDK dependency identities are coherent");
    expect(normal?.ok).toBe(true);
    const before = readFileSync(join(root, "package.json"), "utf8");
    const report = inspectWorkspaceSdkInstall(root);
    expect(report.coverage.complete).toBe(true);expect(report.projects).toHaveLength(3);
    expect(report.projects.find(project => project.name === "field")?.graph.issues.some(issue => issue.kind === "identity-split")).toBe(true);
    expect(report.projects.find(project => project.name === "server")?.graph.issues).toEqual([]);
    const output = spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(runDoctor([root, "--workspace", "--json"])).toBe(1);
      expect(JSON.parse(String(output.mock.calls.at(-1)?.[0])).status).toBe("fail");
      rmSync(join(studio, "node_modules"), { recursive: true });
      expect(runDoctor(["--workspace", root, "--json"])).toBe(0);
      const repaired = JSON.parse(String(output.mock.calls.at(-1)?.[0]));expect(repaired.status).toBe("pass");
      expect(repaired.coverage.complete).toBe(true);expect(readFileSync(join(root, "package.json"), "utf8")).toBe(before);
    } finally { output.mockRestore(); }
  }, pattern);
});

test.each(["**/*", "games/*/nested", "../outside", "/tmp", "node_modules/*", "games/?", "games/{first,second}"])("unsupported pattern %s refuses complete coverage", async pattern => {
  await fixture(root => {
    const file = join(root, "package.json");const data = JSON.parse(readFileSync(file, "utf8"));data.workspaces.packages = [pattern];writeFileSync(file, JSON.stringify(data));
    const report = inspectWorkspaceSdkInstall(root);expect(report.status).toBe("incomplete");expect(report.coverage.errors.join(" ")).toContain("unsupported workspace pattern");
  });
});

test("literal missing and malformed manifests and unmatched wildcards report incomplete coverage", async () => {
  await fixture(root => {
    const file = join(root, "package.json");const data = JSON.parse(readFileSync(file, "utf8"));
    data.workspaces.packages = ["games/absent", "games/field", "empty/*"];writeFileSync(file, JSON.stringify(data));
    writeFileSync(join(root, "games", "field", "package.json"), "{broken}");mkdirSync(join(root, "empty"));
    const report = inspectWorkspaceSdkInstall(root);expect(report.status).toBe("incomplete");
    expect(report.coverage.errors.some(error => error.includes("absent"))).toBe(true);
    expect(report.coverage.errors.some(error => error.includes("field/package.json"))).toBe(true);
    expect(report.coverage.errors.some(error => error.includes("matched no readable"))).toBe(true);
  });
});

test("outside and broken wildcard symlinks fail coverage while inside aliases deduplicate", async () => {
  const outside = mkdtempSync(join(tmpdir(), "jgengine-workspace-outside-"));
  try {
    manifest(outside, { name: "outside" });
    await fixture(root => {
      symlinkSync(join(root, "games", "field"), join(root, "games", "alias"), "dir");
      const deduplicated = inspectWorkspaceSdkInstall(root);expect(deduplicated.projects).toHaveLength(3);expect(deduplicated.coverage.complete).toBe(true);
      symlinkSync(outside, join(root, "games", "escape"), "dir");symlinkSync(join(root, "nonexistent"), join(root, "games", "broken"), "dir");
      const report = inspectWorkspaceSdkInstall(root);expect(report.status).toBe("incomplete");
      expect(report.coverage.exclusions.some(item => item.path.endsWith("escape"))).toBe(true);
      expect(report.coverage.errors.some(error => error.includes("broken"))).toBe(true);
      expect(report.projects.some(project => project.directory === outside)).toBe(false);
    });
  } finally { rmSync(outside, { recursive: true, force: true }); }
});

test("manifest symlinks cannot escape the root even when the directory stays inside", async () => {
  const outside = mkdtempSync(join(tmpdir(), "jgengine-workspace-manifest-"));
  try {
    manifest(outside, { name: "outside" });
    await fixture(root => {
      const file = join(root, "games", "field", "package.json");rmSync(file);symlinkSync(join(outside, "package.json"), file);
      const report = inspectWorkspaceSdkInstall(root);expect(report.status).toBe("incomplete");
      expect(report.coverage.exclusions.some(item => item.reason.includes("manifest symlink"))).toBe(true);
    });
  } finally { rmSync(outside, { recursive: true, force: true }); }
});

test("pattern, directory-entry, candidate read-attempt and manifest budgets all report incomplete coverage", async () => {
  await fixture(root => {
    const file = join(root, "package.json");const data = JSON.parse(readFileSync(file, "utf8"));data.workspaces.packages = ["games/*", "games/field"];writeFileSync(file, JSON.stringify(data));
    expect(inspectWorkspaceSdkInstall(root, { maxPatterns: 1 }).coverage.errors.join(" ")).toContain("pattern budget");
    expect(inspectWorkspaceSdkInstall(root, { maxManifests: 1 }).coverage.errors.join(" ")).toContain("manifest budget");
    expect(inspectWorkspaceSdkInstall(root, { maxReadAttempts: 1 }).coverage.errors.join(" ")).toContain("read-attempt budget");
    mkdirSync(join(root, "nongames"));for (let index=0;index<20;index++)writeFileSync(join(root, "nongames", `note-${index}.txt`), "nothing");
    data.workspaces.packages = ["nongames/*"];writeFileSync(file, JSON.stringify(data));
    const limited = inspectWorkspaceSdkInstall(root, { maxDirectoryEntries: 2 });expect(limited.coverage.directoryEntriesExamined).toBe(2);
    expect(limited.coverage.errors.join(" ")).toContain("directory-entry budget");expect(limited.status).toBe("incomplete");
    rmSync(join(root, "nongames"), { recursive: true });mkdirSync(join(root, "nongames"));for (let index=0;index<20;index++)mkdirSync(join(root, "nongames", `empty-${index}`));
    const reads = inspectWorkspaceSdkInstall(root, { maxReadAttempts: 3 });expect(reads.coverage.manifestReadAttempts).toBe(3);expect(reads.status).toBe("incomplete");
    expect(() => inspectWorkspaceSdkInstall(root, { maxManifests: 257 })).toThrow();
  });
});

test("array workspace layouts, overlapping patterns and node_modules exclusions preserve exact owner coverage", async () => {
  await fixture((root, studio) => {
    rmSync(join(studio, "node_modules"), { recursive: true });
    const file = join(root, "package.json");const data = JSON.parse(readFileSync(file, "utf8"));data.workspaces = ["games/*", "games/field"];writeFileSync(file, JSON.stringify(data));
    for (const game of ["field", "server"]) {
      const path = join(root, "games", game, "package.json");const pkg = JSON.parse(readFileSync(path, "utf8"));
      for (const name of Object.keys(pkg.dependencies)) if (name.startsWith("@jgengine/")) pkg.dependencies[name] = "^0.19.0";
      writeFileSync(path, JSON.stringify(pkg));
    }
    manifest(join(root, "games", "node_modules", "fake"), { name: "ignored" });
    const report = inspectWorkspaceSdkInstall(root);expect(report.coverage.complete).toBe(true);expect(report.projects).toHaveLength(3);expect(report.status).toBe("pass");
    expect(report.projects.some(project => project.name === "ignored")).toBe(false);
  });
});

test.each(["null", "{broken}", '{"workspaces":{"packages":"*"}}', '{"workspaces":[2]}'])("malformed root %s produces machine-readable incomplete coverage", async text => {
  await fixture(root => {
    writeFileSync(join(root, "package.json"), text);
    const output = spyOn(console, "log").mockImplementation(() => {});
    try { expect(runDoctor([root, "--workspace", "--json"])).toBe(1);expect(JSON.parse(String(output.mock.calls.at(-1)?.[0])).status).toBe("incomplete"); }
    finally { output.mockRestore(); }
  });
});

test("shared manifest files retain distinct directory resolver contexts", async () => {
  await fixture((root, studio) => {
    rmSync(join(studio, "node_modules"), { recursive: true });
    const template = join(root, "template");manifest(template, { name: "shared", dependencies: { "@jgengine/core": "catalog:" } });
    for (const game of ["field", "server"]) {
      const file = join(root, "games", game, "package.json");rmSync(file);symlinkSync(join(template, "package.json"), file);
    }
    manifest(join(root, "games", "server", "node_modules", "@jgengine", "core"), { name: "@jgengine/core", version: "0.18.1" });
    const report = inspectWorkspaceSdkInstall(root);expect(report.coverage.complete).toBe(true);expect(report.projects).toHaveLength(3);
    expect(report.projects.find(project => project.directory.endsWith("server"))?.graph.issues.some(issue => issue.kind === "declaration-mismatch")).toBe(true);
    expect(report.status).toBe("fail");
  });
});

test("a dangling wildcard manifest symlink is unreadable coverage rather than an optional absent package", async () => {
  await fixture((root, studio) => {
    rmSync(join(studio, "node_modules"), { recursive: true });mkdirSync(join(root, "games", "bad"));
    symlinkSync(join(root, "nonexistent-package.json"), join(root, "games", "bad", "package.json"));
    const report = inspectWorkspaceSdkInstall(root);expect(report.status).toBe("incomplete");expect(report.coverage.errors.some(error => error.includes("bad/package.json"))).toBe(true);
  });
});

test("an installed SDK graph budget prevents a complete workspace verdict", async () => {
  await fixture(root => {
    const file = join(root, "games", "server", "package.json");
    const data = JSON.parse(readFileSync(file, "utf8"));
    data.dependencies = Object.fromEntries(Array.from({ length: 257 }, (_, index) => [`fixture-${index}`, "1.0.0"]));
    writeFileSync(file, JSON.stringify(data));
    const report = inspectWorkspaceSdkInstall(root);
    expect(report.status).toBe("incomplete");
    expect(report.coverage.errors.some(error => error.includes("256 direct declarations"))).toBe(true);
  });
});

test("the built Node CLI drains a workspace JSON report larger than a pipe buffer", () => {
  const root = mkdtempSync(join(tmpdir(), "jgengine-workspace-stdout-"));
  try {
    manifest(root, { workspaces: ["games/*"] });
    manifest(join(root, "node_modules", "@jgengine", "core"), { name: "@jgengine/core", version: "0.19.0" });
    for (let index = 0; index < 120; index++) manifest(join(root, "games", `game-${index}`), {
      name: `game-${index}`, dependencies: { "@jgengine/core": "0.19.0" },
    });
    const result = spawnSync("node", [join(import.meta.dir, "..", "dist", "cli", "index.js"), "doctor", "--workspace", root, "--json"], { encoding: "utf8" });
    expect(result.error).toBeUndefined();expect(result.status).toBe(0);expect(result.stderr).toBe("");
    expect(Buffer.byteLength(result.stdout)).toBeGreaterThan(65_536);
    const report = JSON.parse(result.stdout);
    expect(report.status).toBe("pass");expect(report.coverage.complete).toBe(true);expect(report.projects).toHaveLength(121);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
