import { fileURLToPath } from "node:url";

const ui = fileURLToPath(new URL("../../packages/core/src/ui/jsx", import.meta.url)).replaceAll("\\", "/");

/**
 * LLMville's backend libraries (`convex/react`, `better-auth/react`, `@convex-dev/better-auth/react`)
 * are written against React's hooks. LLMville has no React: these Vite aliases hand those libraries
 * the engine's UI runtime under React's module names, so their hooks run in the engine's renderer.
 * Any server that bundles LLMville needs them: its own app, and the dev runner. They go when
 * LLMville reads Convex and its session without those three libraries.
 */
export function reactOnEngineAliases(): { find: RegExp; replacement: string }[] {
  return [
    { find: /^react\/jsx-runtime$/, replacement: `${ui}/jsx-runtime.ts` },
    { find: /^react\/jsx-dev-runtime$/, replacement: `${ui}/jsx-dev-runtime.ts` },
    { find: /^react-dom\/client$/, replacement: `${ui}/client.view.ts` },
    { find: /^react-dom\/server$/, replacement: `${ui}/markup.ts` },
    { find: /^react-dom$/, replacement: `${ui}/client.view.ts` },
    { find: /^react$/, replacement: `${ui}/index.ts` },
  ];
}

/** The engine runtime is source and must stay one module instance, so the dependency pre-bundle leaves these names out. */
export const REACT_ON_ENGINE_NAMES = ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom/client", "react-dom/server"];
