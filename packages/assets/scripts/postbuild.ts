import { copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const pkgRoot = resolve(import.meta.dir, "..");
const srcDir = join(pkgRoot, "src");
const distDir = join(pkgRoot, "dist");

function walkJson(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walkJson(full);
    return name.endsWith(".json") ? [full] : [];
  });
}

let copied = 0;
for (const file of walkJson(srcDir)) {
  const target = join(distDir, relative(srcDir, file));
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(file, target);
  copied += 1;
}
console.log(`postbuild: copied ${copied} json file(s) into ${distDir}`);
