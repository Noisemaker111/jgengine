import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { diagnose } from "./doctor";
import { inspectInstalledSdkGraph } from "./compatibility";

function writePackage(root: string, name: string, version: string, extra: object = {}) {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name, version, type: "module", exports: { "./identity": "./identity.js" }, ...extra }));
  writeFileSync(join(root, "identity.js"), "export const identity = {};\n");
  return root;
}

async function fixture(run: (root: string, game: string, studio: string) => void | Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), "jgengine-installed-graph-"));
  try {
    const game = join(root, "games", "field"); mkdirSync(game, { recursive: true });
    const studio = writePackage(join(root, "studios"), "@example/studio", "1.0.0", { dependencies: { "@jgengine/shell": "^0.18.0" } });
    writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces: { packages: ["games/*"], catalog: { "@jgengine/core": "0.19.0", "@jgengine/shell": "0.19.0" }, catalogs: { runtime: { "@jgengine/ws": "0.19.0" } } } }));
    writeFileSync(join(game, "package.json"), JSON.stringify({ type: "module", dependencies: { "@jgengine/core": "catalog:", "@jgengine/shell": "catalog:", "@example/studio": "file:../../studios" } }));
    writeFileSync(join(game, "tsconfig.json"), "{}");
    writePackage(join(root, "node_modules", "@jgengine", "core"), "@jgengine/core", "0.19.0");
    writePackage(join(root, "node_modules", "@jgengine", "ws"), "@jgengine/ws", "0.19.0", { dependencies: { "@jgengine/core": "^0.19.0" } });
    writePackage(join(root, "node_modules", "@jgengine", "shell"), "@jgengine/shell", "0.19.0", { dependencies: { "@jgengine/core": "^0.19.0" }, peerDependencies: { "@jgengine/ws": "^0.19.0" } });
    mkdirSync(join(root, "node_modules", "@example"), { recursive: true });
    symlinkSync(studio, join(root, "node_modules", "@example", "studio"), "dir");
    writePackage(join(studio, "node_modules", "@jgengine", "shell"), "@jgengine/shell", "0.18.1", { dependencies: { "@jgengine/core": "^0.18.1" } });
    writePackage(join(studio, "node_modules", "@jgengine", "core"), "@jgengine/core", "0.18.1");
    await run(root, game, studio);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("doctor catches a linked consumer's private SDK although the game's direct catalog versions agree", async () => {
  await fixture((root, game, studio) => {
    expect(createRequire(join(game, "package.json")).resolve("@jgengine/core/identity")).toBe(join(root, "node_modules", "@jgengine", "core", "identity.js"));
    expect(createRequire(join(studio, "package.json")).resolve("@jgengine/core/identity")).toBe(join(studio, "node_modules", "@jgengine", "core", "identity.js"));
    const before = readFileSync(join(root, "package.json"), "utf8");
    const finding = diagnose(game).find(entry => entry.label === "installed SDK dependency identities are coherent");
    expect(finding?.ok).toBe(false);
    expect(finding?.fix).toContain("@example/studio");
    expect(finding?.fix).toContain("0.18.1");
    expect(finding?.fix).toContain("0.19.0");
    expect(finding?.fix).toContain(studio);
    expect(finding?.fix).toContain(root);
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(before);
  });
});

test("same-version copies still split module identity in a differently composed peer consumer", async () => {
  await fixture(async (root, game, studio) => {
    const relay = writePackage(join(root, "relay"), "@example/relay", "1.0.0", { peerDependencies: { "@jgengine/core": "^0.19.0" } });
    symlinkSync(relay, join(root, "node_modules", "@example", "relay"), "dir");
    writePackage(join(relay, "node_modules", "@jgengine", "core"), "@jgengine/core", "0.19.0");
    writeFileSync(join(game, "package.json"), JSON.stringify({ dependencies: { "@jgengine/ws": "catalog:runtime", "@example/relay": "file:../../relay" } }));
    const canonical = createRequire(join(game, "package.json")).resolve("@jgengine/core/identity");
    const privateEntry = createRequire(join(relay, "package.json")).resolve("@jgengine/core/identity");
    expect((await import(canonical)).identity).not.toBe((await import(privateEntry)).identity);
    const graph = inspectInstalledSdkGraph(game);
    expect(graph.issues.some(issue => issue.kind === "identity-split" && issue.name === "@jgengine/core")).toBe(true);
    expect(graph.edges.some(edge => edge.kind === "peer" && edge.from === relay)).toBe(true);
    expect(graph.nodes.some(node => node.root === studio)).toBe(false);
  });
});

test("coherent symlinks and optional peers pass without requiring unused catalog packages or root exports", async () => {
  await fixture((root, game, studio) => {
    rmSync(join(studio, "node_modules"), { recursive: true });
    const rootFile = join(root, "package.json"); const data = JSON.parse(readFileSync(rootFile, "utf8"));
    data.workspaces.catalog["@jgengine/editor"] = "0.18.0"; writeFileSync(rootFile, JSON.stringify(data));
    const shell = join(root, "node_modules", "@jgengine", "shell");
    const file = join(shell, "package.json"); const pkg = JSON.parse(readFileSync(file, "utf8"));
    pkg.peerDependencies["@jgengine/navbake"] = "^0.19.0"; pkg.peerDependenciesMeta = { "@jgengine/navbake": { optional: true } }; writeFileSync(file, JSON.stringify(pkg));
    const graph = inspectInstalledSdkGraph(game);
    expect(graph.issues).toEqual([]);
    expect(graph.edges.some(edge => edge.kind === "peer" && edge.dependency === "@jgengine/ws")).toBe(true);
    expect(graph.nodes.filter(node => node.name === "@jgengine/core")).toHaveLength(1);
  });
});

