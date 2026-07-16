import { readFile } from "node:fs/promises";

/** Where an RPC JSON body is read from for the headless editor CLI. */
export type RpcPayloadSource =
  | { kind: "inline"; raw: string }
  | { kind: "file"; path: string }
  | { kind: "stdin" };

/** Result of reading or JSON-decoding an RPC payload for the CLI. */
export type RpcPayloadResult =
  | { ok: true; value: unknown; raw: string; sourceLabel: string }
  | { ok: false; error: string };

/** Human-readable label for error messages (and tests). @internal */
export function rpcSourceLabel(source: RpcPayloadSource): string {
  if (source.kind === "inline") return "inline --rpc";
  if (source.kind === "file") return `--rpc-file ${source.path}`;
  return "stdin (--rpc -)";
}

/** True when braces/brackets/quotes look cut off — common when a shell truncates a long --rpc arg. @internal */
export function looksTruncatedJson(raw: string): boolean {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (const ch of raw) {
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") depth += 1;
    else if (ch === "}" || ch === "]") depth -= 1;
  }
  return inString || escape || depth !== 0;
}

/**
 * Builds a clear diagnostic when JSON.parse fails on an RPC body — names the source, size, and
 * (for inline args) points agents at `--rpc-file` / `--rpc -` instead of a bare SyntaxError.
 * @internal
 */
export function formatRpcParseError(raw: string, error: unknown, source: RpcPayloadSource): string {
  const detail = error instanceof Error ? error.message : String(error);
  const bytes = Buffer.byteLength(raw, "utf8");
  const label = rpcSourceLabel(source);
  const parts = [`failed to parse RPC JSON from ${label} (${bytes} bytes): ${detail}`];
  if (source.kind === "inline") {
    parts.push("large or shell-mangled payloads: use --rpc-file <path> or --rpc - (stdin)");
    if (bytes > 16_384) {
      parts.push(`inline payload is ${bytes} bytes — prefer --rpc-file`);
    }
    if (raw.length > 0 && looksTruncatedJson(raw)) {
      parts.push("payload looks truncated (unbalanced braces/quotes)");
    }
  }
  return parts.join(". ");
}

/** JSON.parse with a source-aware diagnostic (never throws). @internal */
export function parseRpcJson(raw: string, source: RpcPayloadSource): RpcPayloadResult {
  if (raw.length === 0) {
    return {
      ok: false,
      error: `empty RPC payload from ${rpcSourceLabel(source)}. Pass JSON via --rpc, --rpc-file <path>, or --rpc -`,
    };
  }
  try {
    return { ok: true, value: JSON.parse(raw) as unknown, raw, sourceLabel: rpcSourceLabel(source) };
  } catch (error) {
    return { ok: false, error: formatRpcParseError(raw, error, source) };
  }
}

/** Reads the raw RPC text from an inline arg, file path, or stdin. @internal */
export async function readRpcText(
  source: RpcPayloadSource,
  readStdin: () => Promise<string> = defaultReadStdin,
): Promise<{ ok: true; raw: string } | { ok: false; error: string }> {
  if (source.kind === "inline") return { ok: true, raw: source.raw };
  if (source.kind === "file") {
    try {
      const raw = await readFile(source.path, "utf8");
      return { ok: true, raw };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `failed to read --rpc-file ${source.path}: ${detail}` };
    }
  }
  try {
    const raw = await readStdin();
    return { ok: true, raw };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `failed to read RPC JSON from stdin: ${detail}` };
  }
}

/** Load + parse an RPC payload from the resolved CLI source. @internal */
export async function loadRpcPayload(
  source: RpcPayloadSource,
  readStdin?: () => Promise<string>,
): Promise<RpcPayloadResult> {
  const text = await readRpcText(source, readStdin);
  if (!text.ok) return text;
  return parseRpcJson(text.raw, source);
}

async function defaultReadStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
