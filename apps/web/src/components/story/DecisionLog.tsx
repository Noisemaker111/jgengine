/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";

import { BENCH_MAX_FPS, DECISIONS, NATIVE_BENCH, type BenchRow, type Decision } from "../../lib/story";
import { useInView } from "./useInView";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-07" → "7 Nov". */
function shortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1]}`;
}

function outcomeOf(decision: Decision): string {
  if (decision.outcome !== undefined) return decision.outcome;
  return decision.kind === "remove" ? "removed" : "shipped";
}

/** The project's history as a commit graph: shipped decisions on the main line, experiments on branches. */
export function DecisionLog() {
  const extras: Record<string, ReactNode> = { "native-rust": <Benchmark /> };
  return (
    <section id="decisions" className="log-band" aria-labelledby="decisions-heading">
      <div className="log-inner">
        <header className="log-head">
          <p className="eyebrow">The decisions</p>
          <h2 id="decisions-heading" className="story-h2">
            {DECISIONS.length} calls that made it what it is.
          </h2>
          <p className="band-lede">
            Each one with its date, the reason given at the time, the numbers and a link to check them. Some are things we took
            out. Two are experiments we built, measured and didn't make the default.
          </p>
          <ul className="log-legend" aria-label="Legend">
            <li>
              <span className="node node-ship" aria-hidden /> shipped
            </li>
            <li>
              <span className="node node-remove" aria-hidden /> removed
            </li>
            <li>
              <span className="node node-experiment" aria-hidden /> experiment
            </li>
          </ul>
        </header>
        <ol className="log">
          {DECISIONS.map((decision) => (
            <li key={decision.id} id={decision.id} className={`commit commit-${decision.kind}`}>
              <div className="commit-rail" aria-hidden>
                <span className={`node node-${decision.kind}`} />
              </div>
              <time className="commit-date" dateTime={decision.date}>
                {shortDate(decision.date)}
              </time>
              <article className="commit-card">
                <p className="commit-meta">
                  <span className={`commit-tag tag-${decision.kind}`}>{outcomeOf(decision)}</span>
                  <a href={decision.source.href} className="commit-source">
                    {decision.source.label} ↗
                  </a>
                </p>
                <h3 className="commit-title">{decision.title}</h3>
                <p className="commit-did">{decision.did}</p>
                {decision.why !== undefined && (
                  <p className="commit-why">
                    <span>Why</span> {decision.why}
                  </p>
                )}
                {decision.numbers !== undefined && (
                  <dl className="commit-numbers">
                    {decision.numbers.map((number) => (
                      <div key={number.label}>
                        <dt>{number.value}</dt>
                        <dd>{number.label}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {extras[decision.id]}
              </article>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function range(values: readonly number[], digits = 0): string {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return lo === hi ? lo.toFixed(digits) : `${lo.toFixed(digits)}–${hi.toFixed(digits)}`;
}

function BenchBar({ row }: { row: BenchRow }) {
  const lo = Math.min(...row.fps);
  const hi = Math.max(...row.fps);
  return (
    <li className={`bench-row bench-${row.kind}`}>
      <span className="bench-label">
        <strong>{row.label}</strong> {row.what}
      </span>
      <span className="bench-track" aria-hidden>
        <span className="bench-bar" style={{ width: `${(lo / BENCH_MAX_FPS) * 100}%` }} />
        {hi > lo && (
          <span className="bench-spread" style={{ left: `${(lo / BENCH_MAX_FPS) * 100}%`, width: `${((hi - lo) / BENCH_MAX_FPS) * 100}%` }} />
        )}
      </span>
      <span className="bench-value">
        {range(row.fps)} <small>fps</small>
        <em>{range(row.p50, 1)} ms</em>
      </span>
    </li>
  );
}

/** native/README.md's results as bars: fps over each run, a range when it ran twice. */
function Benchmark() {
  const ref = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className="bench" role="figure" aria-label="Native Rust experiment results, frames per second">
      {NATIVE_BENCH.map((game) => (
        <div key={game.id} className="bench-game">
          <p className="bench-game-head">
            <strong>{game.game}</strong> {game.verdict}
          </p>
          <ul>
            {game.rows.map((row) => (
              <BenchBar key={`${row.label}-${row.what}`} row={row} />
            ))}
          </ul>
        </div>
      ))}
      <p className="bench-foot">
        RTX 3070, 1920×1080, uncapped, 8 s of each game's perf walk. Bars are fps; a lighter end is the spread between two runs.
        The ms figure is the median frame. Full table and image diffs in{" "}
        <a href="https://github.com/Noisemaker111/jgengine/blob/beta/native/README.md" className="link">
          native/README.md
        </a>
        .
      </p>
    </div>
  );
}
