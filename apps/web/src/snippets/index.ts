// The code the site shows lives in this folder as real files. apps/web check-types compiles them
// against the engine source on every change, so a snippet that stops building fails CI, not a reader.
export type SnippetFile = "save.ts" | "mobile-hud.tsx" | "controllers.ts" | "physics.ts" | "keybinds.ts" | "meadow.ts" | "car.ts" | "projectiles.ts" | "adopt-minimap.tsx" | "adopt-health.ts" | "adopt-damage.ts" | "adopt-xp.ts" | "cable.ts" | "hills.ts";

let raw: Record<string, string> | undefined;

export function snippet(file: SnippetFile): string {
  // Read on first use, so modules that import this one still load outside Vite (bun test).
  raw ??= import.meta.glob<string>("./*.{ts,tsx}", { query: "?raw", import: "default", eager: true });
  const code = raw[`./${file}`];
  if (code === undefined) throw new Error(`apps/web/src/snippets/${file} is missing`);
  return code.trimEnd();
}