test("cycles are visited once and a finite package budget cannot report an incomplete inspection as coherent", async () => {
  await fixture((root, game, studio) => {
    rmSync(join(studio, "node_modules"), { recursive: true });
    const core = join(root, "node_modules", "@jgengine", "core", "package.json");
    const data = JSON.parse(readFileSync(core, "utf8")); data.dependencies = { "@jgengine/ws": "^0.19.0" }; writeFileSync(core, JSON.stringify(data));
    expect(inspectInstalledSdkGraph(game).issues).toEqual([]);
    const graph = inspectInstalledSdkGraph(game, { maxPackages: 2 });
    expect(graph.nodes.length).toBeLessThanOrEqual(2);
    expect(graph.issues.some(issue => issue.kind === "limit")).toBe(true);
    expect(() => inspectInstalledSdkGraph(game, { maxPackages: 257 })).toThrow();
  });
});

test("required missing SDK peers and corrupt private metadata produce explicit resolver errors", async () => {
  await fixture((root, game, studio) => {
    rmSync(join(root, "node_modules", "@jgengine", "ws"), { recursive: true });
    writeFileSync(join(studio, "node_modules", "@jgengine", "core", "package.json"), "null");
    const graph = inspectInstalledSdkGraph(game);
    expect(graph.issues.some(issue => issue.kind === "missing" && issue.name === "@jgengine/ws")).toBe(true);
    expect(graph.issues.some(issue => issue.kind === "malformed" && issue.message.includes(studio))).toBe(true);
  });
});

test("a single private SDK copy is compared to the shared catalog even when only a linked consumer declares it", async () => {
  await fixture((root, game) => {
    rmSync(join(root, "node_modules", "@jgengine"), { recursive: true });
    writeFileSync(join(game, "package.json"), JSON.stringify({ dependencies: { "@example/studio": "file:../../studios" } }));
    const graph = inspectInstalledSdkGraph(game);
    expect(graph.issues.some(issue => issue.kind === "declaration-mismatch" && issue.message.includes("0.19.0") && issue.message.includes("0.18.1"))).toBe(true);
  });
});

test("an explicit editor override remains independent from the runtime SDK catalog", async () => {
  await fixture((root, game, studio) => {
    rmSync(join(studio, "node_modules"), { recursive: true });
    const rootFile = join(root, "package.json");const data = JSON.parse(readFileSync(rootFile, "utf8"));
    data.workspaces.catalog["@jgengine/editor"] = "0.19.0";data.overrides = { "@jgengine/editor": "0.18.0" };writeFileSync(rootFile, JSON.stringify(data));
    const gameFile = join(game, "package.json");const pkg = JSON.parse(readFileSync(gameFile, "utf8"));pkg.dependencies["@jgengine/editor"] = "catalog:";writeFileSync(gameFile, JSON.stringify(pkg));
    writePackage(join(root, "node_modules", "@jgengine", "editor"), "@jgengine/editor", "0.18.0");
    expect(inspectInstalledSdkGraph(game).issues).toEqual([]);
  });
});

test("invalid installed semantic versions fail metadata inspection and direct declarations have a finite budget", async () => {
  await fixture((root, game, studio) => {
    writeFileSync(join(studio, "node_modules", "@jgengine", "core", "package.json"), JSON.stringify({ name: "@jgengine/core", version: "unknown" }));
    expect(inspectInstalledSdkGraph(game).issues.some(issue => issue.kind === "malformed" && issue.name === "@jgengine/core")).toBe(true);
    writeFileSync(join(game, "package.json"), JSON.stringify({ dependencies: Object.fromEntries(Array.from({length: 20}, (_, index) => [`absent-${index}`, "1.0.0"])) }));
    const graph = inspectInstalledSdkGraph(game, { maxPackages: 2 });
    expect(graph.nodes).toEqual([]);
    expect(graph.issues.some(issue => issue.kind === "limit" && issue.message.includes("direct declarations"))).toBe(true);
  });
});

test("root catalog reports distinguish uninstalled entries and uninspected workspace leaves", async () => {
  await fixture((root, game) => {
    const rootGraph = inspectInstalledSdkGraph(root);
    expect(rootGraph.scope.workspaceLeavesInspected).toBe(false);
    expect(rootGraph.issues).toEqual([]);
    expect(inspectInstalledSdkGraph(game).issues.some(issue => issue.kind === "identity-split")).toBe(true);
    rmSync(join(root, "node_modules", "@jgengine"), { recursive: true });
    const absent = inspectInstalledSdkGraph(root);
    expect(absent.nodes).toEqual([]);
    expect(absent.issues).toEqual([]);
    expect(absent.scope.uninstalledCatalogPackages).toEqual(["@jgengine/core", "@jgengine/shell", "@jgengine/ws"]);
    expect(diagnose(root).some(finding => finding.label === "installed SDK dependency identities not inspected (no installed SDK packages)")).toBe(true);
    expect(diagnose(root).some(finding => finding.label.includes("workspace leaves not inspected"))).toBe(true);
  });
});
