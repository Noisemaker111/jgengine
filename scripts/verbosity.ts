/**
 * How much a tool prints. By default shoot, verify:fast and lane:close print what the run produced
 * (the summary, the result and its warnings) and every failure in full; progress, reuse and timing
 * lines are kept for `--verbose`. The command a person types turns `--verbose` into
 * `JG_VERBOSE=1`, so every script and library under it, child processes included, reads one switch.
 */

export const VERBOSE_FLAG = "--verbose";
export const VERBOSE_ENV = "JG_VERBOSE";

/** Whether this run prints its detail lines. */
export function isVerbose(env: Record<string, string | undefined> = process.env): boolean {
  return env[VERBOSE_ENV] === "1";
}

/**
 * Take `--verbose` off a command line and turn it into the environment switch, so a script that
 * refuses unknown flags never sees it and its children inherit it.
 */
export function takeVerboseFlag(argv: readonly string[], env: Record<string, string | undefined> = process.env): string[] {
  if (!argv.includes(VERBOSE_FLAG)) return [...argv];
  env[VERBOSE_ENV] = "1";
  return argv.filter((arg) => arg !== VERBOSE_FLAG);
}

/** Print a progress, reuse or timing line, only under `--verbose`. */
export function detail(line: string): void {
  if (isVerbose()) console.error(line);
}
