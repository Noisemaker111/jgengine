/**
 * Dev-server-only bridge for the "chat with the scene" builder feature. Reuses
 * the agent-CLI spawn plumbing from `builderAgent.server.ts` (candidate
 * resolution, stdin runner, JSON extraction) but composes a different prompt:
 * one that hands the agent live BuilderStore method signatures — auto-scraped
 * from source on every request — plus a fresh scene digest and the running
 * transcript, and asks for either a spoken reply or a batch of store calls.
 *
 * There is no separate maintained tool API: the tool surface is the store
 * itself. `methodNames` is enumerated client-side at runtime, via a
 * prototype walk (see `llmville/src/dev/builder/executor.ts`) that cannot
 * distinguish TS-`private` methods from public ones — private is erased at
 * compile time. This module re-derives the *actual* public surface from
 * source (skipping `private`/`static`/`constructor`/accessors) and
 * intersects it with the client's list, so the docs and the executable set
 * never go stale and never include private helpers. The confirmed subset is
 * returned as `callableMethods` for the client to enforce too.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  agentCandidates,
  extractJsonObject,
  runCandidate,
} from "./builderAgent.server";

export type BuilderChatTranscriptMessage = { role: "user" | "assistant" | "tool"; content: string };
export type BuilderChatToolCall = { method: string; args: unknown[] };
export type BuilderChatTurn =
  | { kind: "say"; text: string }
  | { kind: "calls"; calls: BuilderChatToolCall[]; note?: string };

export interface RunBuilderChatTurnRequest {
  messages: BuilderChatTranscriptMessage[];
  sceneDigest: string;
  methodNames: string[];
  rootDir: string;
}

export type RunBuilderChatTurnResult =
  | { ok: true; turn: BuilderChatTurn; agent: string; callableMethods: string[] }
  | { ok: false; error: string };

const MAX_CALLS_PER_BATCH = 6;
export const BUILDER_STORE_SOURCE_RELATIVE = "src/dev/builder/builderStore.ts";
export const CLASS_NAME = "BuilderStoreImpl";

/** Grab the `{ ... }` body of `class <name> { ... }` via balanced-brace scanning. */
export function extractClassBody(source: string, className: string): string | null {
  const marker = `class ${className}`;
  const classStart = source.indexOf(marker);
  if (classStart < 0) return null;
  const braceStart = source.indexOf("{", classStart);
  if (braceStart < 0) return null;
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(braceStart + 1, index);
    }
  }
  return null;
}

/**
 * Pull one-line "public method signatures" out of a class body: lines
 * indented exactly two spaces that look like `name(` and aren't `private`,
 * `static`, `constructor`, `get`, or `set`. Multi-line parameter lists are
 * joined onto one line by scanning forward until parens balance.
 */
