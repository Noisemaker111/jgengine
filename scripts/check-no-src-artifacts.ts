import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ARTIFACT = /\.(js|jsx|d\.ts|js\.map|d\.ts\.map)$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : ARTIFACT.test(name) ? [full] : [];
  });
}

const packagesDir = join(process.cwd(), "packages");
const offenders = readdirSync(packagesDir).flatMap((pkg) => {
  const srcDir = join(packagesDir, pkg, "src");
  try {
    return statSync(srcDir).isDirectory() ? walk(srcDir) : [];
  } catch {
    return [];
  }
});

if (offenders.length > 0) {
  console.error(
    `\nBuild artifacts found beside TypeScript source (${offenders.length}):\n` +
      offenders.map((f) => `  ${f.replace(process.cwd() + "\\", "").replace(process.cwd() + "/", "")}`).join("\n") +
      `\n\nsrc/ is pure TypeScript. Compiled .js/.d.ts only ever belong in dist/.\n` +
      `Vite resolves .js over .ts, so these silently shadow their .ts siblings and break dev/shoot.\n` +
      `Fix: delete them (each has a .ts sibling) — 'git rm' the offenders above. They are gitignored so they will not re-add.\n`,
  );
  process.exit(1);
}

console.log("check-no-src-artifacts: clean — no compiled output in packages/*/src");
