import { createFileRoute } from "@tanstack/react-router";

import { CopyButton } from "../components/Copy";
import { Page, PageHero } from "../components/Layout";
import { COOKBOOK } from "../lib/cookbook";
import { seo } from "../lib/seo";

export const Route = createFileRoute("/cookbook")({
  head: () =>
    seo({
      title: "Cookbook — thirty common game features in a few lines",
      description:
        "A supply drop, a boss with phases, dog breeding, a shop and twenty-six more, each built from the engine's parts in a few lines. Every recipe is a test, so it runs.",
      path: "/cookbook",
    }),
  component: Cookbook,
});

function Cookbook() {
  return (
    <Page>
      <PageHero
        eyebrow="Cookbook"
        title="Thirty features. A few lines each."
        blurb="Each recipe is a passing test that builds a common feature from the engine's parts. The code below is the test body, copied by the build, so it cannot drift."
      />
      <div className="mx-auto w-full max-w-4xl space-y-10 px-4 pb-20 sm:px-6">
        {COOKBOOK.map((recipe) => (
          <section key={recipe.name} id={recipe.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}>
            <h2 className="font-display text-2xl font-extrabold text-fg">{recipe.name}</h2>
            <p className="mt-2 text-muted">{recipe.sentence}</p>
            <div className="card mt-4 overflow-hidden">
              <div className="flex justify-end border-b border-line px-2 py-1">
                <CopyButton value={recipe.code} variant="solid" />
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-fg">
                <code>{recipe.code}</code>
              </pre>
            </div>
          </section>
        ))}
      </div>
    </Page>
  );
}
