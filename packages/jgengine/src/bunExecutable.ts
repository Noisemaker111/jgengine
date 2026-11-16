import { existsSync } from "node:fs";
import { win32 } from "node:path";

/**
 * The bun to spawn from code that may run under Node, such as a Vite config or the CLI on `npx`.
 * Under bun it is this process's own binary. Under Node on Windows a bare `"bun"` fails with ENOENT
 * when bun came from npm, which installs a `bun.cmd` wrapper Node cannot spawn without a shell; the
 * real `bun.exe` sits on PATH (the official installer) or inside the npm package next to the wrapper.
 */
export function bunExecutable(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  runningBun: string | null = process.versions["bun"] === undefined ? null : process.execPath,
  exists: (path: string) => boolean = existsSync,
): string {
  if (runningBun !== null) return runningBun;
  if (platform !== "win32") return "bun";
  // Windows path rules whatever the host, so the lookup reads the same in a test on Linux.
  const path = env["PATH"] ?? env["Path"] ?? "";
  for (const dir of path.split(win32.delimiter)) {
    if (dir === "") continue;
    for (const candidate of [win32.join(dir, "bun.exe"), win32.join(dir, "node_modules", "bun", "bin", "bun.exe")]) {
      if (exists(candidate)) return candidate;
    }
  }
  return "bun";
}
