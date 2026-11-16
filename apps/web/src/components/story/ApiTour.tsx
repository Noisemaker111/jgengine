/** @jsxImportSource @jgengine/core/ui/jsx */
import { useState } from "@jgengine/core/ui/jsx";

import { snippet, type SnippetFile } from "../../snippets";
import { CodeBlock } from "../marketing";

interface Step {
  file: SnippetFile;
  name: string;
  title: string;
  body: string;
}

// The same four files the README quotes; check-types compiles them against the engine source.
const STEPS: readonly Step[] = [
  {
    file: "tour-rules.ts",
    name: "rules.ts",
    title: "Rules are plain functions",
    body: "State in, state out, built from the engine's parts: a meter, a ladder, a weighted table. No engine object, so it runs in the browser, on a server and in a test.",
  },
  {
    file: "tour-loop.ts",
    name: "loop.ts",
    title: "State lives in the store",
    body: "One typed slot holds the run. Saves, replays and multiplayer snapshots carry it. A system says when the rules run.",
  },
  {
    file: "tour-hud.tsx",
    name: "GameUI.tsx",
    title: "UI is JSX, not React",
    body: "Selectors read the store and re-render only what changed. Rune, a Rust UI library compiled to wasm, draws it on the game canvas.",
  },
  {
    file: "tour-game.ts",
    name: "game.config.ts",
    title: "One call makes it a game",
    body: "defineGame wires the systems, input and UI. The world, camera, menus, saves and the scene editor come with it.",
  },
];

const LAYERS = [
  { suffix: "waypoints.ts", layer: "model", note: "plain data and functions" },
  { suffix: "waypointMarkers.view.tsx", layer: "view", note: "JSX, no three.js" },
  { suffix: "pingBeacons.draw.tsx", layer: "draw", note: "three.js" },
] as const;

export function ApiTour() {
  const [active, setActive] = useState(0);
  const step = STEPS[active] ?? STEPS[0]!;
  return (
    <section id="api" className="band" aria-labelledby="api-heading">
      <div className="band-inner">
        <header className="lp-head">
          <p className="eyebrow">The API</p>
          <h2 id="api-heading" className="story-h2">
            A whole game in four files.
          </h2>
          <p className="band-lede">
            Walk around, press E to gather, watch energy drain and ranks climb. This is the real API: these files compile against
            the engine on every commit.
          </p>
        </header>
        <div className="tour">
          <ol className="tour-steps" role="tablist" aria-label="The four files">
            {STEPS.map((entry, i) => (
              <li key={entry.file}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={i === active}
                  className={`tour-step ${i === active ? "is-active" : ""}`}
                  onClick={() => setActive(i)}
                >
                  <span className="tour-step-num" aria-hidden>
                    {i + 1}
                  </span>
                  <span className="tour-step-text">
                    <span className="tour-step-title">{entry.title}</span>
                    <span className="tour-step-file">{entry.name}</span>
                    <span className="tour-step-body">{entry.body}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="tour-code" role="tabpanel" aria-label={step.name}>
            <CodeBlock code={snippet(step.file)} filename={step.name} />
          </div>
        </div>
        <div className="tour-layers" aria-label="One folder per feature, three layers by file name">
          <p className="tour-layers-head">
            <span className="font-mono">packages/core/src/map/</span> One folder per feature. The file name says what it may import,
            and a check enforces it, so a server that imports model files never loads UI code or three.js.
          </p>
          <ul>
            {LAYERS.map((entry) => (
              <li key={entry.layer}>
                <span className="tour-layer-tag">{entry.layer}</span>
                <span className="font-mono">{entry.suffix}</span>
                <span className="tour-layer-note">{entry.note}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
