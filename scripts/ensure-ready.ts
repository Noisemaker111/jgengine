import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

function run(label: string, cmd: string[]): void {
  console.log(`ensure-ready: ${label}`);
  const result = Bun.spawnSync(cmd, { stdout: "inherit", stderr: "inherit" });
  if (result.exitCode !== 0) {
    console.error(`ensure-ready: '${cmd.join(" ")}' failed with exit code ${result.exitCode}`);
    process.exit(result.exitCode ?? 1);
  }
}

if (!existsSync(join(process.cwd(), "node_modules", ".bin", "tsgo"))) {
  run("node_modules incomplete (tsgo missing) — running bun install", ["bun", "install"]);
}

const packagesDir = join(process.cwd(), "packages");
const unbuilt = readdirSync(packagesDir).filter(
  (pkg) =>
    existsSync(join(packagesDir, pkg, "tsconfig.json")) &&
    !existsSync(join(packagesDir, pkg, "dist")),
);
if (unbuilt.length > 0) {
  run(
    `dist/ missing for ${unbuilt.join(", ")} (package exports point at dist/) — running bun run build`,
    ["bun", "run", "build"],
  );
}
