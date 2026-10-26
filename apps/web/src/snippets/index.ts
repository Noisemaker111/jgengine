// The code the home page shows lives in this folder as real files. apps/web check-types compiles them
// against the engine source on every change, so a snippet that stops building fails CI, not a reader.
const RAW = import.meta.glob<string>("./*.{ts,tsx}", { query: "?raw", import: "default", eager: true });

export type SnippetFile = "save.ts" | "mobile-hud.tsx" | "controllers.ts" | "physics.ts";

export function snippet(file: SnippetFile): string {
  const code = RAW[`./${file}`];
  if (code === undefined) throw new Error(`apps/web/src/snippets/${file} is missing`);
  return code.trimEnd();
}
