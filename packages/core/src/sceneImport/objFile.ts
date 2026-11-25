import { parseObj, type ObjObject } from "./objMesh";

/** One OBJ file to fetch and parse. @internal */
export interface ObjFileJob {
  url: string;
}

/** A parsed OBJ file and how many bytes it was. @internal */
export interface ObjFileResult {
  objects: ObjObject[];
  bytes: number;
}

/** @internal */
export function isObjFileJob(value: unknown): value is ObjFileJob {
  return typeof value === "object" && value !== null && "url" in value && typeof value.url === "string";
}

/** @internal */
export function isObjFileResult(value: unknown): value is ObjFileResult {
  return typeof value === "object" && value !== null && "objects" in value && Array.isArray(value.objects) && "bytes" in value && typeof value.bytes === "number";
}

/** Fetch and parse one OBJ file; on whichever thread calls it. @internal */
export async function fetchObjFile(url: string, fetchImpl: typeof fetch = fetch): Promise<ObjFileResult> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const objects = parseObj(bytes);
  return { objects, bytes: bytes.length };
}