export function extractPublicMethodSignatures(classBody: string): Map<string, string> {
  const lines = classBody.split("\n");
  const startPattern = /^ {2}(?!private\b|static\b|constructor\b|get\b|set\b)([a-zA-Z_$][\w$]*)\s*\(/;
  const signatures = new Map<string, string>();

  for (let index = 0; index < lines.length; index += 1) {
    const match = startPattern.exec(lines[index]);
    if (!match) continue;

    let depth = 0;
    let started = false;
    let collected = "";
    let endIndex = index;
    for (let cursor = index; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      collected += (cursor === index ? "" : " ") + line.trim();
      for (const char of line) {
        if (char === "(") { depth += 1; started = true; }
        else if (char === ")") depth -= 1;
      }
      endIndex = cursor;
      if (started && depth <= 0) break;
    }

    const braceIndex = collected.indexOf("{");
    const signature = (braceIndex >= 0 ? collected.slice(0, braceIndex) : collected).trim().replace(/\s+/g, " ");
    if (signature) signatures.set(match[1], signature);
    index = endIndex;
  }

  return signatures;
}

interface PublicMethodResolution {
  /** Client-enumerated names confirmed public by source inspection (or trusted as-is if source is unreadable). */
  names: string[];
  /** One doc line per confirmed-public name. */
  docs: string;
}

/**
 * Intersect the client's runtime-enumerated method names against the
 * BuilderStore source's actual public methods, so private helpers (which
 * still appear on the runtime prototype — TS `private` is erased) never
 * reach the agent as callable tools.
 */
export async function resolvePublicMethods(methodNames: readonly string[], rootDir: string): Promise<PublicMethodResolution> {
  const uniqueNames = [...new Set(methodNames)].sort();
  try {
    const sourcePath = path.join(rootDir, BUILDER_STORE_SOURCE_RELATIVE);
    const source = await readFile(sourcePath, "utf8");
    const classBody = extractClassBody(source, CLASS_NAME);
    if (!classBody) throw new Error("BuilderStoreImpl class body not found.");
    const signatures = extractPublicMethodSignatures(classBody);
    const names = uniqueNames.filter((name) => signatures.has(name));
    return { names, docs: names.map((name) => signatures.get(name) ?? `${name}(...)`).join("\n") };
  } catch {
    // Source unreadable (moved/renamed) — fall back to trusting the client's
    // runtime enumeration so the agent still has tools, just without the
    // private-helper filter or parameter detail.
    return { names: uniqueNames, docs: uniqueNames.map((name) => `${name}(...)`).join("\n") };
  }
}

const ARG_TYPE_PRIMER = `Key argument types (from packages/game/src/builder/*.ts):
- BuilderSelectionRef = { kind: "decor"; id: string } | { kind: "wall"; index: number }
- BuilderMaterial = { key: string; color: string (hex "#rrggbb"); roughness: number (0-1); metalness: number (0-1); emissive?: string; emissiveIntensity?: number }
- BuilderPrimitiveDraft = { kind: "box" | "plane" | "cylinder" | "sphere"; width: number; height: number; depth: number; radius: number; segments: number } (meters)
- BuilderBounds3d = { minX, maxX, minY, maxY, minZ, maxZ } — world-space meters, absolute
- DecorItemSpec.type = "box" | "plane" | "cylinder" | "sphere" | "group" | "model"; position is [x, y, z] meters; rotation is [rx, ry, rz] radians; gridRotation is a quarter-turn 0-3 (0=N, 1=E, 2=S, 3=W); color is a hex string; args holds primitive dimensions (box: [w,h,d], cylinder: [radiusTop, radiusBottom, height, segments], sphere: [radius, widthSegments, heightSegments], plane: [w,h])
- Material keys used with resolveMaterial: tier presets like "garage-floor"/"garage-wall", or "preset:wood", "preset:metal", "preset:accent-teal", etc.`;

function buildSystemSection(): string {
  return [
    "You are a scene-editing agent embedded in LLMville's dev-only 3D room builder — a cozy AI-lab tycoon game.",
    "Coordinates are meters, +Y is up. The floor grid is divided into square cells of `tileSize` meters (see the scene digest).",
    "You never touch geometry directly: you edit the scene ONLY by calling methods on the live builder store (listed in TOOLS below).",
    "A fresh SCENE DIGEST is provided at the start of this turn, and you will get another fresh digest after every batch of calls you make — always re-read it rather than assuming what a previous call did.",
    'Prefer selection-based operations where they exist: selectRef(ref, additive) to select something, then moveSelection/rotateSelection90/applyMaterialToSelection/deleteRef/deleteSelected etc. on the selection.',
    "Keep changes minimal, incremental, and easy to undo — make the smallest set of calls that satisfies the request.",
  ].join("\n");
}

function buildOutputContract(): string {
  return [
    "Reply with exactly ONE raw JSON object and nothing else — no prose, no markdown fences.",
    'Either: {"say": "<message to show the user>"} when you are done, answering a question, or need clarification.',
    `Or: {"calls": [{"method": "<name>", "args": [...]}], "note": "<optional short progress note>"} to act — up to ${MAX_CALLS_PER_BATCH} calls per batch.`,
    "Every call's \"method\" must be one of the names listed in TOOLS, and \"args\" must be a JSON array of positional arguments matching that method's parameters.",
  ].join("\n");
}

function buildTranscriptSection(messages: readonly BuilderChatTranscriptMessage[]): string {
  if (messages.length === 0) return "(no messages yet)";
  return messages.map((message) => `[${message.role}] ${message.content}`).join("\n\n");
}

function buildChatPrompt(request: RunBuilderChatTurnRequest, toolDocs: string): string {
  return [
    "SYSTEM",
    buildSystemSection(),
    "",
    "TOOLS (live BuilderStore methods you may call)",
    toolDocs || "(no callable methods reported)",
    "",
    ARG_TYPE_PRIMER,
    "",
    "SCENE DIGEST",
    request.sceneDigest,
    "",
    "TRANSCRIPT",
    buildTranscriptSection(request.messages),
    "",
    "OUTPUT CONTRACT",
    buildOutputContract(),
  ].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseChatTurn(text: string, methodNames: readonly string[]): { ok: true; turn: BuilderChatTurn } | { ok: false; error: string } {
  const json = extractJsonObject(text);
  if (!json) return { ok: false, error: "Agent output contained no JSON object." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "Agent output JSON did not parse." };
  }
  if (!isRecord(parsed)) return { ok: false, error: "Agent output was not a JSON object." };

  if (typeof parsed.say === "string") {
    return { ok: true, turn: { kind: "say", text: parsed.say } };
  }

  if (Array.isArray(parsed.calls)) {
    const methodSet = new Set(methodNames);
    const calls: BuilderChatToolCall[] = [];
    for (const raw of parsed.calls) {
      if (!isRecord(raw) || typeof raw.method !== "string" || !Array.isArray(raw.args)) {
        return { ok: false, error: "Each call must be {method: string, args: array[]}." };
      }
      if (!methodSet.has(raw.method)) {
        return { ok: false, error: `Agent called an unknown method: "${raw.method}".` };
      }
      calls.push({ method: raw.method, args: raw.args });
    }
    if (calls.length === 0) return { ok: false, error: "Agent returned an empty calls array." };
    if (calls.length > MAX_CALLS_PER_BATCH) {
      return { ok: false, error: `Agent returned ${calls.length} calls, over the ${MAX_CALLS_PER_BATCH}-call batch limit.` };
    }
    const note = typeof parsed.note === "string" ? parsed.note : undefined;
    return { ok: true, turn: { kind: "calls", calls, note } };
  }

  return { ok: false, error: 'Agent output must be {"say": string} or {"calls": [...]}.' };
}

export async function runBuilderChatTurn(request: RunBuilderChatTurnRequest): Promise<RunBuilderChatTurnResult> {
  const { names: callableMethods, docs: toolDocs } = await resolvePublicMethods(request.methodNames, request.rootDir);
  const prompt = buildChatPrompt(request, toolDocs);

  const attempts: string[] = [];
  const recordAttempt = (label: string, detail: string) => {
    attempts.push(`${label}: ${detail}`);
    console.warn(`[builder-chat-agent] ${label} failed: ${detail}`);
  };

  for (const candidate of agentCandidates()) {
    const outcome = await runCandidate(candidate, prompt);
    if (outcome.kind === "missing") {
      recordAttempt(candidate.label, "not installed");
      continue;
    }
    if (outcome.kind === "failed") {
      recordAttempt(candidate.label, outcome.error);
      continue;
    }
    const parsed = parseChatTurn(outcome.stdout, callableMethods);
    if (!parsed.ok) {
      recordAttempt(candidate.label, `${parsed.error} Output tail: ${outcome.stdout.trim().slice(-200)}`);
      continue;
    }
    return { ok: true, turn: parsed.turn, agent: candidate.label, callableMethods };
  }

  return {
    ok: false,
    error: `OpenCode did not produce a usable reply. ${attempts.join("; ")}. Install the OpenCode CLI (npm i -g opencode-ai), or set LLMVILLE_BUILDER_AGENT_CMD.`,
  };
}
