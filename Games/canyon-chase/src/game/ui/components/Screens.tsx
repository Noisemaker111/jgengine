import type { ReactNode } from "react";
import { useGame, SettingsTrigger } from "@jgengine/react";
import { TRUCK_SEEDS } from "../../run/truckSchedule";
import type { RunResult } from "../../run/runState";

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export interface StartScreenProps {
  readonly selectedSeedId: string;
}

export function StartScreen({ selectedSeedId }: StartScreenProps) {
  const { commands } = useGame();
  return (
    <div data-jg-menu className="relative flex h-full min-h-0 items-end overflow-hidden bg-[#120d12] text-[#f4e6d2] sm:items-center">
      <SettingsTrigger className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-[#ffc857]/35 text-[#ffc857] transition-colors hover:bg-[#ffc857]/15" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_24%,rgba(255,200,87,0.20),transparent_27%),linear-gradient(155deg,#21131d_0%,#090709_58%,#24120c_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-[48%] opacity-50 [clip-path:polygon(0_48%,18%_22%,36%_42%,55%_8%,72%_30%,100%_0,100%_100%,0_100%)] bg-[#5f2b1c]" />
      <div className="absolute inset-x-0 bottom-0 h-[34%] [clip-path:polygon(0_35%,17%_12%,38%_46%,58%_16%,78%_45%,100%_20%,100%_100%,0_100%)] bg-[#170d0b]" />

      <div className="relative z-10 grid w-full grid-cols-1 gap-8 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-16 sm:px-10 lg:grid-cols-[1fr_26rem] lg:items-center lg:px-16">
        <section className="max-w-3xl">
          <p className="text-[10px] uppercase tracking-[0.48em] text-[#ffc857]/75">Border pursuit dispatch</p>
          <h1 className="mt-3 text-5xl font-black uppercase leading-[0.84] tracking-[-0.04em] text-[#ffc857] sm:text-7xl">
            Canyon
            <span className="block pl-[0.6em] text-[#f4e6d2]">Chase</span>
          </h1>
          <p className="mt-6 max-w-xl border-l-2 border-[#ffc857] pl-4 text-sm leading-6 text-[#f4e6d2]/72 sm:text-base">
            The rock lies. The survey does not. Cut the smuggler off before the border arch and trust the route when the canyon tries to fool you.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <button
              type="button"
              autoFocus
              onClick={() => commands.run("startRun", {})}
              className="group relative min-h-14 overflow-hidden border-2 border-[#ffc857] bg-[#ffc857] px-8 py-3 text-sm font-black uppercase tracking-[0.22em] text-[#21131d] shadow-[0_16px_50px_rgba(0,0,0,0.45)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#fff0b8] active:translate-y-0 active:scale-[0.98]"
            >
              <span className="mr-4 inline-block transition-transform group-hover:translate-x-1">Ignition</span>
              <span className="font-mono text-[10px] opacity-60">ENTER</span>
            </button>
            <span className="text-[9px] uppercase tracking-[0.28em] text-[#f4e6d2]/42">Drive · brake · survey · handbrake</span>
          </div>
        </section>

        <aside className="border-l border-[#ffc857]/35 pl-6">
          <p className="text-[10px] uppercase tracking-[0.38em] text-[#ffc857]/65">Select pursuit file</p>
          <div className="mt-4 space-y-2">
            {TRUCK_SEEDS.map((seed, index) => {
              const selected = selectedSeedId === seed.id;
              return (
                <button
                  key={seed.id}
                  type="button"
                  onClick={() => commands.run("selectSeed", { seedId: seed.id })}
                  className={`group grid min-h-14 w-full grid-cols-[2.25rem_1fr_auto] items-center border-b px-0 py-2 text-left transition ${
                    selected
                      ? "border-[#ffc857] text-[#ffc857]"
                      : "border-[#f4e6d2]/15 text-[#f4e6d2]/55 hover:border-[#ffc857]/55 hover:text-[#f4e6d2]"
                  }`}
                >
                  <span className="font-mono text-[10px] opacity-45">0{index + 1}</span>
                  <span className="text-sm font-black uppercase tracking-[0.16em]">{seed.label}</span>
                  <span className={`h-2 w-2 rotate-45 border ${selected ? "border-[#ffc857] bg-[#ffc857]" : "border-current"}`} />
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}

export interface WinScreenProps {
  readonly result: RunResult;
}

export function WinScreen({ result }: WinScreenProps) {
  const { commands } = useGame();
  return (
    <ResultScreen tone="success" eyebrow="Pursuit closed" title="Got Him" action={() => commands.run("restart", {})}>
      <p>Border stays shut tonight. The ring closed in the riverbed straight.</p>
      <div className="mt-7 grid grid-cols-3 gap-px bg-[#ffc857]/20">
        <Stat label="Time" value={formatTime(result.timeSeconds)} />
        <Stat label="Routes trusted" value={`${result.shortcutsTrusted}/6`} />
        <Stat label="Surges" value={String(result.surgesTriggered)} />
      </div>
    </ResultScreen>
  );
}

export interface LoseScreenProps {
  readonly result: RunResult;
}

export function LoseScreen({ result }: LoseScreenProps) {
  const { commands } = useGame();
  return (
    <ResultScreen tone="failure" eyebrow="Border breach" title="He’s Through" action={() => commands.run("restart", {})}>
      <p>
        Final gap: {Math.round(result.finalGapMeters)}m. {result.missedShortcutLabel !== null
          ? `The survey called ${result.missedShortcutLabel}, but the route was ignored.`
          : "You trusted every route the survey gave you."}
      </p>
    </ResultScreen>
  );
}

function ResultScreen({
  tone,
  eyebrow,
  title,
  action,
  children,
}: {
  tone: "success" | "failure";
  eyebrow: string;
  title: string;
  action: () => void;
  children: ReactNode;
}) {
  const accent = tone === "success" ? "#73e39b" : "#ff657d";
  return (
    <div className="relative flex h-full items-center overflow-hidden bg-[#0d090d] px-6 py-10 text-[#f4e6d2] sm:px-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_40%,rgba(255,200,87,0.10),transparent_30%),linear-gradient(135deg,#21131d,#080608)]" />
      <div className="relative z-10 max-w-2xl border-l-2 pl-6" style={{ borderColor: accent }}>
        <p className="text-[10px] uppercase tracking-[0.42em]" style={{ color: accent }}>{eyebrow}</p>
        <h2 className="mt-3 text-5xl font-black uppercase leading-none tracking-[-0.04em] sm:text-7xl" style={{ color: accent }}>{title}</h2>
        <div className="mt-5 max-w-xl text-sm leading-6 text-[#f4e6d2]/70">{children}</div>
        <button
          type="button"
          autoFocus
          onClick={action}
          className="mt-8 min-h-12 border px-7 py-3 text-xs font-black uppercase tracking-[0.24em] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 active:translate-y-0 active:scale-[0.98]"
          style={{ borderColor: accent, color: accent, backgroundColor: `${accent}18` }}
        >
          Run it again · R
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#100b10] px-3 py-4 text-left">
      <span className="block text-[8px] uppercase tracking-[0.22em] text-[#f4e6d2]/38">{label}</span>
      <span className="mt-1 block text-lg font-black text-[#f4e6d2]">{value}</span>
    </div>
  );
}
