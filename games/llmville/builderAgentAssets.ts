/**
 * Helpers for the agent-facing POST /__llmville-builder/assets endpoint.
 */

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
  footprint?: { width: number; depth: number };
  decor: Record<string, unknown>;
  prompt?: string;
  suggestedPath?: string;
  promotedModelKey?: string;
}

export function parseAgentAssetRequest(body: unknown): BuilderAgentAssetRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.id !== "string" || record.id.trim().length === 0) return null;
  if (typeof record.label !== "string" || record.label.trim().length === 0) return null;
  if (typeof record.decor !== "object" || record.decor === null) return null;
  const decor = record.decor as Record<string, unknown>;
  if (typeof decor.type !== "string") return null;

  const tags = Array.isArray(record.tags)
    ? record.tags.filter((tag): tag is string => typeof tag === "string")
    : ["prop"];

  const footprint = isFootprint(record.footprint)
    ? record.footprint
    : isFootprint(decor.footprint)
      ? decor.footprint
      : { width: 1, depth: 1 };

  return {
    id: record.id.trim(),
    label: record.label.trim(),
    tags,
    decor: {
      ...decor,
      id: typeof decor.id === "string" ? decor.id : record.id.trim(),
      footprint,
    },
    footprint,
    ...(typeof record.prompt === "string" ? { prompt: record.prompt } : {}),
    ...(typeof record.suggestedPath === "string" ? { suggestedPath: record.suggestedPath } : {}),
    ...(typeof record.promotedModelKey === "string" ? { promotedModelKey: record.promotedModelKey } : {}),
    save: record.save !== false,
    verify: record.verify !== false,
  };
}

function isFootprint(value: unknown): value is { width: number; depth: number } {
  return (
    typeof value === "object"
    && value !== null
    && typeof (value as { width: unknown }).width === "number"
    && typeof (value as { depth: unknown }).depth === "number"
  );
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
  const position = Array.isArray(decor.position) ? decor.position : [0, 0, 0];
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