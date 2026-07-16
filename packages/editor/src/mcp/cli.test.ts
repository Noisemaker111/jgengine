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
    expect(opts.rpcSource).toEqual({ kind: "inline", raw: '{"method":"scene_summary"}' });
  });

  test("--rpc - selects stdin", () => {
    const opts = parseEditorCliArgs(["--rpc", "-"]);
    expect(opts.rpcSource).toEqual({ kind: "stdin" });
    expect(opts.serve).toBe(false);
  });

  test("--rpc-file selects a file source", () => {
    const opts = parseEditorCliArgs(["--rpc-file", "payload.json"]);
    expect(opts.rpcSource).toEqual({ kind: "file", path: "payload.json" });
    expect(opts.serve).toBe(false);
  });
});

describe("editor CLI entry", () => {
  test("malformed inline --rpc prints a diagnostic pointing at --rpc-file", async () => {
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
  });

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
