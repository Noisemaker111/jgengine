import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  formatRpcParseError,
  loadRpcPayload,
  looksTruncatedJson,
  parseRpcJson,
  rpcSourceLabel,
} from "./rpcPayload";

describe("rpcPayload", () => {
  test("rpcSourceLabel names each source kind", () => {
    expect(rpcSourceLabel({ kind: "inline", raw: "{}" })).toBe("inline --rpc");
    expect(rpcSourceLabel({ kind: "file", path: "x.json" })).toBe("--rpc-file x.json");
    expect(rpcSourceLabel({ kind: "stdin" })).toBe("stdin (--rpc -)");
  });

  test("looksTruncatedJson detects cut-off objects and open strings", () => {
    expect(looksTruncatedJson('{"method":"import_document"')).toBe(true);
    expect(looksTruncatedJson('{"method":"scene_summary"}')).toBe(false);
    expect(looksTruncatedJson('{"json":"unterminated')).toBe(true);
  });

  test("parseRpcJson succeeds on a valid object", () => {
    const parsed = parseRpcJson('{"method":"scene_summary"}', { kind: "inline", raw: "" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("expected parse success");
    expect(parsed.value).toEqual({ method: "scene_summary" });
  });

  test("parseRpcJson empty payload is a clear diagnostic", () => {
    const parsed = parseRpcJson("", { kind: "file", path: "empty.json" });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("expected parse failure");
    expect(parsed.error).toContain("empty RPC payload");
    expect(parsed.error).toContain("--rpc-file");
  });

  test("parseRpcJson malformed inline points at --rpc-file / stdin", () => {
    const raw = '{"method":"import_document","json":"{';
    const parsed = parseRpcJson(raw, { kind: "inline", raw });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("expected parse failure");
    expect(parsed.error).toContain("inline --rpc");
    expect(parsed.error).toContain("--rpc-file");
    expect(parsed.error).toContain("--rpc -");
    expect(parsed.error).toMatch(/bytes/);
  });

  test("formatRpcParseError flags large and truncated inline payloads", () => {
    const raw = `{"method":"import_document","json":"${"x".repeat(20_000)}`;
    const message = formatRpcParseError(raw, new SyntaxError("Unexpected end of JSON input"), {
      kind: "inline",
      raw,
    });
    expect(message).toContain("prefer --rpc-file");
    expect(message).toContain("truncated");
  });

  test("loadRpcPayload reads a file source", async () => {
    const dir = mkdtempSync(join(tmpdir(), "editor-rpc-"));
    const path = join(dir, "rpc.json");
    writeFileSync(path, JSON.stringify({ method: "scene_summary" }));
    const loaded = await loadRpcPayload({ kind: "file", path });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error("expected load success");
    expect(loaded.value).toEqual({ method: "scene_summary" });
  });

  test("loadRpcPayload missing file is a clear diagnostic", async () => {
    const loaded = await loadRpcPayload({ kind: "file", path: join(tmpdir(), "no-such-rpc-file.json") });
    expect(loaded.ok).toBe(false);
    if (loaded.ok) throw new Error("expected load failure");
    expect(loaded.error).toContain("failed to read --rpc-file");
  });

  test("loadRpcPayload reads stdin via injected reader", async () => {
    const loaded = await loadRpcPayload({ kind: "stdin" }, async () =>
      JSON.stringify({ method: "list_layers" }),
    );
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error("expected load success");
    expect(loaded.value).toEqual({ method: "list_layers" });
  });
});
