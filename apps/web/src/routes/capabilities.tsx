import { Link, createFileRoute } from "@tanstack/react-router";

import { Page, PageHero, SectionHeading } from "../components/Layout";
import { CapabilityBrowser } from "../components/CapabilityBrowser";
import { LiveSpecimen, type SpecimenKey } from "../components/LiveSpecimen";
import { CodeBlock } from "../components/marketing";
import { CAPABILITIES } from "../lib/capabilities";
import { seo } from "../lib/seo";

export const Route = createFileRoute("/capabilities")({
  head: () =>
    seo({
      title: "Capabilities — every jgengine building block, searchable",
      description:
        "Search the primitives jgengine ships across world, gameplay, combat, UI, multiplayer, editor and assets, each with its import line, plus live core demos.",
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
      "The blades are placed by the real scatter() and lean, every frame, toward the real windField sample. The gust fronts rippling across the meadow are the field's own turbulence — no shader fakery, no baked animation.",
    filename: "meadow.wind.ts",
    code: `import { windField } from "@jgengine/core/world/wind";
import { scatter } from "@jgengine/core/world/scatter";

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
      "Drag either pole. The festoon cord between the tips is the true hyperbolic cosh curve a uniform cable takes under gravity — not a bezier approximation — re-solved from the live anchor positions the moment you move one.",
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
    domain: "world/terrain",
    title: "Terrain from a single seed",
    blurb:
      "Every vertex height is one call into the core value-noise fractal. Turn octaves, frequency, and ridged, or reseed, and the whole field is rebuilt in place from the same function a shipped game bakes into its heightfield.",
    filename: "terrain.noise.ts",
    code: `import { fractalNoise } from "@jgengine/core/world/terrain";

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
            {CAPABILITIES.length} building blocks. <span className="text-accent">Search them.</span>
          </>
        }
        blurb="Every row below comes from the capability indexes the skills ship with: the thing a game needs, and the primitive that already does it. Agents read the same files. Above them, three core functions running live."
      >
        <div className="flex flex-wrap gap-3">
          <a href="#index" className="btn btn-primary">
            Browse the index <span className="arrow" aria-hidden>↓</span>
          </a>
          <Link to="/adopt" className="btn btn-secondary">
            Use one in your own game
          </Link>
        </div>
      </PageHero>

      <section aria-labelledby="live-heading" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <SectionHeading
          eyebrow="Live specimens"
          title={<span id="live-heading">Running in this tab, not recorded.</span>}
          blurb="Each canvas is a zero-dependency @jgengine/core function feeding three.js, the same way @jgengine/shell uses core in a game. The code beside it is what the canvas runs. Drag the dials."
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

      <section id="index" aria-labelledby="index-heading" className="scroll-mt-20 border-t border-line bg-bg">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <SectionHeading
            eyebrow="The index"
            title={<span id="index-heading">Reach for these before hand-rolling.</span>}
            blurb={
              <>
                Generated from source by <code className="font-mono text-[0.9em] text-fg">bun run gen:capabilities</code>{" "}
                and shipped inside every package as <code className="font-mono text-[0.9em] text-fg">skills/*/capabilities.md</code>.
                Opt-in: a game only imports what it uses.
              </>
            }
          />
          <div className="mt-10">
            <CapabilityBrowser />
          </div>
        </div>
      </section>
    </Page>
  );
}
