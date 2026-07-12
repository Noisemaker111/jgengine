import { Link, createFileRoute } from "@tanstack/react-router";

import { Page, PageHero } from "../components/Layout";
import { API_PACKAGE_SLUGS, loadApiPackage } from "../content/api";
import type { ApiPackage } from "../content/api";
import { seo } from "../lib/seo";

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
  head: () =>
    seo({
      title: "API Reference — JGengine",
      description: "Generated export surface for every @jgengine/* package.",
      path: "/api",
    }),
  component: ApiIndex,
});

function ApiIndex() {
  const { packages } = Route.useLoaderData();
  return (
    <Page>
      <PageHero
        eyebrow="Generated"
        title="API Reference"
        blurb="The export surface of every published package, generated straight from source at build time."
      />
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        {packages.length === 0 ? (
          <div className="panel mt-10 rounded-2xl p-6 text-sm leading-relaxed text-slate-400 sm:p-8">
            No generated reference found yet. Run{" "}
            <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-cyan-300">
              bun run gen-api-docs
            </code>{" "}
            to build it.
          </div>
        ) : (
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {packages.map(({ slug, pkg }) => (
              <Link
                key={slug}
                to="/api/$pkg"
                params={{ pkg: slug }}
                className="card-hover panel shine group flex flex-col rounded-2xl p-5 hover:border-emerald-400/35 sm:p-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-mono text-base font-semibold text-emerald-300">@jgengine/{slug}</h2>
                  <span className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-emerald-300" aria-hidden>
                    →
                  </span>
                </div>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{pkg.description}</p>
                <p className="mt-4 font-mono text-xs text-slate-600">
                  v{pkg.version} · {pkg.modules.length} module{pkg.modules.length === 1 ? "" : "s"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </Page>
  );
}
