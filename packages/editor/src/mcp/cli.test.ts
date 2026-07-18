import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseEditorCliArgs } from "./cli";

const cliEntry = join(import.meta.dir, "cli.ts");
const repoRoot = join(import.meta.dir, "../../../..");

function buildLargeImportRpc(objectCount: number): { method: "import_document"; json: string } {
  const markers = Array.from({ length: objectCount }, (_, i) => ({
    id: `obj_${i}`,
    kind: "prop",
    position: { x: i % 40, y: 0, z: Math.floor(i / 40) },
    label: `Object ${i}`,
  }));
  const document = {
    version: 1,
    markers,
    volumes: [],
    paths: [],
    annotations: [],
  };
  return { method: "import_document", json: JSON.stringify(document) };
}

async function runCli(args: string[], stdin?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", cliEntry, ...args], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    stdin: stdin === undefined ? "ignore" : "pipe",
  });
  if (stdin !== undefined && proc.stdin) {
    proc.stdin.write(stdin);
    proc.stdin.end();
  }
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

describe("parseEditorCliArgs", () => {
  test("inline --rpc keeps the JSON string", () => {
    const opts = parseEditorCliArgs(["--game", "demo", "--rpc", '{"method":"scene_summary"}']);
    expect(opts.gameId).toBe("demo");
    expect(opts.serve).toBe(false);
    expect(opts.rpcSources).toEqual([{ kind: "inline", raw: '{"method":"scene_summary"}' }]);
  });

  test("--rpc - selects stdin", () => {
    const opts = parseEditorCliArgs(["--rpc", "-"]);
    expect(opts.rpcSources).toEqual([{ kind: "stdin" }]);
    expect(opts.serve).toBe(false);
  });

  test("--rpc-file selects a file source", () => {
    const opts = parseEditorCliArgs(["--rpc-file", "payload.json"]);
    expect(opts.rpcSources).toEqual([{ kind: "file", path: "payload.json" }]);
    expect(opts.serve).toBe(false);
  });

  test("repeated --rpc flags are kept in order", () => {
    const opts = parseEditorCliArgs([
      "--rpc",
      '{"method":"scene_summary"}',
      "--rpc",
      '{"method":"scene_apply"}',
      "--rpc-file",
      "payload.json",
    ]);
    expect(opts.rpcSources).toEqual([
      { kind: "inline", raw: '{"method":"scene_summary"}' },
      { kind: "inline", raw: '{"method":"scene_apply"}' },
      { kind: "file", path: "payload.json" },
    ]);
    expect(opts.serve).toBe(false);
  });
});

describe("editor CLI entry", () => {
  test(
    "malformed inline --rpc prints a diagnostic pointing at --rpc-file",
    async () => {
      const { code, stdout, stderr } = await runCli([
        "--game",
        "__no-such-game__",
        "--rpc",
        '{"method":"import_document","json":"{',
      ]);
      expect(code).toBe(1);
      const text = `${stdout}\n${stderr}`;
      expect(text).toContain("failed to parse RPC JSON");
      expect(text).toContain("--rpc-file");
    },
    // First test in this file to spawn a real `bun cli.ts` subprocess, so it pays the cold
    // module-resolution cost that later spawns here don't (those land in ~100ms once bun's
    // module cache is warm). Under CI's parallel test load that cold start has repeatedly
    // exceeded the default 5000ms timeout and gotten SIGTERM'd (issue #1050); give it real
    // headroom instead of racing the runner.
    20_000,
  );

  test("imports a multi-hundred-object document via --rpc-file end-to-end", async () => {
    const objectCount = 400;
    const rpc = buildLargeImportRpc(objectCount);
    const raw = JSON.stringify(rpc);
    expect(Buffer.byteLength(raw, "utf8")).toBeGreaterThan(20_000);

    const dir = mkdtempSync(join(tmpdir(), "editor-cli-rpc-"));
    const path = join(dir, "import_document.json");
    writeFileSync(path, raw);

    const { code, stdout, stderr } = await runCli([
      "--game",
      "__no-such-game__",
      "--rpc-file",
      path,
    ]);
    expect(code).toBe(0);
    expect(stderr).toBe("");
    const response = JSON.parse(stdout) as {
      ok: boolean;
      result?: { markers?: number };
    };
    expect(response.ok).toBe(true);
    expect(response.result?.markers).toBe(objectCount);
  });

  test("--serve starts the HTTP bridge and answers /health (#996)", async () => {
    // Before the fix the serve branch referenced `options.serve`/`options.port` after those values
    // were destructured into bare bindings, so `--serve` threw `options is not defined` and never
    // bound. Spawn it for real and prove the bridge comes up.
    const port = 17939;
    const proc = Bun.spawn(["bun", cliEntry, "--game", "__no-such-game__", "--serve", "--port", String(port)], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    try {
      let healthy = false;
      for (let attempt = 0; attempt < 50 && !healthy; attempt += 1) {
        try {
          const res = await fetch(`http://127.0.0.1:${port}/health`);
          if (res.ok) {
            const body = (await res.json()) as { ok?: boolean };
            healthy = body.ok === true;
          }
        } catch {
          // server not bound yet
        }
        if (!healthy) await Bun.sleep(100);
      }
      expect(healthy).toBe(true);
    } finally {
      proc.kill();
      await proc.exited;
    }
  }, 20000);

  test("imports a large document via --rpc - (stdin)", async () => {
    const objectCount = 400;
    const rpc = buildLargeImportRpc(objectCount);
    const { code, stdout, stderr } = await runCli(
      ["--game", "__no-such-game__", "--rpc", "-"],
      JSON.stringify(rpc),
    );
    expect(code).toBe(0);
    expect(stderr).toBe("");
    const response = JSON.parse(stdout) as {
      ok: boolean;
      result?: { markers?: number };
    };
    expect(response.ok).toBe(true);
    expect(response.result?.markers).toBe(objectCount);
  });
});
