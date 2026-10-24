// One shape for `--help` across the scripts a lane runs. The usage text lives in
// the script it describes, so the flags and the parser cannot drift apart, and
// `bun run check:script-help` proves every documented script still answers.
export interface UsageFlag {
  flag: string;
  detail: string;
}

export interface Usage {
  /** One line: what the command is for. */
  summary: string;
  /** The command line, flags included. */
  usage: string;
  flags: readonly UsageFlag[];
  example: string;
  /** Optional exit-code list, when a script exits for more than 0 and 1. */
  exits?: readonly string[];
}

export function isHelpAsked(argv: readonly string[]): boolean {
  return argv.includes("--help") || argv.includes("-h");
}

export function renderUsage(name: string, usage: Usage): string {
  const width = Math.max(...usage.flags.map((flag) => flag.flag.length), 9) + 2;
  const lines = [`${name}: ${usage.summary}`, "", "Usage:", `  ${usage.usage}`, ""];
  if (usage.flags.length > 0) {
    lines.push("Flags:");
    for (const flag of usage.flags) lines.push(`  ${flag.flag.padEnd(width)}${flag.detail}`);
    lines.push(`  ${"--help, -h".padEnd(width)}print this help and exit 0`);
    lines.push("");
  }
  lines.push("Example:", `  ${usage.example}`);
  if (usage.exits !== undefined && usage.exits.length > 0) {
    lines.push("", "Exit:");
    for (const line of usage.exits) lines.push(`  ${line}`);
  }
  return lines.join("\n");
}

/** Prints the usage block when `--help`/`-h` was asked for; the caller returns 0 when this is true. */
export function printHelpIfAsked(name: string, usage: Usage, argv: readonly string[] = process.argv.slice(2)): boolean {
  if (!isHelpAsked(argv)) return false;
  console.log(renderUsage(name, usage));
  return true;
}
