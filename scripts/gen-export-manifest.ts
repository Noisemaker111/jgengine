import { readFileSync, writeFileSync } from "node:fs";
import { computeManifest, manifestPath, serializeManifest } from "./exportManifest";

const check = process.argv.includes("--check");
const next = serializeManifest(computeManifest());

if (check) {
  let current = "";
  try {
    current = readFileSync(manifestPath, "utf8");
  } catch {
    current = "";
  }
  if (current !== next) {
    console.error(
      "export-manifest.json is out of date. The set of importable public subpaths drifted.\n" +
        "Run `bun run gen:export-manifest` and review the diff — a new subpath is a new public API.",
    );
    process.exit(1);
  }
  console.log("export-manifest.json is up to date");
} else {
  writeFileSync(manifestPath, next);
  console.log(`wrote ${manifestPath}`);
}
