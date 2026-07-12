import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function run(label: string, cmd: string[], timeoutMs: number): void {
  console.log(`ensure-ready: ${label}`);
  const result = Bun.spawnSync(cmd, {
    stdout: "inherit",
    stderr: "inherit",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
  });
  if (result.exitCode !== 0) {
    const reason = result.signalCode
      ? `was killed by ${result.signalCode} — likely hit the ${Math.round(timeoutMs / 1000)}s hard timeout`
      : `failed with exit code ${result.exitCode}`;
    console.error(`ensure-ready: '${cmd.join(" ")}' ${reason}`);
    process.exit(result.exitCode ?? 1);
  }
}

if (!existsSync(join(process.cwd(), "node_modules", ".bin", "tsgo"))) {
  run("node_modules incomplete (tsgo missing) — running bun install", ["bun", "install"], 300_000);
}

if (process.argv.includes("--install-only")) process.exit(0);

function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtime(full));
    } else {
      newest = Math.max(newest, statSync(full).mtimeMs);
    }
  }
  return newest;
}

const packagesDir = join(process.cwd(), "packages");
const needsBuild = readdirSync(packagesDir).filter((pkg) => {
  const dir = join(packagesDir, pkg);
  if (!existsSync(join(dir, "tsconfig.json"))) return false;
  const dist = join(dir, "dist");
  if (!existsSync(dist)) return true;
  const src = join(dir, "src");
  return existsSync(src) && newestMtime(src) > newestMtime(dist);
});
if (needsBuild.length > 0) {
  run(
    `dist/ missing or stale for ${needsBuild.join(", ")} (package exports point at dist/) — running bun run build`,
    ["bun", "run", "build"],
    600_000,
  );
}
