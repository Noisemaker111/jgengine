// `bun scripts/build-jg-ui-wasm.ts`: rebuild native/wasm/jg-ui/, the wasm + JS glue the
// engine's Rune UI layer (native/crates/jg-ui) serves to games. Run it after changing jg-ui or
// the vendored Rune under native/vendor/rune. Commit its output with the source change;
// the Vite plugin serves this bundle on fresh checkouts without a Rust toolchain.
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { printHelpIfAsked } from "./script-help";

if (import.meta.main) {
  const usage = {
    summary: "rebuild the jg-ui wasm bundle games load for HUD and menus (native/wasm/jg-ui/)",
    usage: "bun scripts/build-jg-ui-wasm.ts",
    flags: [],
    example: "bun scripts/build-jg-ui-wasm.ts",
  };
  if (printHelpIfAsked("build-jg-ui-wasm", usage)) process.exit(0);
  const root = fileURLToPath(new URL("..", import.meta.url));
  const native = join(root, "native");
  const out = join(native, "wasm", "jg-ui");
  const build = Bun.spawnSync(["cargo", "build", "--jobs", "4", "--profile", "wasm", "--target", "wasm32-unknown-unknown", "-p", "jg-ui"], { cwd: native, stdout: "inherit", stderr: "inherit" });
  if (build.exitCode !== 0) {
    console.error("build-jg-ui-wasm: cargo failed (needs `rustup target add wasm32-unknown-unknown`)");
    process.exit(build.exitCode ?? 1);
  }
  const wasm = join(native, "target", "wasm32-unknown-unknown", "wasm", "jg_ui.wasm");
  if (!existsSync(wasm)) {
    console.error(`build-jg-ui-wasm: expected ${wasm}`);
    process.exit(1);
  }
  mkdirSync(out, { recursive: true });
  const bindgen = Bun.spawnSync(["wasm-bindgen", "--target", "web", "--out-dir", out, wasm], { stdout: "inherit", stderr: "inherit" });
  if (bindgen.exitCode !== 0) {
    console.error("build-jg-ui-wasm: wasm-bindgen failed (needs `cargo install wasm-bindgen-cli --version 0.2.130` or the matching release)");
    process.exit(bindgen.exitCode ?? 1);
  }
  console.log(`build-jg-ui-wasm: wrote ${out}`);
}
