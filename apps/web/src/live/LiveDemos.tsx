import { SectionHeading } from "../components/Layout";
import type { DemoKey } from "./demoParts";
import { TracedDemo } from "./TracedDemo";

type LiveDemo = {
  key: DemoKey;
  domain: string;
  title: string;
  blurb: string;
  /** Credit for the open work this demo's look comes from. */
  credit?: { label: string; url: string };
};

const LIVE_DEMOS: LiveDemo[] = [
  {
    key: "grass",
    domain: "grass",
    title: "Grass with forty knobs",
    blurb:
      "The engine's own grass renderer, the one every game draws with. Pick a preset or move a knob and the field is rebuilt from the same settings a game or the scene editor writes.",
    credit: {
      label: "grass look: thanks to achrefelouafi's GrassSystemThreeJS",
      url: "https://github.com/achrefelouafi/GrassSystemThreeJS",
    },
  },
  {
    key: "catenary",
    domain: "world/catenary",
    title: "A cable that really hangs",
    blurb:
      "Drag either pole. The cord takes the curve a real cable takes under gravity, solved again from the pole tips as soon as one moves.",
    credit: {
      label: "poles and lights look: thanks to achrefelouafi's PoleGeneratorThreeJS",
      url: "https://github.com/achrefelouafi/PoleGeneratorThreeJS",
    },
  },
  {
    key: "terrain",
    domain: "terrain",
    title: "Terrain from one seed",
    blurb:
      "Every height is one call to the engine's noise. Change the octaves, the frequency or ridged, or reseed, and the hills rebuild from the same function a game uses.",
  },
];

/** Engine functions running live in the page, each above the code that drives it. */
export function LiveDemos() {
  return (
    <section id="functions" aria-labelledby="functions-heading" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-14">
        <SectionHeading
          eyebrow="Engine functions"
          title={<span id="functions-heading">Three engine parts, live</span>}
          blurb="Each demo runs one part of the engine in your browser. Move a control and the code under it changes with it."
        />
        <div className="mt-8 space-y-14">
          {LIVE_DEMOS.map((demo) => (
            <div key={demo.key} className="min-w-0">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent-text">{demo.domain}</p>
              <h3 className="font-display mt-2 text-balance text-2xl font-bold tracking-tight text-fg">{demo.title}</h3>
              <p className="mt-2 mb-4 max-w-3xl text-pretty leading-relaxed text-muted">{demo.blurb}</p>
              <TracedDemo demo={demo.key} />
              {demo.credit && (
                <a
                  href={demo.credit.url}
                  className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] text-faint transition-colors hover:text-accent-text"
                >
                  <span aria-hidden>♥</span>
                  {demo.credit.label}
                  <span aria-hidden>↗</span>
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
