import { Link, createFileRoute } from "@tanstack/react-router";

import { Page } from "../components/Layout";
import { loadApiPackage } from "../content/api";
import { seo } from "../lib/seo";

export const Route = createFileRoute("/api/$pkg")({
  loader: async ({ params }) => {
    const pkg = await loadApiPackage(params.pkg);
    return { slug: params.pkg, pkg };
  },
  head: ({ loaderData, params }) =>
    seo({
      title: `@jgengine/${loaderData?.slug ?? "api"} — JGengine`,
      description: loaderData?.pkg?.description ?? "",
      path: `/api/${params.pkg}`,
    }),
  component: ApiPackagePage,
});

function ApiPackagePage() {
  const { slug, pkg } = Route.useLoaderData();

  return (
    <Page>
      <div className="mx-auto max-w-4xl px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
        <Link
          to="/api"
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-emerald-300"
        >
          <span aria-hidden>←</span> API reference
        </Link>

        {pkg === null ? (
          <div className="panel mt-6 rounded-2xl p-6 sm:p-8">
            <h1 className="font-mono text-2xl font-bold tracking-tight text-slate-50">@jgengine/{slug}</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              No generated reference for this package. Run{" "}
              <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-cyan-300">
                bun run gen-api-docs
              </code>{" "}
              to build it.
            </p>
          </div>
        ) : (
          <>
            <div className="panel panel-top-glow mt-6 overflow-hidden rounded-2xl bg-gradient-to-b from-emerald-400/[0.07] to-transparent p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-mono text-xs uppercase tracking-[0.22em] text-emerald-400/80">Package</p>
                  <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-50">{pkg.name}</h1>
                  <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-slate-400">{pkg.description}</p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-xs text-slate-400">
                  v{pkg.version}
                </span>
              </div>
              {pkg.modules.length > 1 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {pkg.modules.map((mod) => (
                    <a
                      key={mod.path}
                      href={`#@jgengine/${slug}/${mod.path}`}
                      className="rounded-full border border-white/10 bg-ink/60 px-3 py-1 font-mono text-xs text-slate-400 transition hover:border-emerald-400/40 hover:text-emerald-300"
                    >
                      {mod.path}
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-10 space-y-12">
              {pkg.modules.map((mod) => {
                const anchor = `@jgengine/${slug}/${mod.path}`;
                return (
                  <section key={mod.path} id={anchor} className="scroll-mt-24">
                    <h2 className="flex items-center gap-3 font-mono text-lg font-semibold text-emerald-300">
                      <a href={`#${anchor}`} className="hover:underline">
                        {anchor}
                      </a>
                      <span className="hairline min-w-0 flex-1" aria-hidden />
                    </h2>
                    <div className="panel mt-4 divide-y divide-white/[0.06] rounded-2xl">
                      {mod.exports.map((exp) => (
                        <div key={exp.name} className="p-5 sm:p-6">
                          <div className="flex flex-wrap items-baseline justify-between gap-3">
                            <h3 className="font-mono text-sm font-semibold text-slate-100">{exp.name}</h3>
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wide text-slate-500">
                              {exp.kind}
                            </span>
                          </div>
                          <pre className="mt-3 overflow-x-auto rounded-lg border border-white/[0.06] bg-ink-deep/80 p-3 font-mono text-xs text-cyan-300">
                            <code>{exp.signature}</code>
                          </pre>
                          {exp.doc !== undefined && (
                            <p className="mt-3 text-sm leading-relaxed text-slate-400">{exp.doc}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Page>
  );
}
