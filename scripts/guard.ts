import { spawn } from "node:child_process";

const [, , budgetArg, command, ...extra] = process.argv;
const budgetSeconds = Number(budgetArg);
if (!Number.isFinite(budgetSeconds) || budgetSeconds <= 0 || command === undefined || command.length === 0) {
  console.error("usage: bun scripts/guard.ts <seconds> '<command>' [args...]");
  process.exit(2);
}

const child = spawn("sh", ["-c", `${command} "$@"`, "guard", ...extra], {
  stdio: "inherit",
  detached: true,
});

function killTree(signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
  }
}

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
