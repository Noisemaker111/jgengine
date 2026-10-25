/**
 * Dev-server-only module that turns the live BuilderStore's public method
 * surface into an OpenAPI 3.1 document, so any MCP-capable agent (via the
 * Executor tool-catalog platform) can drive the `/dev/build` scene over
 * plain HTTP instead of the in-app chat panel's CLI-spawn path.
 *
 * Reuses the same source-scraping helpers as `builderChatAgent.server.ts`
 * (`extractClassBody` / `extractPublicMethodSignatures`) rather than
 * duplicating the parsing logic — this module's only new responsibility is
 * turning a `methodName -> signatureText` map into OpenAPI operations,
 * including a best-effort parameter-list parser (see `parseParams` below).
 *
 * Like its sibling, this file is loaded via `server.ssrLoadModule(...)` from
 * `vite.devPlugins.ts` and is never bundled for the browser, so `@/`-aliased
 * and workspace imports are fine here.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  BUILDER_STORE_SOURCE_RELATIVE,
  CLASS_NAME,
  extractClassBody,
  extractPublicMethodSignatures,
} from "./builderChatAgent.server";

export interface BuildOpenApiSpecRequest {
  rootDir: string;
  methodNames: string[];
  baseUrl: string;
}

interface ParsedParam {
  name: string;
  typeText: string;
  hasDefault: boolean;
  isRest: boolean;
}

const EXECUTED_CALL_SCHEMA = {
  type: "object",
  properties: {
    method: { type: "string" },
    argsPreview: { type: "string" },
    result: { type: "string" },
    ok: { type: "boolean" },
  },
  required: ["method", "argsPreview", "result", "ok"],
};

const BRACKET_OPENERS = "([{<";
const BRACKET_CLOSERS = ")]}>";

/** First balanced `(...)` group starting at the first `(` in `text` — tracks depth so nested function-type params don't confuse it. */
function findBalancedParenGroup(text: string): string | null {
  const start = text.indexOf("(");
  if (start < 0) return null;
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return text.slice(start + 1, index);
    }
  }
  return null;
}

/** Index of the first top-level occurrence of `char` in `text`, tracking `(){}[]<>` depth so nested generics/types don't split early. */
function findTopLevelIndex(text: string, char: string): number {
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const current = text[index];
    if (BRACKET_OPENERS.includes(current)) depth += 1;
    else if (BRACKET_CLOSERS.includes(current)) depth -= 1;
    else if (current === char && depth === 0) return index;
  }
  return -1;
}

/** Split `text` on top-level commas only, tracking `(){}[]<>` depth. */
function splitTopLevelCommas(text: string): string[] {
  let depth = 0;
  let current = "";
  const parts: string[] = [];
  for (const char of text) {
    if (BRACKET_OPENERS.includes(char)) depth += 1;
    else if (BRACKET_CLOSERS.includes(char)) depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

/**
 * Best-effort parse of a signature's `(...)` parameter list into ordered
 * `{ name, typeText, hasDefault }` entries. Never throws — returns `null` on
 * any structural surprise (malformed signature) so the caller can fall back
 * to a permissive `{ type: "array" }` schema instead.
 */
function parseParams(signatureText: string): ParsedParam[] | null {
  try {
    const inner = findBalancedParenGroup(signatureText);
    if (inner === null) return null;
    if (inner.trim() === "") return [];

    const params: ParsedParam[] = [];
    for (const rawChunk of splitTopLevelCommas(inner)) {
      const chunk = rawChunk.trim();
      if (!chunk) continue;

      let text = chunk;
      let isRest = false;
      if (text.startsWith("...")) {
        isRest = true;
        text = text.slice(3).trim();
      }

      const colonIndex = findTopLevelIndex(text, ":");
      let namePart = colonIndex >= 0 ? text.slice(0, colonIndex).trim() : text.trim();
      let typePart = colonIndex >= 0 ? text.slice(colonIndex + 1).trim() : undefined;

      let hasDefault = false;
      if (namePart.endsWith("?")) {
        hasDefault = true;
        namePart = namePart.slice(0, -1).trim();
      }

      let typeText = "";
      if (typePart !== undefined) {
        const equalsIndex = findTopLevelIndex(typePart, "=");
        if (equalsIndex >= 0) {
          hasDefault = true;
          typeText = typePart.slice(0, equalsIndex).trim();
        } else {
          typeText = typePart;
        }
      } else {
        const equalsIndex = findTopLevelIndex(namePart, "=");
        if (equalsIndex >= 0) {
          hasDefault = true;
          namePart = namePart.slice(0, equalsIndex).trim();
        }
      }

      params.push({ name: namePart || "arg", typeText, hasDefault, isRest });
    }
    return params;
  } catch {
    return null;
  }
}

/** Per-param item schema: exact primitive match only, everything else (including rest params) is permissive. */
function paramItemSchema(param: ParsedParam): object {
  if (param.isRest) return {};
  const trimmedType = param.typeText.trim();
  if (trimmedType === "number" || trimmedType === "string" || trimmedType === "boolean") {
    return { type: trimmedType, description: param.name };
  }
  return {};
}

/** Closed-tuple args schema for a method's positional parameters, best-effort from its signature text. */
function buildArgsSchema(signatureText: string): object {
  const params = parseParams(signatureText);
  if (params === null) return { type: "array" };

  const minItems = params.filter((param) => !param.hasDefault).length;
  return {
    type: "array",
    prefixItems: params.map(paramItemSchema),
    items: false,
    minItems,
    maxItems: params.length,
  };
}

function buildCallOperation(methodName: string, signatureText: string): object {
  return {
    post: {
      operationId: methodName,
      summary: signatureText,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { args: buildArgsSchema(signatureText) },
              required: ["args"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Executed call result",
          content: { "application/json": { schema: EXECUTED_CALL_SCHEMA } },
        },
      },
    },
  };
}

function buildSceneOperation(): object {
  return {
    get: {
      operationId: "getScene",
      responses: {
        "200": {
          description: "Current scene state",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { digest: { type: "string" }, mapData: { type: "object" } },
                required: ["digest", "mapData"],
              },
            },
          },
        },
      },
    },
  };
}

/** Read the store source and extract its public `methodName -> signatureText` map. Never throws — an unreadable/unparsable source yields an empty map. */
async function readPublicSignatures(rootDir: string): Promise<Map<string, string>> {
  try {
    const sourcePath = path.join(rootDir, BUILDER_STORE_SOURCE_RELATIVE);
    const source = await readFile(sourcePath, "utf8");
    const classBody = extractClassBody(source, CLASS_NAME);
    if (!classBody) return new Map();
    return extractPublicMethodSignatures(classBody);
  } catch {
    return new Map();
  }
}

export async function buildOpenApiSpec(request: BuildOpenApiSpecRequest): Promise<object> {
  const signatures = await readPublicSignatures(request.rootDir);
  const requestedNames = new Set(request.methodNames);
  const methodNames = request.methodNames.length > 0
    ? [...signatures.keys()].filter((name) => requestedNames.has(name))
    : [...signatures.keys()];

  const paths: Record<string, object> = { "/scene": buildSceneOperation() };
  for (const methodName of methodNames) {
    const signatureText = signatures.get(methodName);
    if (!signatureText) continue;
    paths[`/call/${methodName}`] = buildCallOperation(methodName, signatureText);
  }

  return {
    openapi: "3.1.0",
    info: { title: "LLMville Builder Scene API", version: "1.0.0" },
    servers: [{ url: request.baseUrl }],
    paths,
  };
}
