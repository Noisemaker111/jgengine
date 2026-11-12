/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";

import { GAME_IDS, gameCover, gameTitle } from "../../lib/games";
import { BASELINE_GPU, MEASURED_GAME_COUNT, WORST_MENU_CLICK_MS } from "../../lib/siteFacts";
import { BUILT_IN_THE_OPEN, COUNTS_AS_OF, STACK } from "../../lib/story";
import { useInView } from "./useInView";

const PARTS = ["Meter", "Ladder", "Phases", "Schedule", "Slots", "Placement", "Table", "Requirement", "Modifiers", "Inheritance", "Motion track"];
/** README "The parts": a supply drop is these parts combined by the game. */
const SUPPLY_DROP = new Set(["Schedule", "Placement", "Ladder", "Requirement", "Table", "Motion track", "Slots"]);

const AGENT_COMMANDS: readonly [string, string][] = [
  ["jgengine create", "a playable base, with the skills installed"],
  ["jgengine find <words>", "where a concept already lives"],
  ["jgengine has <feature>", "does the engine do this yet?"],
  ["jgengine recipe <name>", "a wired, type-checked snippet"],
  ["jgengine shoot · drive", "screenshot it, play it with keys"],
];

function Point({ n, title, children, proof }: { n: string; title: string; children: ReactNode; proof: ReactNode }) {
  return (
    <li className="point">
      <div className="point-copy">
        <span className="point-n" aria-hidden>
          {n}
        </span>
        <h3>{title}</h3>
        {children}
      </div>
      <div className="point-proof">{proof}</div>
    </li>
  );
}

export function Different() {
  const covers = GAME_IDS.filter((id) => gameCover(id) !== null);
  return (
    <section id="different" className="band" aria-labelledby="different-heading">
      <div className="band-inner">
        <header className="band-head">
          <div>
            <p className="eyebrow">What's different</p>
            <h2 id="different-heading" className="story-h2">
              Five ways it's built differently.
            </h2>
          </div>
          <p className="band-lede">
            jgengine isn't a general-purpose 3D engine or an ECS. It's a framework of game parts on three.js, written so an agent
            can find them, use them and prove they work.
          </p>
        </header>
        <ol className="points">
          <Point
            n="01"
            title="Built for the agent, not around it."
            proof={
              <ul className="term" aria-label="Commands the agent uses">
                {AGENT_COMMANDS.map(([cmd, does]) => (
                  <li key={cmd}>
                    <code>
                      <span aria-hidden>$ </span>
                      {cmd}
                    </code>
                    <span>{does}</span>
                  </li>
                ))}
              </ul>
            }
          >
            <p>
              The skills ship inside the npm packages, so the agent reads the API from <code className="inline-code">node_modules</code>.
              The CLI answers its questions: where something lives, whether the engine already does it, and what the game looks like
              when it runs.
            </p>
          </Point>
          <Point
            n="02"
            title="The games live with the engine."
            proof={
              <ul className="mini-wall" aria-label="Games in the repo">
                {covers.map((id) => (
                  <li key={id}>
                    <a href={`/games/${id}`}>
                      <img src={gameCover(id)!} alt={gameTitle(id)} width={160} height={90} loading="lazy" decoding="async" />
                    </a>
                  </li>
                ))}
              </ul>
            }
          >
            <p>
              {GAME_IDS.length} games sit in <code className="inline-code">games/</code> and run engine source from the same commit.
              An engine change that breaks one gets fixed in the same pull request. A game that needs something new improves the
              engine, and the next game gets it for free.
            </p>
          </Point>
          <Point
            n="03"
            title="Parts, not features."
            proof={
              <div className="parts-proof">
                <ul className="chips" aria-label="The eleven parts">
                  {PARTS.map((part) => (
                    <li key={part} className={SUPPLY_DROP.has(part) ? "is-on" : ""}>
                      {part}
                    </li>
                  ))}
                </ul>
                <p className="parts-eq">
                  <code>spawnSupplyDrop(x, y, "purple")</code> = the lit parts, combined by the game in a few lines.
                </p>
              </div>
            }
          >
            <p>
              A boss fight, a supply drop or a breeding system isn't a closed engine feature. It's a few of eleven small parts the
              game puts together, and every part can be turned off, swapped or retuned.
            </p>
          </Point>
          <Point
            n="04"
            title="Layers a server can trust."
            proof={
              <ul className="files" aria-label="One feature's files">
                <li>
                  <code>map/ping.ts</code>
                  <span className="lang lang-ts">model</span>
                  <span>no UI, no three.js: a server imports it</span>
                </li>
                <li>
                  <code>map/map.view.tsx</code>
                  <span className="lang lang-wasm">view</span>
                  <span>UI on the engine's JSX</span>
                </li>
                <li>
                  <code>map/pingBeacons.draw.tsx</code>
                  <span className="lang lang-js">draw</span>
                  <span>three.js</span>
                </li>
              </ul>
            }
          >
            <p>
              A feature's model, UI and drawing sit side by side in one folder, and the file suffix says which is which.{" "}
              <code className="inline-code">bun run check layers</code> enforces it from the imports in under a second, so
              multiplayer hosts run the same rules as the game without loading a renderer.
            </p>
          </Point>
          <Point
            n="05"
            title="Numbers, or it didn't happen."
            proof={
              <dl className="gauges">
                <div>
                  <dt>16.7 ms</dt>
                  <dd>p95 frame gate, RTX 3070, 1600×900</dd>
                </div>
                <div>
                  <dt>{WORST_MENU_CLICK_MS} ms</dt>
                  <dd>
                    slowest menu click on a cold load, {MEASURED_GAME_COUNT} games, {BASELINE_GPU}
                  </dd>
                </div>
                <div>
                  <dt>99%</dt>
                  <dd>confidence interval perf ab needs before it calls a branch faster or slower</dd>
                </div>
              </dl>
            }
          >
            <p>
              Speed claims come from production runs. A change that makes a game load slower fails its check. When an idea loses
              the measurement, it doesn't ship, and the decision log below says so.
            </p>
          </Point>
        </ol>
      </div>
    </section>
  );
}

