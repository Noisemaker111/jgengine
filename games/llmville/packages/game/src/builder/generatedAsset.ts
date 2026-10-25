/**
 * Strict sanitization of untrusted generator output (e.g. an AI agent) into a
 * DecorItemSpec group of primitives. Transport lives with the host app.
 */
import type { DecorItemSpec } from "@llmville/game/world/mapTypes";

import { centerDecorAtOrigin } from "@llmville/game/builder/placement";

const MAX_PRIMITIVES = 96;
const MAX_GROUP_DEPTH = 3;
const MIN_DIMENSION = 0.005;
const MAX_DIMENSION = 40;
const MAX_OFFSET = 60;
const MIN_SEGMENTS = 3;
const MAX_SEGMENTS = 48;
const DEFAULT_COLOR = "#9aa2ab";

export type GeneratedAssetParseResult =
  | { ok: true; item: DecorItemSpec }
  | { ok: false; error: string };

export function sanitizeGeneratedAsset(value: unknown): GeneratedAssetParseResult {
  if (!isRecord(value)) return { ok: false, error: "Agent output was not a JSON object." };
  const root = value.type === "group" ? value : { type: "group", children: [value] };
  const counter = { primitives: 0 };
  const item = sanitizeNode(root, 0, counter);
  if (counter.primitives > MAX_PRIMITIVES) {
    return { ok: false, error: `Generated object has too many primitives (max ${MAX_PRIMITIVES}).` };
  }
  if (!item || item.type !== "group" || !item.children?.length) {
    return { ok: false, error: "Generated object contained no usable primitives (box, plane, cylinder, sphere)." };
  }
  item.position = [0, 0, 0];
  return { ok: true, item: centerDecorAtOrigin(item) };
}

const PRIMITIVE_TYPES = ["box", "plane", "cylinder", "sphere"] as const;
type PrimitiveType = (typeof PRIMITIVE_TYPES)[number];

function sanitizeNode(
  value: unknown,
  depth: number,
  counter: { primitives: number },
): DecorItemSpec | null {
  if (!isRecord(value)) return null;
  if (value.type === "group") {
    if (depth >= MAX_GROUP_DEPTH || !Array.isArray(value.children)) return null;
    const children = value.children
      .map((child) => sanitizeNode(child, depth + 1, counter))
      .filter((child): child is DecorItemSpec => child !== null);
    if (children.length === 0) return null;
    const group: DecorItemSpec = {
      type: "group",
      position: sanitizeTuple3(value.position, MAX_OFFSET) ?? [0, 0, 0],
      children,
      castShadow: true,
      receiveShadow: true,
    };
    const rotation = sanitizeTuple3(value.rotation, Math.PI * 2);
    if (rotation && rotation.some((part) => part !== 0)) group.rotation = rotation;
    return group;
  }

  if (!isPrimitiveType(value.type)) return null;
  counter.primitives += 1;
  if (counter.primitives > MAX_PRIMITIVES) return null;

  const spec: DecorItemSpec = {
    type: value.type,
    assetType: "primitive",
    args: sanitizeArgs(value.type, value.args),
    position: sanitizeTuple3(value.position, MAX_OFFSET) ?? [0, 0, 0],
    color: sanitizeColor(value.color) ?? DEFAULT_COLOR,
    roughness: clamp(asFiniteNumber(value.roughness) ?? 0.8, 0, 1),
    metalness: clamp(asFiniteNumber(value.metalness) ?? 0.05, 0, 1),
    castShadow: true,
    receiveShadow: true,
  };
  const rotation = sanitizeTuple3(value.rotation, Math.PI * 2);
  if (rotation && rotation.some((part) => part !== 0)) spec.rotation = rotation;
  const emissive = sanitizeColor(value.emissive);
  if (emissive) {
    spec.emissive = emissive;
    spec.emissiveIntensity = clamp(asFiniteNumber(value.emissiveIntensity) ?? 0.4, 0, 4);
  }
  if (value.type === "plane") spec.doubleSide = true;
  return spec;
}

function sanitizeArgs(type: PrimitiveType, raw: unknown): number[] {
  const args: unknown[] = Array.isArray(raw) ? raw : [];
  switch (type) {
    case "box":
      return [
        sanitizeDimension(args[0], 1),
        sanitizeDimension(args[1], 1),
        sanitizeDimension(args[2], 1),
      ];
    case "plane":
      return [sanitizeDimension(args[0], 1), sanitizeDimension(args[1], 1)];
    case "cylinder":
      return [
        sanitizeDimension(args[0], 0.5),
        sanitizeDimension(args[1], asFiniteNumber(args[0]) ?? 0.5),
        sanitizeDimension(args[2], 1),
        sanitizeSegments(args[3], 16),
      ];
    case "sphere":
      return [
        sanitizeDimension(args[0], 0.5),
        sanitizeSegments(args[1], 16),
        sanitizeSegments(args[2], 12),
      ];
  }
}

function isPrimitiveType(value: unknown): value is PrimitiveType {
  return typeof value === "string" && (PRIMITIVE_TYPES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeDimension(value: unknown, fallback: number): number {
  return clamp(asFiniteNumber(value) ?? fallback, MIN_DIMENSION, MAX_DIMENSION);
}

function sanitizeSegments(value: unknown, fallback: number): number {
  return clamp(Math.round(asFiniteNumber(value) ?? fallback), MIN_SEGMENTS, MAX_SEGMENTS);
}

const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function sanitizeColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return COLOR_PATTERN.test(trimmed) ? trimmed : null;
}

function sanitizeTuple3(value: unknown, maxAbs: number): [number, number, number] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const parts = value.slice(0, 3).map(asFiniteNumber);
  if (parts.some((part) => part === null)) return null;
  return [
    clamp(parts[0] as number, -maxAbs, maxAbs),
    clamp(parts[1] as number, -maxAbs, maxAbs),
    clamp(parts[2] as number, -maxAbs, maxAbs),
  ];
}