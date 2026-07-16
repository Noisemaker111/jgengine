import { fileURLToPath } from "node:url";

import { runOrphanRatchet } from "./orphanRatchet";

const root = fileURLToPath(new URL("..", import.meta.url));
const failures = runOrphanRatchet(root);

if (failures.length > 0) {
  console.error(`\ncheck-orphan-ratchet failed:\n${failures.map((f) => `  ${f}`).join("\n")}\n`);
  process.exit(1);
}
console.log("orphan-ratchet ok: committed orphan baseline does not grow vs origin/main");
