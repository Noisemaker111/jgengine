import { Link, createFileRoute } from "@tanstack/react-router";

import { Page } from "../components/Layout";
import { API_PACKAGE_SLUGS, loadApiPackage } from "../content/api";
import type { ApiPackage } from "../content/api";

export const Route = createFileRoute("/api/")({
  loader: async () => {
    const loaded = await Promise.all(
      API_PACKAGE_SLUGS.map(async (slug) => ({ slug, pkg: await loadApiPackage(slug) })),
    );
    const packages = loaded.filter(
      (entry): entry is { slug: string; pkg: ApiPackage } => entry.pkg !== null,
    );
    return { packages };
  },
  head: () => ({
    meta: [
      { title: "API Reference — JGengine" },
      {
        name: "description",
        content: "Generated export surface for every @jgengine/* package.",
      },
    ],
  }),
  component: ApiIndex,
});

function ApiIndex() {
  const { packages } = Route.useLoaderData();
  return (
    <Page>
      <section className="relative overflow-hidden">
        <div className="glow-emerald pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-400/80">Generated</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">API Reference</h1>
          <p className="mt-4 max-w-2xl text-slate-400">
            The export surface of every published package, generated straight from source at build time.
          </p>

          {packages.length === 0 ? (
            <div className="mt-12 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 text-sm leading-relaxed text-slate-400 sm:p-8">
              No generated reference found yet. Run{" "}
              <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-cyan-300">
                bun run gen-api-docs
              </code>{" "}
              to build it.
            </div>
          ) : (
            <div className="mt-12 space-y-4">
              {packages.map(({ slug, pkg }, i) => (
                <Link
                  key={slug}
                  to="/api/$pkg"
                  params={{ pkg: slug }}
                  className="card-hover group flex items-start gap-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 hover:border-emerald-400/30 sm:p-6"
                >
                  <span className="hidden pt-0.5 font-mono text-sm text-slate-600 sm:block">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="font-mono text-base font-semibold text-emerald-300">@jgengine/{slug}</h2>
                      <span className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-emerald-300">
                        →
                      </span>
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">{pkg.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </Page>
  );
}
