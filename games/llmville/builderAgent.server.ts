/**
 * Dev-server-only bridge: turns a builder prompt into primitive geometry by
 * invoking a local coding-agent CLI non-interactively. The prompt is written to
 * the CLI's stdin (never through a shell string) and stdout is parsed/sanitized
 * into a DecorItemSpec group.
 *
 * OpenCode only (free zen models). Resolution order:
 *   1. LLMVILLE_BUILDER_AGENT_CMD env var (e.g. "opencode run -m opencode/kimi-k2.6");
 *      the prompt is piped to the command's stdin.
 *   2. A known opencode install location (npm global shim / ~/.opencode/bin) —
 *      preferred over bare PATH lookup, which stale shims can shadow.
 *   3. opencode from PATH.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { sanitizeGeneratedAsset } from "@llmville/game/builder/generatedAsset";

const AGENT_TIMEOUT_MS = 300_000;

export interface AgentCandidate {
  label: string;
  command: string;
  args: readonly string[];
}

export type SpawnOutcome =
  | { kind: "ok"; stdout: string }
  | { kind: "missing" }
  | { kind: "failed"; error: string };

export interface GenerateBuilderAssetResult {
  item?: unknown;
  agent?: string;
  error?: string;
}

function buildGeneratedAssetPrompt(request: string): string {
  return [
    "You are a low-poly 3D prop generator for a Three.js tycoon game.",
    "Respond with ONE raw JSON object and nothing else — no prose, no markdown fences, no explanation.",
    "",
    "JSON shape:",
    "{",
    '  "type": "group",',
    '  "children": [',
    '    { "type": "box", "args": [width, height, depth], "position": [x, y, z], "color": "#rrggbb" },',
    '    { "type": "cylinder", "args": [radiusTop, radiusBottom, height, radialSegments], "position": [x, y, z], "color": "#rrggbb" },',
    '    { "type": "sphere", "args": [radius], "position": [x, y, z], "color": "#rrggbb" },',
    '    { "type": "plane", "args": [width, height], "position": [x, y, z], "rotation": [rx, ry, rz], "color": "#rrggbb" }',
    "  ]",
    "}",
    "",
    'Every child may also set "rotation" [rx, ry, rz] in radians, "roughness" 0-1, "metalness" 0-1, and "emissive" "#rrggbb" plus "emissiveIntensity" for glowing parts.',
    "",
    "Rules:",
    "- Units are meters; +Y is up; a human is 1.8 m tall. Size the object plausibly for the request.",
    "- position is the CENTER of each primitive, relative to the group origin. The group origin sits on the floor under the object's center, so a box of height H resting on the floor needs y = H/2.",
    "- Compose 3-40 primitives. Favor chunky, readable shapes over fine detail.",
    "- Openings (door or window cutouts) must be built by composing boxes around the gap — there is no boolean subtraction.",
    "- Flat hex colors only; pick a cohesive palette.",
    "",
    `Build this: ${request}`,
  ].join("\n");
}

/**
 * Pull the first balanced top-level JSON object out of agent output, tolerating
 * markdown fences and surrounding prose.
 */
export function extractJsonObject(text: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const source = fenced ? fenced[1] : text;
  const start = source.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return null;
}

function parseGeneratedAssetText(text: string): ReturnType<typeof sanitizeGeneratedAsset> {
  const json = extractJsonObject(text);
  if (!json) return { ok: false, error: "Agent output contained no JSON object." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "Agent output JSON did not parse." };
  }
  return sanitizeGeneratedAsset(parsed);
}

export function agentCandidates(): AgentCandidate[] {
  const override = process.env.LLMVILLE_BUILDER_AGENT_CMD?.trim();
  if (override) {
    const [command, ...args] = override.split(/\s+/);
    return [{ label: command, command, args }];
  }
  return opencodeCandidates();
}

/**
 * Prefer concrete opencode install locations over bare PATH resolution: when
 * the dev server itself runs under bun, bun prepends its own global bin dir to
 * PATH, which can shadow a working npm-global opencode with a stale bun one.
 */
function opencodeCandidates(): AgentCandidate[] {
  const candidates: AgentCandidate[] = [];
  const knownInstalls = process.platform === "win32"
    ? [
      process.env.APPDATA ? path.join(process.env.APPDATA, "npm", "opencode.cmd") : null,
      path.join(homedir(), ".opencode", "bin", "opencode.exe"),
    ]
    : [
      path.join(homedir(), ".opencode", "bin", "opencode"),
      "/usr/local/bin/opencode",
    ];
  for (const install of knownInstalls) {
    if (install && existsSync(install)) {
      // Windows spawns go through cmd.exe (shell:true), so quote the path.
      const command = process.platform === "win32" ? `"${install}"` : install;
      candidates.push({ label: "opencode", command, args: ["run"] });
      break;
    }
  }
  candidates.push({ label: "opencode (PATH)", command: "opencode", args: ["run"] });
  return candidates;
}

export function runCandidate(candidate: AgentCandidate, prompt: string): Promise<SpawnOutcome> {
  return new Promise((resolve) => {
    // shell:true lets Windows resolve .cmd/.ps1 shims; args are fixed tokens
    // (never user input), and the prompt itself goes through stdin.
    const child = spawn(candidate.command, [...candidate.args], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const settle = (outcome: SpawnOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(outcome);
    };

    const timeout = setTimeout(() => {
      child.kill();
      settle({ kind: "failed", error: `timed out after ${Math.round(AGENT_TIMEOUT_MS / 1000)}s` });
    }, AGENT_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") settle({ kind: "missing" });
      else settle({ kind: "failed", error: error.message });
    });

    child.on("close", (code) => {
      if (code === 0) {
        settle({ kind: "ok", stdout });
        return;
      }
      const detail = (stderr || stdout).trim().slice(-400);
      // Windows shell resolution reports a missing binary as a normal failure.
      if (/is not recognized|not found|cannot find/i.test(detail)) {
        settle({ kind: "missing" });
        return;
      }
      settle({ kind: "failed", error: detail || `exit code ${code}` });
    });

    child.stdin.on("error", () => undefined);
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

export async function generateBuilderAsset(request: string): Promise<GenerateBuilderAssetResult> {
  const trimmed = request.trim();
  if (!trimmed) return { error: "Prompt is empty." };
  const prompt = buildGeneratedAssetPrompt(trimmed);

  const attempts: string[] = [];
  const recordAttempt = (label: string, detail: string) => {
    attempts.push(`${label}: ${detail}`);
    console.warn(`[builder-agent] ${label} failed: ${detail}`);
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
    const parsed = parseGeneratedAssetText(outcome.stdout);
    if (!parsed.ok) {
      recordAttempt(candidate.label, `${parsed.error} Output tail: ${outcome.stdout.trim().slice(-200)}`);
      continue;
    }
    return { item: parsed.item, agent: candidate.label };
  }

  return {
    error: `OpenCode did not produce a usable object. ${attempts.join("; ")}. Install the OpenCode CLI (npm i -g opencode-ai), or set LLMVILLE_BUILDER_AGENT_CMD.`,
  };
}
