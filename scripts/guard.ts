import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

/**
 * Split a shell-free command string into an argv array on whitespace. Used only
 * on the win32 direct-spawn path, where the guard commands that carry pass-through
 * args are single programs (e.g. `bun scripts/drive-dev.ts`) with no quoted spaces.
 */
export function tokenizeCommand(command: string): string[] {
  return command.trim().split(/\s+/);
}

export interface SpawnPlan {
  file: string;
  args: string[];
  options: SpawnOptions;
}

/**
 * Build the child spawn parameters for a platform without ever routing pass-through
 * argv through a lossy shell requoting step.
 *
 * - POSIX: `sh -c '<command> "$@"' guard <extra...>` — the extra args are handed to
 *   the shell as separate argv words and expanded verbatim through `"$@"`, so JSON
 *   payloads (quotes, spaces) survive untouched.
 * - win32 with no pass-through args: run the (possibly compound, `&&`-joined) command
 *   through `cmd.exe /d /s /c` as a single argv element. `cmd` still interprets shell
 *   operators, and there is no argv to corrupt.
 * - win32 with pass-through args: spawn the command's program directly with an argv
 *   array (`shell: false`). Node escapes each argv element for `CreateProcess`, so the
 *   payload reaches the child verbatim without a `cmd.exe` round-trip that would double
 *   quotes and split JSON. The guard commands that carry args are single programs, not
 *   shell pipelines.
 */
export function buildSpawn(platform: NodeJS.Platform, command: string, extra: string[]): SpawnPlan {
  if (platform === "win32") {
    if (extra.length === 0) {
      return {
        file: "cmd.exe",
        args: ["/d", "/s", "/c", command],
        options: { stdio: "inherit", shell: false, windowsHide: true },
      };
    }
    const [file, ...base] = tokenizeCommand(command);
    return {
      file: file as string,
      args: [...base, ...extra],
      options: { stdio: "inherit", shell: false, windowsHide: true },
    };
  }
  return {
    file: "sh",
    args: ["-c", `${command} "$@"`, "guard", ...extra],
    options: { stdio: "inherit", detached: true },
  };
}

if (import.meta.main) {
  const [, , budgetArg, command, ...extra] = process.argv;
  const budgetSeconds = Number(budgetArg);
  if (!Number.isFinite(budgetSeconds) || budgetSeconds <= 0 || command === undefined || command.length === 0) {
    console.error("usage: bun scripts/guard.ts <seconds> '<command>' [args...]");
    process.exit(2);
  }

  const isWin = process.platform === "win32";
  const plan = buildSpawn(process.platform, command, extra);
  const child: ChildProcess = spawn(plan.file, plan.args, plan.options);

  const killTree = (signal: NodeJS.Signals): void => {
    if (child.pid === undefined) return;
    if (isWin) {
      try {
        spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
          stdio: "ignore",
          windowsHide: true,
        });
      } catch {
        try {
          child.kill();
        } catch {
          /* already gone */
        }
      }
      return;
    }
    try {
      process.kill(-child.pid, signal);
    } catch {
      try {
        child.kill(signal);
      } catch {
        /* already gone */
      }
    }
  };

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => killTree(signal));
  }

  const timer = setTimeout(() => {
    console.error(`\nguard: '${command}' exceeded the ${budgetSeconds}s hard limit — killing its process tree`);
    killTree("SIGKILL");
    process.exit(124);
  }, budgetSeconds * 1000);

  child.on("exit", (code, signal) => {
    clearTimeout(timer);
    process.exit(code ?? (signal === null ? 0 : 1));
  });

  child.on("error", (err) => {
    clearTimeout(timer);
    console.error(`guard: failed to spawn command: ${err.message}`);
    process.exit(1);
  });
}
