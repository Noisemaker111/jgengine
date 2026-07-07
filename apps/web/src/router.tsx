import { createRouter as createTanStackRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultNotFoundComponent: () => (
      <div className="mx-auto max-w-xl px-6 py-32 text-center">
        <p className="text-sm font-mono text-emerald-400">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-100">Nothing here</h1>
        <a href="/" className="mt-6 inline-block text-emerald-400 underline">
          Back to jgengine
        </a>
      </div>
    ),
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
