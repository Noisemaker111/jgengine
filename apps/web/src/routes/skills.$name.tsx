import { Link, createFileRoute, notFound } from "@tanstack/react-router";

import { CopyButton } from "../components/Copy";
import { Page } from "../components/Layout";
import { loadSkill } from "../content/skills";

export const Route = createFileRoute("/skills/$name")({
  loader: async ({ params }) => {
    const [skill, { marked }] = await Promise.all([loadSkill(params.name), import("marked")]);
    if (!skill) throw notFound();
    return {
      name: skill.name,
      description: skill.description,
      markdown: skill.markdown,
      html: marked.parse(skill.body, { async: false }),
    };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.name ?? "Skill"} — JGengine` },
      { name: "description", content: loaderData?.description ?? "" },
    ],
  }),
  component: SkillPage,
});

function SkillPage() {
  const { name, description, markdown, html } = Route.useLoaderData();
  return (
    <Page>
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Link
          to="/skills"
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-emerald-300"
        >
          <span aria-hidden>←</span> All skills
        </Link>
        <div className="mt-6 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-emerald-400/[0.06] to-transparent p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-mono text-2xl font-bold tracking-tight text-slate-50">{name}</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">{description}</p>
            </div>
            <CopyButton value={markdown} label="Copy markdown" />
          </div>
        </div>

        <article className="prose-skill mt-10" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </Page>
  );
}
