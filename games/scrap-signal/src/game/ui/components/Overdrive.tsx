import { GameIcon } from "@jgengine/react/gameIcons";
import { useCurrency, useEntityStat, useGame, useGameStore, usePlayer } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { useStore } from "@jgengine/react/store";

import { RIFT_REROLL_CORES, riftBoard, riftLeaveSeconds, riftMutatorsFor, riftStore, riftTerminalOpenStore } from "../../rift/rift";
import { MEDAL_REWARDS, RIFT_TIER_COUNT, medalTargets, mutatorById, riftEventId, riftScaling, romanTier } from "../../rift/tiers";
import { Crt, Pips, Plate, SIGNAL, Stamp } from "../fiction/kit";
import { ScrapPanel } from "./ScrapPanel";
import "./overdrive.css";

const MEDAL_COLOR: Record<string, string> = { bronze: "#c98a4b", silver: "#cfd8dc", gold: "#ffcc33" };

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function MedalPip({ medal }: { medal: string | null }) {
  return (
    <span className="od-medal" style={{ color: medal === null ? "#4a463f" : MEDAL_COLOR[medal] }} title={medal ?? "no medal"}>
      <GameIcon name="star" size={14} />
    </span>
  );
}

function MutatorChips({ ids }: { ids: readonly string[] }) {
  if (ids.length === 0) return <span className="od-chip od-chip-clean">Clean signal · no mutators</span>;
  return (
    <>
      {ids.map((id) => {
        const payload = mutatorById(id)?.payload;
        if (payload === undefined) return null;
        return (
          <span key={id} className={`od-chip ${payload.boon === true ? "od-chip-boon" : ""}`} title={payload.blurb}>
            {payload.name}
          </span>
        );
      })}
    </>
  );
}

/** The wreck's overdrive console: every tier, its medal, its best time, and the tuned tier's mutators. */
export function OverdriveTerminal() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const open = useStore(riftTerminalOpenStore);
  const rift = useStore(riftStore);
  const cores = useCurrency("cores");
  const level = Math.round(useEntityStat(userId, "level")?.current ?? 1);
  const board = useGameStore((ctx) => riftBoard(ctx));
  const mutators = useGameStore((ctx) => riftMutatorsFor(ctx, rift.selected), (a, b) => a.join() === b.join());
  if (!open) return null;
  const tier = rift.selected;
  const scaling = riftScaling(tier, level);
  const targets = medalTargets(tier);
  const eventId = riftEventId(tier);
  const tierOpen = board.isOpen(eventId);
  const best = board.best(eventId);
  const next = board.next(eventId);
  return (
    <ScrapPanel wide title="Overdrive console" aside={<span className="od-aside">The Rustflat wreck · medal points {board.points()}</span>} closeLabel="Close" onClose={() => commands.run("rift.close", {})}>
      <div className="od-terminal">
        <Crt className="od-ladder" tint="#0b1a14">
          {Array.from({ length: RIFT_TIER_COUNT }, (_, index) => {
            const t = index + 1;
            const id = riftEventId(t);
            const isOpen = board.isOpen(id);
            const medal = board.medalOf(id);
            return (
              <button
                key={t}
                type="button"
                disabled={!isOpen}
                className={`od-rung ${t === tier ? "on" : ""}`}
                onClick={() => commands.run("rift.select", { tier: t })}
              >
                <span className="od-rung-tier">{romanTier(t)}</span>
                <MedalPip medal={medal} />
                <span className="od-rung-best">{isOpen ? (board.best(id) === null ? "—" : clock(board.best(id)!)) : "locked"}</span>
              </button>
            );
          })}
        </Crt>
        <Plate material="hull" cut="notch" depth={12} rim={SIGNAL.rimHot} padding="12px" className="od-brief">
          <div className="od-brief-head">
            <Stamp tone="amber">Overdrive {romanTier(tier)}</Stamp>
            <span className="od-level">crews at level {scaling.enemyLevel}</span>
          </div>
          <div className="od-gauge">
            <span>Signal pressure</span>
            <Pips value={tier} max={RIFT_TIER_COUNT} count={20} color={tier > 12 ? SIGNAL.red : SIGNAL.amber} />
          </div>
          <div className="od-mutators"><MutatorChips ids={mutators} /></div>
          {mutators.map((id) => {
            const payload = mutatorById(id)?.payload;
            return payload === undefined ? null : <p key={id} className="od-blurb"><b>{payload.name}.</b> {payload.blurb}</p>;
          })}
          <div className="od-targets">
            {(["bronze", "silver", "gold"] as const).map((medal) => (
              <span key={medal} style={{ color: MEDAL_COLOR[medal] }}>
                <GameIcon name="star" size={13} /> {medal === "bronze" ? "clear" : `under ${clock(targets[medal])}`} · +{MEDAL_REWARDS[medal]!.cores} cores
              </span>
            ))}
          </div>
          <div className="od-pay">
            Pays ${scaling.cash} and {scaling.cores} cores · loot level {scaling.lootLevel} · luck ×{scaling.luck.toFixed(1)}
            {tier >= 4 ? " · Foreman drops a legendary" : ""}
          </div>
          <div className="od-best">
            {best === null ? "No clear yet." : `Best ${clock(best)}.`} {next === null ? (best === null ? "" : "Gold held.") : `Next: ${next.medal} under ${clock(next.value)}.`}
          </div>
          <div className="od-actions">
            <HudButton disabled={!tierOpen} onClick={() => commands.run("rift.start", { tier })} className="od-go">
              {tierOpen ? "Overdrive the wreck" : "Locked — earn more medal points"}
            </HudButton>
            {mutators.length > 0 ? (
              <HudButton disabled={cores < RIFT_REROLL_CORES} onClick={() => commands.run("rift.reroll", { tier })} className="od-reroll">
                Re-tune mutators · {RIFT_REROLL_CORES} cores
              </HudButton>
            ) : null}
          </div>
        </Plate>
      </div>
      <p className="od-foot">Clear a tier to open the next · golds are worth 3 points and open tiers ahead · between waves press N to call the next one early</p>
    </ScrapPanel>
  );
}

