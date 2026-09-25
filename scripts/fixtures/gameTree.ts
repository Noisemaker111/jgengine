import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Writes `files` (repo-relative paths) into a fresh temp root. Every `Games/<id>/` it touches also gets the
 * `src/index.tsx` barrel that `eachGameSource` requires before it treats a folder as a game. */
export function writeGameTree(prefix: string, files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  for (const [rel, source] of Object.entries(files)) {
    const path = join(root, rel);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, source);
  }
  for (const rel of Object.keys(files)) {
    const game = /^Games\/([^/]+)\//.exec(rel)?.[1];
    if (game === undefined) continue;
    const barrel = join(root, "Games", game, "src/index.tsx");
    if (existsSync(barrel)) continue;
    mkdirSync(join(barrel, ".."), { recursive: true });
    writeFileSync(barrel, "export {};\n");
  }
  return root;
}
