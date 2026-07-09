import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { extractPackageSurface } from "./apiSurface";

const PACKAGES = ["core", "ws", "sql", "react", "convex", "node", "shell", "assets"];

function main(): void {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const outDir = join(root, "apps", "web", "src", "generated", "api");
  mkdirSync(outDir, { recursive: true });

  for (const pkg of PACKAGES) {
    const surface = extractPackageSurface(join(root, "packages", pkg));
    const outPath = join(outDir, `${pkg}.json`);
    writeFileSync(outPath, `${JSON.stringify(surface, null, 2)}\n`);
    console.log(`OK ${pkg}: ${surface.modules.length} modules -> ${outPath}`);
  }
}

if (import.meta.main) main();
