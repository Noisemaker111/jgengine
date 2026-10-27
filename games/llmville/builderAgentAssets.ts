/**
 * Helpers for the agent-facing POST /__llmville-builder/assets endpoint.
 */
import { isRecord } from "@jgengine/core/data/untyped";

export interface BuilderAgentAssetRequest {
  id: string;
  label: string;
  tags?: string[];
  decor: Record<string, unknown>;
  footprint?: { width: number; depth: number };
  prompt?: string;
  suggestedPath?: string;
  promotedModelKey?: string;
  /** When true (default), persist to source-library + builder-library.json */
  save?: boolean;
  /** When true (default), queue a viewport-only screenshot after placing */
  verify?: boolean;
}

export interface BuilderAgentAssetLibraryEntry {
  id: string;
  label: string;
  tags: string[];
  kind: "group";
  footprint?: { width: number; depth: number } | undefined;
  decor: Record<string, unknown>;
  prompt?: string;
  suggestedPath?: string;
  promotedModelKey?: string;
}

export function parseAgentAssetRequest(body: unknown): BuilderAgentAssetRequest | null {
  if (!isRecord(body)) return null;
  const { id, label, decor, tags: rawTags, footprint: rawFootprint, prompt, suggestedPath, promotedModelKey, save, verify } = body;
  if (typeof id !== "string" || id.trim().length === 0) return null;
  if (typeof label !== "string" || label.trim().length === 0) return null;
  if (!isRecord(decor)) return null;
  if (typeof decor["type"] !== "string") return null;

  const tags = Array.isArray(rawTags)
    ? rawTags.filter((tag): tag is string => typeof tag === "string")
    : ["prop"];

  const decorFootprint = decor["footprint"];
  const footprint = isFootprint(rawFootprint)
    ? rawFootprint
    : isFootprint(decorFootprint)
      ? decorFootprint
      : { width: 1, depth: 1 };
  const decorId = decor["id"];

  return {
    id: id.trim(),
    label: label.trim(),
    tags,
    decor: {
      ...decor,
      id: typeof decorId === "string" ? decorId : id.trim(),
      footprint,
    },
    footprint,
    ...(typeof prompt === "string" ? { prompt } : {}),
    ...(typeof suggestedPath === "string" ? { suggestedPath } : {}),
    ...(typeof promotedModelKey === "string" ? { promotedModelKey } : {}),
    save: save !== false,
    verify: verify !== false,
  };
}

function isFootprint(value: unknown): value is { width: number; depth: number } {
  return isRecord(value) && typeof value["width"] === "number" && typeof value["depth"] === "number";
}

export function buildAgentAssetLibraryEntry(request: BuilderAgentAssetRequest): BuilderAgentAssetLibraryEntry {
  const slug = request.id;
  return {
    id: slug,
    label: request.label,
    tags: request.tags ?? ["prop"],
    kind: "group",
    footprint: request.footprint,
    decor: request.decor,
    ...(request.prompt !== undefined ? { prompt: request.prompt } : {}),
    suggestedPath: request.suggestedPath ?? `/models/dev/${slug.replaceAll("_", "-")}.glb`,
    promotedModelKey: request.promotedModelKey ?? slug,
  };
}

/** Isolated 50 m stage with a single decor item centered for agent editing. */
export function buildIsolatedAgentAssetScene(decor: Record<string, unknown>): Record<string, unknown> {
  const position = Array.isArray(decor["position"]) ? decor["position"] : [0, 0, 0];
  return {
    tier: "garage",
    version: 1,
    grid: {
      tileSize: 1,
      tilesX: 50,
      tilesZ: 50,
      originX: 0,
      originZ: 0,
      wallThicknessTiles: 1,
    },
    environment: {
      wallHeight: 3.4,
      wallThickness: 0.25,
      floor: { width: 50, depth: 50, centerX: 0, centerZ: 0 },
      floorMaterial: "garage-floor",
      wallMaterial: "garage-wall",
      ceilingColor: "#dbdde0",
      wallColor: "#828c87",
      floorRepeat: [50, 50],
    },
    walls: [],
    colliders: [],
    decor: [{ ...decor, position }],
    landmarks: [],
    frontDoorPosition: { x: -4, z: 0 },
    dropoffPosition: { x: -4, z: 0 },
  };
}