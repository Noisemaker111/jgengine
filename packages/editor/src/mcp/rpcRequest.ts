import type { EditorBridgeRequest } from "../session";
import { RPC_FIELD_SCHEMAS, type RpcFieldSpec } from "./fieldSpec";

export { EDITOR_BRIDGE_METHOD_NAMES } from "./fieldSpec";

/** One field-level failure surfaced while decoding an untrusted RPC request. */
export interface RpcRequestDiagnostic {
  path: string;
  message: string;
}

/** Result of {@link decodeEditorBridgeRequest}: a request whose `method` is a real one, or the diagnostic that rejected it. */
export type DecodeRpcRequestResult =
  | { ok: true; request: EditorBridgeRequest }
  | { ok: false; errors: RpcRequestDiagnostic[] };

/** Every `method` an {@link EditorBridgeRequest} may carry, derived from the schema table's keys. */
const EDITOR_BRIDGE_METHODS: ReadonlySet<string> = new Set(Object.keys(RPC_FIELD_SCHEMAS));

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVec3(value: unknown): boolean {
  return isPlainObject(value) && typeof value.x === "number" && typeof value.y === "number" && typeof value.z === "number";
}

function validateField(value: unknown, spec: RpcFieldSpec, errors: RpcRequestDiagnostic[]): void {
  if (value === undefined) return; // presence is enforced by handle's per-method guards, not here
  const path = `$.${spec.name}`;
  if (value === null) {
    if (spec.nullable !== true) errors.push({ path, message: `expected a ${spec.kind}` });
    return;
  }
  switch (spec.kind) {
    case "string":
      if (typeof value !== "string") errors.push({ path, message: "expected a string" });
      else if (spec.oneOf !== undefined && !spec.oneOf.includes(value)) {
        errors.push({ path, message: `expected one of ${spec.oneOf.join(" | ")}` });
      }
      return;
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) errors.push({ path, message: "expected a number" });
      return;
    case "boolean":
      if (typeof value !== "boolean") errors.push({ path, message: "expected a boolean" });
      return;
    case "string[]":
      if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
        errors.push({ path, message: "expected an array of strings" });
      }
      return;
    case "object":
      if (!isPlainObject(value)) errors.push({ path, message: "expected an object" });
      return;
    case "object[]":
      if (!Array.isArray(value) || value.some((entry) => !isPlainObject(entry))) {
        errors.push({ path, message: "expected an array of objects" });
      }
      return;
    case "vec3":
      if (!isVec3(value)) errors.push({ path, message: "expected {x,y,z} numbers" });
      return;
    case "value":
      return;
  }
}

/**
 * Validates an untrusted JSON-decoded RPC payload (from `--rpc`, the HTTP bridge, or an agent tool
 * call) before it reaches `EditorHostApi.handle`: confirms it is a plain object carrying a known
 * `method`, then type-checks every field the method understands against {@link RPC_FIELD_SCHEMAS}.
 * A garbled method, or a field whose value is the wrong type (a string where a number belongs, a
 * scalar where an object belongs), is rejected here with a path-specific diagnostic instead of
 * flowing into a live session on a blind cast. Missing fields and unknown extra fields are left for
 * `handle` to interpret so the boundary stays forward-compatible.
 */
export function decodeEditorBridgeRequest(raw: unknown): DecodeRpcRequestResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: [{ path: "$", message: "expected an RPC request object" }] };
  }
  const record = raw as Record<string, unknown>;
  const method = record.method;
  if (typeof method !== "string") {
    return { ok: false, errors: [{ path: "$.method", message: "expected a string" }] };
  }
  if (!EDITOR_BRIDGE_METHODS.has(method)) {
    return { ok: false, errors: [{ path: "$.method", message: `unknown method "${method}"` }] };
  }
  const errors: RpcRequestDiagnostic[] = [];
  for (const spec of RPC_FIELD_SCHEMAS[method as EditorBridgeRequest["method"]]) {
    validateField(record[spec.name], spec, errors);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, request: raw as EditorBridgeRequest };
}
