import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { HERO_SCENARIOS } from "../lib/heroScenarios";
import type { CityStats } from "../live/cityScene";
import type { HeroWorldHandle } from "../live/heroWorld";
import { CopyButton } from "./Copy";
import { Backdrop } from "./Layout";

type TypingPhase = "typing" | "deleting";

const SEED_WORDS = ["neon", "vice", "harbor", "palm", "dusk", "loop", "ridge", "delta", "night", "coast", "ember", "static"];

function rollSeed(): string {
  const a = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)];
  const b = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)];
  return `${a}-${b}-${Math.floor(Math.random() * 1000)}`;
}

export function HeroWorld() {
  const canvasHost = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HeroWorldHandle | null>(null);
  const seedRef = useRef("neon-harbor-042");
  const [seed, setSeed] = useState(seedRef.current);
  const [stats, setStats] = useState<CityStats | null>(null);
  const [ready, setReady] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [typing, setTyping] = useState({ index: 0, chars: 0, phase: "typing" as TypingPhase });
  const [origin, setOrigin] = useState("https://jgengine.com");

  // Boot the live world (client-only; three.js is loaded lazily so it never
  // blocks first paint and never runs during SSR).
  useEffect(() => {
    const host = canvasHost.current;
    if (host === null) return;
    let cancelled = false;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduced(prefersReduced);
    setOrigin(window.location.origin);
    const urlSeed = new URLSearchParams(window.location.search).get("seed");
    if (urlSeed !== null && urlSeed.length > 0 && urlSeed.length <= 64) {
      seedRef.current = urlSeed;
      setSeed(urlSeed);
    }
    if (prefersReduced) {
      setTyping({ index: 0, chars: HERO_SCENARIOS[0]!.fill.length, phase: "typing" });
    }
    void import("../live/heroWorld")
      .then(({ createHeroWorld }) => {
        if (cancelled) return;
        const world = createHeroWorld(host, {
          onStats: (cityStats, usedSeed) => {
            setStats(cityStats);
            setSeed(usedSeed);
          },
        });
        worldRef.current = world;
        world.setScenario(0, seedRef.current);
        setReady(true);
      })
      .catch(() => {
        // No WebGL / import failure: the static backdrop stays, the page still works.
      });
    return () => {
      cancelled = true;
      worldRef.current?.dispose();
      worldRef.current = null;
    };
  }, []);

  // Sentence typing loop. Each new pitch regenerates the world behind it, so
  // the city grows while its description is still being typed.
  useEffect(() => {
    if (!ready || reduced) return;
    const fill = HERO_SCENARIOS[typing.index]!.fill;
    let delay: number;
    let advance: () => void;
    if (typing.phase === "typing") {
      if (typing.chars < fill.length) {
        delay = typing.chars === 0 ? 420 : 26 + Math.random() * 36;
        advance = () => setTyping((t) => ({ ...t, chars: t.chars + 1 }));
      } else {
        delay = 8200;
        advance = () => setTyping((t) => ({ ...t, phase: "deleting" }));
      }
    } else if (typing.chars > 0) {
      delay = 15;
      advance = () => setTyping((t) => ({ ...t, chars: Math.max(0, t.chars - 2) }));
    } else {
      delay = 240;
      advance = () => {
        const next = (typing.index + 1) % HERO_SCENARIOS.length;
        worldRef.current?.setScenario(next, seedRef.current);
        setTyping({ index: next, chars: 0, phase: "typing" });
      };
    }
    const timer = window.setTimeout(advance, delay);
    return () => window.clearTimeout(timer);
  }, [typing, ready, reduced]);

  const applySeed = (next: string) => {
    seedRef.current = next;
    setSeed(next);
    window.history.replaceState(null, "", `?seed=${encodeURIComponent(next)}`);
    worldRef.current?.setScenario(typing.index, next);
  };

  const jumpTo = (index: number) => {
    worldRef.current?.setScenario(index, seedRef.current);
    setTyping({ index, chars: reduced ? HERO_SCENARIOS[index]!.fill.length : 0, phase: "typing" });
  };

  const fill = HERO_SCENARIOS[typing.index]!.fill;
  const typed = fill.slice(0, typing.chars);
  const caret = !reduced && (typing.phase === "deleting" || typing.chars < fill.length);

  return (
    <section
      className="relative flex min-h-svh flex-col overflow-hidden"
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        worldRef.current?.setPointer(
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          ((event.clientY - bounds.top) / bounds.height) * 2 - 1,
        );
      }}
    >
      {!ready && <Backdrop variant="hero" />}
      <div
        ref={canvasHost}
        aria-hidden
        className={`absolute inset-0 transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`}
      />
      {/* Readability scrims: ink at the top for the header, ink at the bottom into the page. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-ink via-ink/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-ink to-transparent" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-6 pt-20 sm:px-6 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="animate-fade-up mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-ink/70 px-3.5 py-1.5 text-xs font-medium text-emerald-300 backdrop-blur-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            This skyline is being generated in your tab by @jgengine/core
          </p>
          <h1
            className="animate-fade-up mt-6 text-balance text-4xl font-bold leading-[1.08] tracking-tighter text-slate-50 [text-shadow:0_2px_24px_rgba(2,3,8,0.9)] sm:text-6xl"
            style={{ animationDelay: "60ms" }}
          >
            Make a game that{" "}
            <span className={`text-gradient ${caret ? "terminal-caret" : ""}`}>{typed}</span>
            {typing.chars === 0 && !caret ? <span className="text-slate-600">…</span> : null} with
            jgengine.
          </h1>
          <p
            className="animate-fade-up mx-auto mt-5 max-w-2xl text-pretty text-base text-slate-300 [text-shadow:0_1px_16px_rgba(2,3,8,0.9)] sm:text-lg"
            style={{ animationDelay: "120ms" }}
          >
            That sentence is the whole interface — a coding agent builds the rest on a
            pure-TypeScript SDK. Each pitch you see regrows the city below from one seed, live,
            using the same generators a shipped game runs.
          </p>
          <div
            className="animate-fade-up mt-8 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: "180ms" }}
          >
            <Link
              to="/playground"
              className="group rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-300 px-6 py-3 text-sm font-semibold text-ink-deep shadow-[0_0_36px_-8px_rgba(52,211,153,0.7)] transition hover:shadow-[0_0_48px_-8px_rgba(52,211,153,0.9)]"
            >
              Drive the generator yourself
              <span className="ml-2 inline-block transition-transform group-hover:translate-x-0.5" aria-hidden>
                →
              </span>
            </Link>
            <Link
              to="/capabilities"
              className="rounded-xl border border-white/12 bg-ink/60 px-6 py-3 text-sm font-semibold text-slate-200 backdrop-blur-sm transition hover:border-emerald-400/40 hover:bg-emerald-400/[0.06]"
            >
              See every system live
            </Link>
          </div>
        </div>

        {/* World HUD: real numbers read back from the generator, not copy. */}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-10">
          <div
            className={`pointer-events-auto rounded-xl border border-white/[0.08] bg-ink/70 p-3.5 font-mono text-[11px] leading-relaxed text-slate-400 backdrop-blur-md transition-opacity duration-700 sm:text-xs ${
              stats !== null ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-slate-600">seed</span>
              <span className="text-emerald-300">{seed}</span>
              <button
                type="button"
                onClick={() => applySeed(rollSeed())}
                title="Regrow from a new seed"
                className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 transition hover:border-emerald-400/40 hover:text-emerald-300"
              >
                reroll
              </button>
              <CopyButton value={`${origin}/?seed=${encodeURIComponent(seed)}`} label="share" className="!px-2 !py-0.5 !text-[10px]" />
            </div>
            {stats !== null && (
              <p className="mt-1.5 text-slate-500">
                streets <span className="text-slate-300">{stats.streets}</span> · lots{" "}
                <span className="text-slate-300">{stats.lots}</span> · junctions{" "}
                <span className="text-slate-300">{stats.junctions}</span> · loops{" "}
                <span className="text-slate-300">{stats.loops}</span> — deterministic: same seed,
                same city, every machine
              </p>
            )}
          </div>
          <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/[0.08] bg-ink/70 px-3 py-2.5 backdrop-blur-md">
            {HERO_SCENARIOS.map((scenario, i) => (
              <button
                key={scenario.fill}
                type="button"
                title={`…${scenario.fill}`}
                aria-label={`Switch world: ${scenario.fill}`}
                onClick={() => jumpTo(i)}
                className={`h-2.5 w-2.5 rounded-full transition ${
                  i === typing.index ? "scale-125 bg-emerald-300" : "bg-white/20 hover:bg-white/45"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
