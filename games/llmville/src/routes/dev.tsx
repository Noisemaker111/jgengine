import { Outlet, createFileRoute, redirect, useLocation } from "@tanstack/react-router";

import {
  DEV_PREVIEW_LAYOUT,
  DEV_PREVIEW_LINKS,
  getDevPreviewLayout,
  isDevPreviewActive,
} from "@/dev/devPreviewCatalog";
import { cn } from "@/components/ui/cn";

function DevPreviewNav() {
  const location = useLocation();

  return (
    <header className="shrink-0 border-b border-slate-300 bg-slate-100 px-4 py-2.5 text-slate-950 shadow-sm">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              LLMville workbench
            </p>
            <h1 className="text-lg font-bold leading-tight">Dev previews</h1>
          </div>
          <a
            href="/"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Back to app
          </a>
        </div>
        <nav className="flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Dev preview routes">
          {DEV_PREVIEW_LINKS.map((preview) => {
            const active = isDevPreviewActive(location.pathname, preview);
            return (
              <a
                key={preview.href}
                href={preview.href}
                className={cn(
                  "shrink-0 rounded border px-2.5 py-1 text-sm font-medium transition",
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-500 hover:text-slate-950",
                )}
              >
                {preview.title}
              </a>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

function DevIndexContent() {
  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-5 px-5 py-6">
      <section>
        <h2 className="text-3xl font-bold">Choose a preview</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-700">
          Visual routes for checking real components, game geometry, and layout states without
          walking through the full player flow.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DEV_PREVIEW_LINKS.filter((preview) => preview.href !== "/dev").map((preview) => (
          <a
            key={preview.href}
            href={preview.href}
            className="rounded border border-slate-300 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow"
          >
            <h3 className="text-lg font-semibold text-slate-950">{preview.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{preview.description}</p>
            <p className="mt-4 text-xs font-medium text-slate-500">{preview.href}</p>
          </a>
        ))}
      </section>
    </div>
  );
}

function DevLayout() {
  const location = useLocation();
  const isIndex = location.pathname === "/dev" || location.pathname === "/dev/";
  const layout = getDevPreviewLayout(location.pathname);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-200 text-slate-950">
      <DevPreviewNav />
      <div
        className={cn(
          "min-h-0 flex-1",
          layout === DEV_PREVIEW_LAYOUT.fullscreen ? "overflow-hidden" : "overflow-y-auto",
        )}
      >
        {isIndex ? <DevIndexContent /> : <Outlet />}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/dev")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: DevLayout,
});