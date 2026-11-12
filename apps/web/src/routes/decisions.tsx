/** @jsxImportSource @jgengine/core/ui/jsx */
import { definePage } from "../site/routes";

import { Page, PageHero } from "../components/Layout";
import { DecisionLog } from "../components/story/DecisionLog";
import { Different, OpenNumbers, Stack } from "../components/story/Different";
import { seo } from "../lib/seo";

export const Route = definePage({
  head: () =>
    seo({
      title: "How jgengine is built — the decisions and the numbers",
      description:
        "What makes jgengine different, the stack it runs on, and every decision behind it with its date, the reason given and the numbers to check it.",
      path: "/decisions",
    }),
  component: Decisions,
});

function Decisions() {
  return (
    <Page>
      <PageHero
        eyebrow="How it's built"
        title="Every call, with its reason and its numbers."
        blurb="What makes jgengine different, the stack under it, and the decisions that shaped it, including the experiments that lost the measurement and didn't ship."
      >
        <div className="flex flex-wrap gap-3">
          <a href="#decisions" className="btn btn-primary">
            Read the decisions <span className="arrow" aria-hidden>↓</span>
          </a>
          <a href="#stack" className="btn btn-secondary">
            The stack
          </a>
        </div>
      </PageHero>
      <Different />
      <DecisionLog />
      <Stack />
      <OpenNumbers />
    </Page>
  );
}
