import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** @internal */
export const desktopSha256 = (bytes: string | Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

interface MapEntry { script: string; map: string }

/** Move maps outside the packaged dist and bind each to the exact generated script. @internal */
export function extractDesktopMaps(dist: string, privateRoot: string): { digest: string; directory: string; count: number } {
  const entries: Record<string, MapEntry> = {};
  const maps: { path: string; hash: string; bytes: Uint8Array }[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith(".map")) {
        const script = path.slice(0, -4);
        if (script.endsWith(".js") && existsSync(script)) {
          const bytes = readFileSync(path);
          const hash = desktopSha256(bytes);
          const scriptHash = desktopSha256(readFileSync(script));
          if (entries[scriptHash] !== undefined && entries[scriptHash]?.map !== hash) throw new Error(`ambiguous maps for script ${script}`);
          entries[scriptHash] = { script: scriptHash, map: hash };
          maps.push({ path, hash, bytes });
        } else maps.push({ path, hash: "", bytes: new Uint8Array() });
      } else if (entry.isFile() && /\.(js|css|html)$/i.test(entry.name) && /sourceMappingURL\s*=\s*data:/i.test(readFileSync(path, "utf8"))) {
        throw new Error(`inline source map cannot be kept private: ${path}`);
      }
    }
  };
  visit(dist);
  const index = JSON.stringify(Object.values(entries).sort((a, b) => a.script.localeCompare(b.script)));
  const digest = desktopSha256(index);
  const directory = join(privateRoot, digest);
  mkdirSync(directory, { recursive: true });
  for (const map of maps) {
    if (map.hash !== "") writeFileSync(join(directory, `${map.hash}.map`), map.bytes);
    rmSync(map.path);
  }
  writeFileSync(join(directory, "index.json"), index);
  return { digest, directory, count: Object.keys(entries).length };
}

/** Resolve only maps bound to the app's embedded index and exact running script. @internal */
export function readPrivateDesktopMap(directory: string, digest: string, script: string): string | null {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("invalid private map identity");
  const index = readFileSync(join(directory, digest, "index.json"), "utf8");
  if (desktopSha256(index) !== digest) throw new Error("private map index does not match the app");
  const parsed: unknown = JSON.parse(index);
  if (!Array.isArray(parsed)) throw new Error("invalid private map index");
  const hash = desktopSha256(script);
  const entry: unknown = parsed.find((item: unknown) => typeof item === "object" && item !== null && Reflect.get(item, "script") === hash);
  if (typeof entry !== "object" || entry === null) return null;
  const map = Reflect.get(entry, "map");
  if (typeof map !== "string" || !/^[a-f0-9]{64}$/.test(map)) throw new Error("invalid private map entry");
  const bytes = readFileSync(join(directory, digest, `${map}.map`));
  if (desktopSha256(bytes) !== map) throw new Error("private source map does not match the app");
  return bytes.toString("utf8");
}
