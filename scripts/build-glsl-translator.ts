// `bun scripts/build-glsl-translator.ts`: rebuild packages/core/src/webgpu/glslToWgsl.wasm, the
// WebGPU backend's GLSL-to-WGSL translator, from native/crates/jg-shader-wasm. Run it after changing
// native/crates/jg-shader; the built file is committed so the engine needs no Rust toolchain.
import { copyFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { printHelpIfAsked } from "./script-help";

if (import.meta.main) {
  const usage = {
    summary: "rebuild the WebGPU backend's GLSL-to-WGSL translator (packages/core/src/webgpu/glslToWgsl.wasm)",
    usage: "bun scripts/build-glsl-translator.ts",
    flags: [],
    example: "bun scripts/build-glsl-translator.ts",
  };
  if (printHelpIfAsked("build-glsl-translator", usage)) process.exit(0);
  const root = fileURLToPath(new URL("..", import.meta.url));
  const native = join(root, "native");
  const build = Bun.spawnSync(["cargo", "build", "--profile", "wasm", "--target", "wasm32-unknown-unknown", "-p", "jg-shader-wasm"], { cwd: native, stdout: "inherit", stderr: "inherit" });
  if (build.exitCode !== 0) {
    console.error("build-glsl-translator: cargo failed (needs `rustup target add wasm32-unknown-unknown`)");
    process.exit(build.exitCode ?? 1);
  }
  const from = join(native, "target", "wasm32-unknown-unknown", "wasm", "jg_shader_wasm.wasm");
  const to = join(root, "packages", "core", "src", "webgpu", "glslToWgsl.wasm");
  copyFileSync(from, to);
  console.log(`build-glsl-translator: wrote ${to} (${(statSync(to).size / 1e6).toFixed(2)} MB)`);
}