/** What runs at each layer and in which language, as an exploded stack. */
export function Stack() {
  const ref = useInView<HTMLOListElement>();
  const LANG: Record<string, string> = { ts: "TypeScript", js: "JavaScript", wasm: "Rust → wasm", mixed: "build targets" };
  return (
    <section id="stack" className="band band-alt" aria-labelledby="stack-heading">
      <div className="band-inner stack-grid">
        <div>
          <p className="eyebrow">The stack</p>
          <h2 id="stack-heading" className="story-h2">
            TypeScript where you work. wasm where it pays.
          </h2>
          <p className="band-lede mt-5">
            three.js stays plain JavaScript and isn't compiled to anything. The engine owns the frame loop around it. Rust shows up
            in two places, both compiled to wasm: Rune, which draws the UI, and the shader translator behind the WebGPU preview.
          </p>
          <ul className="lang-key" aria-label="Languages">
            <li>
              <span className="lang lang-ts">TS</span> TypeScript
            </li>
            <li>
              <span className="lang lang-js">JS</span> JavaScript
            </li>
            <li>
              <span className="lang lang-wasm">wasm</span> Rust compiled to WebAssembly
            </li>
          </ul>
        </div>
        <ol ref={ref} className="slabs">
          {STACK.map((slab, i) => (
            <li key={slab.layer} className="slab" style={{ transitionDelay: `${i * 70}ms` }}>
              <span className={`lang lang-${slab.lang}`} title={LANG[slab.lang]}>
                {slab.lang === "mixed" ? "out" : slab.lang === "wasm" ? "wasm" : slab.lang.toUpperCase()}
              </span>
              <span className="slab-layer">{slab.layer}</span>
              <span className="slab-runs">{slab.runs}</span>
              <span className="slab-note">{slab.note}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function OpenNumbers() {
  return (
    <section className="open-band" data-theme="dark" aria-labelledby="open-numbers-heading">
      <div className="band-inner">
        <p className="eyebrow">Built in the open</p>
        <h2 id="open-numbers-heading" className="story-h2">
          Every commit is public. So is every number on this page.
        </h2>
        <dl className="open-grid">
          {BUILT_IN_THE_OPEN.map((item) => (
            <div key={item.label}>
              <dt>{item.value}</dt>
              <dd>{item.label}</dd>
            </div>
          ))}
        </dl>
        <p className="open-foot">As of {COUNTS_AS_OF}.</p>
      </div>
    </section>
  );
}