/** The live run on the rig: tier, clock against the next medal, the wave, its mutators, and its result. */
export function OverdriveCard() {
  const { commands } = useGame();
  const rift = useStore(riftStore);
  const leave = useGameStore((ctx) => riftLeaveSeconds(ctx));
  const board = useGameStore((ctx) => riftBoard(ctx));
  const run = rift.run;
  if (run === null) return null;
  const live = run.phase === "running" || run.phase === "intermission";
  const target = board.next(riftEventId(run.tier));
  const targets = medalTargets(run.tier);
  const pace = run.elapsed <= targets.gold ? "gold" : run.elapsed <= targets.silver ? "silver" : "bronze";
  return (
    <Plate material="carbon" cut="notch" depth={10} rim={live ? SIGNAL.red : SIGNAL.rimHot} padding="8px 10px" className="od-card">
      <div className="od-card-head">
        <Stamp tone={live ? "red" : "amber"}>Overdrive {romanTier(run.tier)}</Stamp>
        <span className="od-clock" style={{ color: live ? MEDAL_COLOR[pace] : undefined }}>{clock(run.elapsed)}</span>
      </div>
      {live ? (
        <>
          <div className="od-card-line">
            <span>Wave {run.wave} / 4 · level {run.enemyLevel}</span>
            <em>{target === null ? "gold held" : `${target.medal} < ${clock(target.value)}`}</em>
          </div>
          <div className="od-mutators small"><MutatorChips ids={run.mutators} /></div>
          {run.phase === "intermission" && run.countdown !== null ? (
            <div className="od-intermission">
              <Pips value={run.countdown} max={run.countdownTotal} count={12} color={SIGNAL.amber} />
              <HudButton onClick={() => commands.run("rift.callWave", {})} className="od-call">Call wave [N] · {Math.ceil(run.countdown)}s</HudButton>
            </div>
          ) : null}
          {leave !== null ? <div className="od-warn">Back to the wreck — {Math.ceil(leave)}s</div> : null}
        </>
      ) : (
        <>
          <div className="od-card-line">
            {run.phase === "won" ? (
              <span>Cleared · {run.medal === null || run.medal === undefined ? "no medal" : `${run.medal} medal`}{run.newBest === true ? " · new best" : ""}</span>
            ) : (
              <span>Lost — {run.reason}</span>
            )}
          </div>
          {run.phase === "won" ? (
            <div className="od-card-line">
              <span>+${run.cash ?? 0} · +{run.cores ?? 0} cores{(run.newMedals ?? []).length > 0 ? ` · first ${(run.newMedals ?? []).join(", ")}` : ""}</span>
            </div>
          ) : null}
          <button type="button" className="ss-log-dismiss" onClick={() => commands.run("rift.dismiss", {})}>Dismiss</button>
        </>
      )}
    </Plate>
  );
}
