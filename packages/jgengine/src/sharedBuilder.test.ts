import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gameTemplate } from "./templates";
import { runCreate } from "./create";
import type { GameRuntime } from "../../core/src/runtime/gameRuntime";

const options = { id: "shared-probe", name: "Shared Probe", variant: "standalone" as const, engineVersion: "0.18.1", shape: "shared-world-builder" as const };

test("shared builder emits unique connected host files, bounded ticks and component sources", () => {
  const files = gameTemplate(options);
  const contents = (path: string) => files.find(file => file.path === path)!.contents;
  expect(new Set(files.map(file => file.path)).size).toBe(files.length);
  expect(JSON.parse(contents("package.json")).dependencies["@jgengine/convex"]).toBe("^0.18.1");
  expect(contents("src/main.tsx")).toContain("resolveConvexMultiplayer");
  expect(contents("src/main.tsx")).toContain("ConvexProvider");
  expect(contents("src/game.config.ts")).toContain('servers({ topology: "shared"');
  expect(contents("src/game/ui/GameUI.tsx")).toContain("ChatPanel");
  expect(contents("src/index.css")).toContain('@source "../node_modules/@jgengine/react/dist"');
  expect(contents("src/index.css")).toContain('@source "../node_modules/@jgengine/shell/dist"');
  expect(contents("convex/online.ts")).toContain("batchSize: 25");
  expect(contents("convex/online.ts")).toContain("continuation: scanRef");
  expect(contents("convex/online.ts")).not.toContain(".collect()");
  const transpiler = new Bun.Transpiler({ loader: "tsx", target: "bun" });
  for (const file of files.filter(file => /\.tsx?$/.test(file.path))) expect(() => transpiler.transformSync(file.contents)).not.toThrow();
});

test("generated runtime scopes claims and accrues fractional income without a loop tick", async () => {
  const code = gameTemplate(options).find(file => file.path === "convex/gameRuntime.ts")!.contents;
  const runnable = code.replace(/@jgengine\/core\/([^"\n]+)/g, (_match, path: string) => pathToFileURL(resolve(import.meta.dir, "../../core/src", path + ".ts")).href);
  const path = join(mkdtempSync(join(tmpdir(), "jg-shared-runtime-")), "runtime.ts");
  writeFileSync(path, runnable);
  const { runtime } = await import(pathToFileURL(path).href) as { runtime: GameRuntime };
  expect(runtime.topology).toBe("shared");
  expect(runtime.hasTick).toBe(false);
  expect(runtime.commandScope("claim", { x: 0, z: 0 }, "alice")?.chunkKeys).toHaveLength(9);
  let snapshot = runtime.hydrate({ gameId: "shared-probe", serverId: "world", serverRow: { objects: [], entities: [], session: {} }, playersByUserId: {}, chunksByKey: {}, nowMs: 0 });
  snapshot = runtime.joinPlayer(snapshot, "alice", true, 0);
  const income = runtime.runCommand(snapshot, "alice", "accrue", {}, 1000);
  expect(income.ok).toBe(true);
  if (!income.ok) throw new Error(income.reason);
  expect(income.snapshot.players.alice!.economy.cash).toBe(100.005);
  const claim = runtime.runCommand(income.snapshot, "alice", "claim", { x: 0, z: 0 }, 1000);
  expect(claim.ok).toBe(true);
  if (!claim.ok) throw new Error(claim.reason);
  expect(claim.snapshot.chunks["0,0"]!.territory?.["0,0"]).toBe("alice");
  expect(claim.snapshot.players.alice!.economy.cash).toBe(99.005);
});

test("create parses --shape before the name and rejects unknown shapes", () => {
  const root = mkdtempSync(join(tmpdir(), "jg-shared-create-"));
  const flags = ["--no-install", "--no-skills", "--no-assets", "--standalone"];
  expect(runCreate(["--shape", "shared-world-builder", join(root, "Shared World"), ...flags])).toBe(0);
  expect(runCreate([join(root, "Other"), "--shape", "unknown", ...flags])).toBe(1);
});
