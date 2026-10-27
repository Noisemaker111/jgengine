import { Link, createFileRoute } from "@tanstack/react-router";

import { Blueprints } from "../components/Blueprints";
import { CapabilityBrowser } from "../components/CapabilityBrowser";
import { Page, PageHero, SectionHeading } from "../components/Layout";
import { CAPABILITIES } from "../lib/capabilities";
import { seo } from "../lib/seo";
import { REPO_URL } from "../lib/site";

export const Route = createFileRoute("/docs")({
  head: () =>
    seo({
      title: "Docs — every jgengine capability with its import line",
      description:
        "Search every capability jgengine ships across world, gameplay, combat, UI, multiplayer, editor and assets, each with its import line, plus the guides coding agents read.",
      path: "/docs",
    }),
  component: Docs,
});

const GUIDES: readonly { label: string; href: string; does: string }[] = [
  { label: "llms-full.txt", href: "/llms-full.txt", does: "The full guide for coding agents: quickstart, commands, packages, how to check work." },
  { label: "agents.md", href: "/agents.md", does: "The rules a coding agent follows when it builds on the engine." },
  { label: "Skills", href: `${REPO_URL}/tree/main/.claude/skills`, does: "What create installs into a project, one folder per area." },
  { label: "Changelog", href: `${REPO_URL}/blob/main/CHANGELOG.md`, does: "What changed in each release, and how to move to it." },
];

function Docs() {
  return (
    <Page>
      <PageHero
        eyebrow="Docs"
        title="Everything the engine ships"
        blurb={`All ${CAPABILITIES.length} capabilities, each with the line that imports it. The list is built from the engine source, the same list your coding agent reads.`}
      >
        <div className="flex flex-wrap gap-3">
          <a href="#capabilities" className="btn btn-primary">
            Search capabilities
          </a>
          <a href="#examples" className="btn btn-secondary">
            Game ideas as parts
          </a>
          <a href="#guides" className="btn btn-secondary">
            Agent guides
          </a>
        </div>
      </PageHero>

      <section id="capabilities" aria-label="Search engine capabilities" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-12 sm:px-6">
        <CapabilityBrowser />
        <p className="mt-6 text-sm text-muted">
          Already have a game?{" "}
          <Link to="/adopt" className="link">
            Use one part in it
          </Link>
          .
        </p>
      </section>

      <section id="examples" className="scroll-mt-20 border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
          <SectionHeading
            eyebrow="Examples"
            title="Game ideas as engine parts"
            blurb="Three game ideas, and the capabilities a coding agent would use first. Each block is a real entry in the list above."
          />
          <div className="mt-8">
            <Blueprints />
          </div>
        </div>
      </section>

      <section id="guides" className="scroll-mt-20 border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
          <SectionHeading eyebrow="Guides" title="What coding agents read" />
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {GUIDES.map((guide) => (
              <li key={guide.label}>
                <a href={guide.href} className="card card-link block p-5">
                  <span className="font-mono text-sm font-semibold text-accent-text">{guide.label}</span>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{guide.does}</p>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </Page>
  );
}
