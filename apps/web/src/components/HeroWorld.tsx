import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { HERO_SCENARIOS } from "../lib/heroScenarios";
import type { CityStats } from "../live/cityScene";
import type { HeroWorldHandle } from "../live/heroWorld";
import { ENTRY_PROMPT } from "../lib/site";
import { CopyButton } from "./Copy";
import { Backdrop } from "./Layout";

type TypingPhase = "typing" | "deleting";

const SEED_WORDS = ["neon", "vice", "harbor", "palm", "dusk", "loop", "ridge", "delta", "night", "coast", "ember", "static"];

const LONGEST_FILL = HERO_SCENARIOS.reduce((a, b) => (b.fill.length > a.length ? b.fill : a), "");

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
  const [typing, setTyping] = useState({ index: 0, chars: HERO_SCENARIOS[0]!.fill.length, phase: "typing" as TypingPhase });
  const [origin, setOrigin] = useState("https://jgengine.com");

  // Boot the live world (client-only; three.js is loaded lazily so it never
  // blocks first paint and never runs during SSR).
  useEffect(() => {
    const host = canvasHost.current;
    if (host === null) return;
    let cancelled = false;
    document.documentElement.dataset.jgCapture = "pending";
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
        document.documentElement.dataset.jgCapture = "ready";
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
      data-theme="dark"
      className="relative isolate flex min-h-[calc(100svh-4rem)] flex-col overflow-hidden bg-bg text-fg"
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        worldRef.current?.setPointer(
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          ((event.clientY - bounds.top) / bounds.height) * 2 - 1,
        );
      }}
    >
      {!ready && <Backdrop />}
      <div
        ref={canvasHost}
        aria-hidden
        className="absolute inset-0"
      />
      {/* Scrims keep the copy readable over the moving city. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-bg via-bg/75 to-bg/10 max-lg:via-bg/80 max-lg:to-bg/40" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-6 pt-14 sm:px-6 sm:pt-20 lg:pt-24">
        <div className="max-w-3xl">
          <p className="animate-fade-up inline-flex items-center gap-2.5 rounded-full border border-line bg-bg/70 px-3 py-1.5 font-mono text-[11px] text-muted backdrop-blur-sm sm:text-xs">
            <span className="live-dot" aria-hidden />
            Game SDK for coding agents · pure TypeScript<span className="hidden sm:inline"> · Apache-2.0</span>
          </p>
          <h1
            className="font-display animate-fade-up mt-7 text-[2.65rem] font-bold leading-[0.95] tracking-[-0.035em] text-fg min-[400px]:text-5xl sm:text-7xl lg:text-[5.4rem]"
            style={{ animationDelay: "60ms" }}
          >
            <span className="sr-only">Make a game that … with jgengine.</span>
            <span aria-hidden className="block">Make a game that</span>
            <span aria-hidden className="grid text-accent">
              <span className="invisible col-start-1 row-start-1">{LONGEST_FILL}</span>
              <span className="col-start-1 row-start-1">
                <span className={caret ? "terminal-caret" : ""}>{typed}</span>
              </span>
            </span>
            <span aria-hidden className="block">with jgengine.</span>
          </h1>
          <p
            className="animate-fade-up mt-7 max-w-xl text-pretty text-base leading-relaxed text-muted sm:text-lg"
            style={{ animationDelay: "120ms" }}
          >
            Say that to Claude Code, Cursor, Codex or any coding agent. It reads jgengine's skills, builds the game
            on the SDK from small building blocks, and checks it with tests and screenshots.
          </p>
          <div
            className="animate-fade-up mt-9 flex flex-wrap items-center gap-3"
            style={{ animationDelay: "180ms" }}
          >
            <CopyPromptButton />
            <Link to="/games" className="btn btn-secondary">
              Play the games <span className="arrow" aria-hidden>→</span>
            </Link>
          </div>
        </div>

        {/* Real numbers read back from the generator, not copy. */}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-12">
          <div
            className={`rounded-xl border border-line bg-bg/75 p-3 font-mono text-[11px] leading-relaxed text-muted backdrop-blur-md transition-opacity duration-700 sm:text-xs ${
              stats !== null ? "opacity-100" : "opacity-0"
            }`}
          >
            <p className="text-faint">
              live · this city is <span className="text-fg">generateCity()</span> from @jgengine/core, running in your tab
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="text-faint">seed</span>
              <span className="text-live">{seed}</span>
              <button
                type="button"
                onClick={() => applySeed(rollSeed())}
                className="rounded-md border border-line px-1.5 py-0.5 transition-colors hover:border-line-strong hover:text-fg"
              >
                reroll
              </button>
              <CopyButton value={`${origin}/?seed=${encodeURIComponent(seed)}`} label="share" variant="ghost" className="!px-1.5 !py-0.5 !text-[10px]" />
            </div>
            {stats !== null && (
              <p className="mt-1 text-faint">
                streets <span className="text-fg">{stats.streets}</span> · lots <span className="text-fg">{stats.lots}</span> ·
                junctions <span className="text-fg">{stats.junctions}</span> · loops <span className="text-fg">{stats.loops}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-line bg-bg/75 p-1.5 backdrop-blur-md" role="group" aria-label="Example prompts">
            {HERO_SCENARIOS.map((scenario, i) => (
              <button
                key={scenario.fill}
                type="button"
                title={`…${scenario.fill}`}
                aria-label={`Show: ${scenario.fill}`}
                aria-pressed={i === typing.index}
                onClick={() => jumpTo(i)}
                className="grid h-7 w-7 place-items-center rounded-lg transition-colors hover:bg-fg/10"
              >
                <span className={`block h-2 rounded-full transition-all ${i === typing.index ? "w-4 bg-accent" : "w-2 bg-fg/30"}`} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CopyPromptButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => {
        void navigator.clipboard
          .writeText(ENTRY_PROMPT)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          })
          .catch(() => setCopied(false));
      }}
    >
      <span aria-live="polite">{copied ? "Copied — paste it into your agent" : "Copy the prompt"}</span>
    </button>
  );
}
