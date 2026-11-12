/**
 * Start a long-lived process (the dev broker, a kept dev server, the daemon's Chrome, a background
 * task's supervisor) so that nothing which ends its caller can end it.
 *
 * On Windows a child stays in its caller's job object even when detached or started through
 * `Start-Process`, and agent harnesses end a whole job when a command times out or is stopped. That
 * killed the machine's dev broker about ten times in one hour on 2026-11-08 with no log line, and
 * every capture borrowing its browser failed mid-run. lane:close's background runner died the same way on
 * 2026-11-03. So on Windows the WMI service creates the process: it has no parent here and no job to
 * share, and it gets exactly the environment passed in.
 */
import { spawn, spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";

export interface StartOutsideCallerOptions {
  cwd: string;
  /** The whole environment the process starts with. Defaults to this process's. */
  env?: NodeJS.ProcessEnv;
  /**
   * Append the process's stdout and stderr to this file instead of discarding them, so a runtime
   * that dies before its own handlers run (a panic, an abort) still leaves its last words. Not on
   * Windows, where WMI starts the process with no handles of ours.
   */
  outputPath?: string;
}

/** One argument as a Windows C runtime reads it back from a command line. */
export function windowsCommandLineArg(value: string): string {
  if (value.length > 0 && !/[\s"]/.test(value)) return value;
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1")}"`;
}

/** The command line WMI is given for `file args...`. */
export function windowsCommandLine(file: string, args: readonly string[]): string {
  return [file, ...args].map(windowsCommandLineArg).join(" ");
}

/** `NAME=value` entries for WMI's startup environment, skipping names Windows cannot hold. */
export function environmentEntries(env: NodeJS.ProcessEnv): string[] {
  const entries: string[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || name.length === 0 || name.includes("=")) continue;
    entries.push(`${name}=${value}`);
  }
  return entries;
}

const WMI_CREATE =
  // Not piped: Windows PowerShell 5.1 hands a piped JSON array on as one item.
  "$e = [string[]](ConvertFrom-Json -InputObject $env:JG_OC_ENV); " +
  "$s = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ShowWindow=[uint16]0; EnvironmentVariables=$e}; " +
  "$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=$env:JG_OC_LINE; CurrentDirectory=$env:JG_OC_CWD; ProcessStartupInformation=$s}; " +
  "if ($r.ReturnValue -ne 0) { [Console]::Error.Write(\"Win32_Process.Create returned $($r.ReturnValue)\"); exit 1 }; " +
  "[Console]::Out.Write($r.ProcessId)";

/** Start `file args...` outside this process's tree and job; returns its pid. Throws when it could not start. */
export function startOutsideCaller(file: string, args: readonly string[], options: StartOutsideCallerOptions): number {
  const env = options.env ?? process.env;
  if (process.platform !== "win32") {
    let out: number | null = null;
    try {
      if (options.outputPath !== undefined) out = openSync(options.outputPath, "a");
    } catch {
      out = null; // an unwritable log only loses the output, never the start
    }
    const child = spawn(file, [...args], { cwd: options.cwd, env, detached: true, stdio: out === null ? "ignore" : ["ignore", out, out] });
    if (out !== null) closeSync(out);
    child.unref();
    if (child.pid === undefined) throw new Error(`could not start ${file}`);
    return child.pid;
  }
  // Everything reaches PowerShell through its environment, so no quoting layer touches it.
  const run = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", WMI_CREATE], {
    encoding: "utf8",
    env: {
      ...process.env,
      JG_OC_LINE: windowsCommandLine(file, args),
      JG_OC_CWD: options.cwd,
      JG_OC_ENV: JSON.stringify(environmentEntries(env)),
    },
    windowsHide: true,
    timeout: 30_000,
  });
  const pid = Number(run.stdout?.trim());
  if (run.status !== 0 || !Number.isInteger(pid) || pid <= 0) {
    throw new Error(`could not start ${file} outside the caller: ${run.stderr?.trim() || run.error?.message || `exit ${run.status}`}`);
  }
  return pid;
}
