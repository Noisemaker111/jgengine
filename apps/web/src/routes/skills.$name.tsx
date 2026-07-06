import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { marked } from "marked";

import { CopyButton } from "../components/Copy";
import { Page } from "../components/Layout";
import { skillBySlug } from "../content/skills";

export const Route = createFileRoute("/skills/$name")({
  loader: ({ params }) => {
    const skill = skillBySlug(params.name);
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
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link to="/skills" className="text-sm text-emerald-300 underline">
          ← All skills
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-mono text-2xl font-bold text-slate-50">{name}</h1>
            <p className="mt-1 max-w-xl text-sm text-slate-400">{description}</p>
          </div>
          <CopyButton value={markdown} label="Copy markdown" />
        </div>

        <article className="prose-skill mt-8" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </Page>
  );
}
