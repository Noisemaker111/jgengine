import { Link, createFileRoute } from "@tanstack/react-router";

import { Page, PageHero, SectionHeading } from "../components/Layout";
import { Blueprints } from "../components/Blueprints";
import { CapabilityBrowser } from "../components/CapabilityBrowser";
import { LiveSpecimen, type SpecimenKey } from "../components/LiveSpecimen";
import { CodeBlock } from "../components/marketing";
import { CAPABILITIES } from "../lib/capabilities";
import { seo } from "../lib/seo";

export const Route = createFileRoute("/capabilities")({
  head: () =>
    seo({
      title: "Capabilities — search everything jgengine ships",
      description:
        "Search every capability jgengine ships across world, gameplay, combat, UI, multiplayer, editor and assets, each with its import line, plus live demos of core functions.",
      path: "/capabilities",
    }),
  component: Capabilities,
});

type LiveSpec = {
  key: SpecimenKey;
  domain: string;
  title: string;
  blurb: string;
  filename: string;
  code: string;
  /** Visible kudos for the open work this specimen's look descends from. */
  credit?: { label: string; url: string };
};

const LIVE_SPECIMENS: LiveSpec[] = [
  {
    key: "wind",
    domain: "world/wind · world/scatter",
    title: "Wind that moves the grass",
    blurb:
      "The blades are placed by scatter() and lean every frame toward their windField sample. The gusts rolling across the meadow are the field's own turbulence, not a baked animation.",
    filename: "meadow.wind.ts",
    code: `import { scatter } from "@jgengine/core/scatter/scatter";
import { windField } from "@jgengine/core/world/wind";
import { scatter } from "@jgengine/core/scatter/scatter";

const blades = scatter({ area: { w: 60, d: 40 }, count: 2600, seed: "meadow" });
const wind = windField({ speed: 2.6, gust: 1.6, turbulence: 0.6 });

// per frame, lean each blade by the real field vector at its point
const [wx, wz] = wind.atPoint(blade.x, blade.z, elapsed);
// ↑ the meadow beside this code runs exactly this call, per blade`,
    credit: {
      label: "meadow look: kudos to achrefelouafi's GrassSystemThreeJS — go star it",
      url: "https://github.com/achrefelouafi/GrassSystemThreeJS",
    },
  },
  {
    key: "catenary",
    domain: "world/catenary",
    title: "A cable that actually hangs",
    blurb:
      "Drag either pole. The cord between the tips is the cosh curve a real cable takes under gravity, not a bezier, solved again from the anchors the moment one moves.",
    filename: "festoon.cable.ts",
    code: `import { catenaryCurve } from "@jgengine/core/world/catenary";

// true cosh catenary between the two live pole tips
const points = catenaryCurve(
  [poleA.x, 6, poleA.z],
  [poleB.x, 6, poleB.z],
  slack, // extra length as a fraction: 0.1 = 10% longer than taut
  56,
);
// drag a pole in the demo → the cable re-solves from these anchors`,
    credit: {
      label: "poles + festoon look: kudos to achrefelouafi's PoleGeneratorThreeJS — go star it",
      url: "https://github.com/achrefelouafi/PoleGeneratorThreeJS",
    },
  },
  {
    key: "terrain",
    domain: "terrain/terrain",
    title: "Terrain from a single seed",
    blurb:
      "Every vertex height is one call to the engine's fractal noise. Change octaves, frequency or ridged, or reseed, and the field rebuilds from the same function a game bakes into its heightfield.",
    filename: "terrain.noise.ts",
    code: `import { fractalNoise } from "@jgengine/core/terrain/terrain";

const cfg = { seed, frequency, octaves, lacunarity: 2, persistence: 0.5, ridged };

// displace every plane vertex by real fractal value noise
for (const v of vertices) {
  v.y = fractalNoise(v.x, v.z, cfg);
}
// the terrain in the demo is this loop, over 91×91 vertices`,
  },
];

function Capabilities() {
  return (
    <Page>
      <PageHero
        eyebrow="Capabilities"
        title={
          <>
            {CAPABILITIES.length} capabilities. <span className="text-accent-text">Search them.</span>
          </>
        }
        blurb="Every entry is something the engine already does, with the line that imports it. The list is generated from the engine source, the same index your coding agent reads, so it is never out of date."
      >
        <div className="flex flex-wrap gap-3">
          <a href="#index" className="btn btn-primary">
            Search the index <span className="arrow" aria-hidden>↓</span>
          </a>
          <Link to="/adopt" className="btn btn-secondary">
            Use one in your own game →
          </Link>
        </div>
      </PageHero>

      <section id="index" aria-label="Search engine capabilities" className="mx-auto max-w-6xl scroll-mt-24 px-4 pb-20 sm:px-6">
        <CapabilityBrowser />
      </section>

      <section aria-labelledby="blueprint-heading" className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <SectionHeading
            eyebrow="From idea to parts"
            title={<span id="blueprint-heading">A big game is mostly parts that exist.</span>}
            blurb="Three pitches, and the capabilities an agent would reach for first. Every block below is a real row in the index above."
          />
          <div className="mt-10">
            <Blueprints />
          </div>
        </div>
      </section>

      <section aria-labelledby="live-heading" className="mx-auto max-w-6xl border-t border-line px-4 py-20 sm:px-6 sm:py-24">
        <SectionHeading
          eyebrow="Try them"
          title={<span id="live-heading">Three functions, live.</span>}
          blurb="Each demo runs one engine function in your browser, next to the code that drives it. The games show the systems working together."
        />
        <div className="mt-12 space-y-20">
          {LIVE_SPECIMENS.map((spec, i) => (
            <section key={spec.key} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
              <div className={`min-w-0 ${i % 2 === 1 ? "lg:order-2" : ""}`}>
                <LiveSpecimen specimen={spec.key} />
                {spec.credit && (
                  <a
                    href={spec.credit.url}
                    className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] text-faint transition-colors hover:text-accent-text"
                  >
                    <span aria-hidden>♥</span>
                    {spec.credit.label}
                    <span aria-hidden>↗</span>
                  </a>
                )}
              </div>
              <div className={`min-w-0 ${i % 2 === 1 ? "lg:order-1" : ""}`}>
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent-text">{spec.domain}</p>
                <h3 className="font-display mt-3 text-balance text-3xl font-bold tracking-tight text-fg">{spec.title}</h3>
                <p className="mt-3 text-pretty leading-relaxed text-muted">{spec.blurb}</p>
                <div className="mt-6">
                  <CodeBlock code={spec.code} filename={spec.filename} tone="good" />
                </div>
              </div>
            </section>
          ))}
        </div>
      </section>

    </Page>
  );
}
