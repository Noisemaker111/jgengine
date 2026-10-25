import { type ReactNode, useCallback, useEffect, useState } from "react";
import { GameCursor } from "@jgengine/react/gameCursor";
import { GameFrame } from "@jgengine/react/gameFrame";
import { GameIcon } from "@jgengine/react/gameIcons";
import { useGamePhase } from "@jgengine/react/hooks";
import { CreditsPane } from "@jgengine/react/gameMenuSaves";
import { useMenuNav } from "@jgengine/react/menuNav";
import { useGameContext } from "@jgengine/react/provider";
import { useSaveSlots } from "@jgengine/react/saveSlots";
import { useSettings } from "@jgengine/react/settings";

import { DIFFICULTIES, DIFFICULTY_IDS, setDifficulty, type DifficultyId } from "../../campaign";
import { BEACON_CREDITS } from "../../credits";
import { keepProfile } from "../../thumbs";
import { beginRun, enterRun, pauseRun, resumeRun, withdrawToTitle } from "../../menu";
import {
  KEEP_LABEL,
  beaconSave,
  beaconSlots,
  keepForNewRun,
  loadSlot,
  prepareKeep,
  refreshBeaconSlots,
  saveToSlot,
} from "../../save";
import { currentWaveNumber, session } from "../../session";
import { TOTAL_WAVES } from "../../waves/manifest";
import { Brazier } from "../kit/Brazier";
import { FIRE } from "../theme";
import { KeepDispatch, KeepNiches } from "./KeepNiches";
import { StoneSettings } from "./StoneSettings";

/** Capture-only focus request: a shot declares which verb it wants highlighted. */
export const menuFocus: { id: string | null } = { id: null };

interface Verb {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

/** Roman numerals for the wave the banner is stitched with. */
function roman(value: number): string {
  const table: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let left = Math.max(0, Math.floor(value));
  let out = "";
  for (const [step, glyph] of table) {
    while (left >= step) {
      out += glyph;
      left -= step;
    }
  }
  return out === "" ? "0" : out;
}

/**
 * A column of verbs the keyboard, gamepad and pointer all drive: `useMenuNav` owns focus order and
 * the diamond cursor glides to whichever verb is current. `render` draws one verb in the screen's
 * own material (timber planks on the title, stitched words on the banner).
 */
function VerbList({
  verbs,
  initialId,
  enabled,
  className,
  onPick,
  onBack,
  onActive,
  render,
}: {
  verbs: readonly Verb[];
  initialId: string;
  enabled: boolean;
  className: string;
  onPick: (id: string) => void;
  onBack?: () => void;
  onActive: (id: string | null) => void;
  render: (verb: Verb, itemProps: Record<string, unknown>, pick: () => void) => ReactNode;
}) {
  const nav = useMenuNav({
    ids: verbs.map((verb) => verb.id),
    disabled: verbs.filter((verb) => verb.disabled === true).map((verb) => verb.id),
    initialId,
    enabled,
    onConfirm: onPick,
    ...(onBack === undefined ? {} : { onBack }),
  });
  useEffect(() => onActive(nav.activeId), [nav.activeId, onActive]);
  return (
    <nav className={className} {...nav.containerProps} data-jg-cursor-scope="">
      {verbs.map((verb) =>
        render(verb, { ...nav.itemProps(verb.id) }, () => {
          nav.setActive(verb.id);
          onPick(verb.id);
        }),
      )}
      <GameCursor variant="diamond" color={FIRE} arm={18} gap={10} />
    </nav>
  );
}

/** The New defense pane: a commission on parchment - who takes the wall and which keep they raise. */
function Commission({
  slot,
  commander,
  onCommanderChange,
  difficulty,
  onDifficultyChange,
  onBegin,
}: {
  slot: string | null;
  commander: string;
  onCommanderChange: (name: string) => void;
  difficulty: DifficultyId;
  onDifficultyChange: (difficulty: DifficultyId) => void;
  onBegin: () => void;
}): ReactNode {
  const label = slot === null ? "No keep available" : (KEEP_LABEL[slot] ?? slot);
  return (
    <GameFrame material="paper" cut="torn" depth={12} padding="20px 24px 30px" className="bb-parchment" data-new-keep-pane="">
      <h2 className="bb-ink-title">Commission</h2>
      <label className="bb-ink-field">
        <span>Commander</span>
        <input
          data-new-keep-name=""
          value={commander}
          maxLength={24}
          placeholder="Sign your name"
          onChange={(event) => onCommanderChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onBegin();
            }
          }}
        />
      </label>
      <div className="bb-oath" role="radiogroup" aria-label="Difficulty">
        {DIFFICULTY_IDS.map((id) => (
          <GameFrame
            key={id}
            as="button"
            material={difficulty === id ? "enamel" : "wood"}
            tint={difficulty === id ? "#8a2414" : undefined}
            cut="notch"
            depth={6}
            padding="5px 12px"
            className="bb-small-plank"
            role="radio"
            aria-checked={difficulty === id}
            data-difficulty={id}
            onClick={() => onDifficultyChange(id)}
          >
            {DIFFICULTIES[id].label}
          </GameFrame>
        ))}
      </div>
      <p className="bb-oath-detail">{DIFFICULTIES[difficulty].detail}</p>
      <div className="bb-seals">
        {beaconSlots.list().map((entry) => (
          <span key={entry.id} className="bb-seal" data-keep-choice={entry.id} data-chosen={entry.id === slot ? "" : undefined} data-empty={entry.empty ? "" : undefined}>
            <i aria-hidden />
            {KEEP_LABEL[entry.id] ?? entry.id}
          </span>
        ))}
      </div>
      <GameFrame
        as="button"
        material="enamel"
        tint="#8a2414"
        edge="#3a0e06"
        cut="hex"
        depth={14}
        padding="12px 30px"
        glow="rgba(255,150,60,0.55)"
        className="bb-raise"
        data-new-keep-start=""
        disabled={slot === null}
        onClick={onBegin}
      >
        Raise {label}
      </GameFrame>
    </GameFrame>
  );
}

/** The busy state while a keep document is read or written: the beacon itself, burning. */
function Kindling({ label }: { label: string }) {
  return (
    <div className="bb-kindling" role="status" aria-live="polite">
      <Brazier size={74} />
      <span>{label}</span>
    </div>
  );
}

/** Beacon's front-end: the title is the keep's carved lintel and timber verbs; the pause is a war banner. */
export function BeaconMenu() {
  const ctx = useGameContext();
  const { phase } = useGamePhase();
  const settings = useSettings();
  const keeps = useSaveSlots(beaconSlots);
  const [commander, setCommander] = useState("");
  const [difficulty, setDifficultyChoice] = useState<DifficultyId>("knight");
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const recent = beaconSlots.mostRecent();
  const newKeep = keepForNewRun();

  useEffect(() => {
    setNotice(null);
    if (phase === "menu") void refreshBeaconSlots(ctx);
  }, [phase, ctx]);

  const back = useCallback(() => {
    if (phase === "paused") resumeRun(ctx);
  }, [phase, ctx]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.repeat || armed || settings.isOpen) return;
      if (phase === "playing") {
        event.preventDefault();
        event.stopImmediatePropagation();
        pauseRun(ctx);
        return;
      }
      if (phase !== "menu" && phase !== "paused") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      back();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [armed, back, ctx, phase, settings.isOpen]);

  if (phase !== "menu" && phase !== "paused") return null;

  /** Every document read is real work; the kindling holds the screen while it happens. */
  const whileLoading = async (label: string, work: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await Promise.all([work(), new Promise((resolve) => setTimeout(resolve, 320))]);
    } finally {
      setBusy(null);
    }
  };

  const openSlot = (slot: string) =>
    whileLoading("Opening the keep", async () => {
      await loadSlot(ctx, slot);
      enterRun(ctx);
    });

  const raise = (slot: string) =>
    whileLoading("Raising the keep", async () => {
      keepProfile.commander = commander.trim() === "" ? null : commander.trim();
      await prepareKeep(ctx, slot);
      // A fresh keep's campaign starts at Knight; the oath taken here sets it before the walls rise.
      setDifficulty(ctx, difficulty);
      beginRun(ctx);
    });

  const saveHere = () =>
    whileLoading("Writing the keep", async () => {
      const slot = beaconSave(ctx).slot();
      await saveToSlot(ctx, slot);
      setNotice(`Kept in ${KEEP_LABEL[slot] ?? slot}`);
    });

  const held = keeps.filter((slot) => !slot.empty).length;

  const credits = (
    <GameFrame material="paper" cut="torn" depth={12} padding="18px 22px 28px" className="bb-parchment bb-scroll">
      <CreditsPane sections={BEACON_CREDITS.sections} notice={BEACON_CREDITS.notice} />
    </GameFrame>
  );

  if (phase === "menu") {
    const verbs: Verb[] = [
      { id: "continue", label: "Continue", hint: recent === null ? "No keep held yet" : `${recent.name ?? recent.id}`, disabled: recent === null },
      { id: "new", label: "New Defense", hint: newKeep === null ? "No keep free" : `Raise ${KEEP_LABEL[newKeep] ?? newKeep}`, disabled: newKeep === null },
      { id: "keeps", label: "Keeps", hint: `${held} of ${keeps.length} held` },
      { id: "settings", label: "Settings" },
      { id: "credits", label: "Credits" },
    ];
    const detail = (id: string | null): ReactNode => {
      if (id === "continue") {
        return <KeepDispatch slot={recent} onHold={(slot) => void openSlot(slot)} />;
      }
      if (id === "new") {
        return (
          <Commission
            slot={newKeep}
            commander={commander}
            onCommanderChange={setCommander}
            difficulty={difficulty}
            onDifficultyChange={setDifficultyChoice}
            onBegin={() => {
              if (newKeep !== null) void raise(newKeep);
            }}
          />
        );
      }
      if (id === "keeps") {
        return (
          <KeepNiches
            slots={keeps}
            recentId={recent?.id ?? null}
            enabled={!armed && busy === null}
            onHold={(slot) => void openSlot(slot)}
            onRaise={(slot) => void raise(slot)}
            onBack={() => document.querySelector<HTMLElement>('.bb-planks [aria-current="true"]')?.focus()}
          />
        );
      }
      if (id === "settings") return <StoneSettings onCaptureChange={setArmed} />;
      if (id === "credits") return credits;
      return null;
    };
    const pick = (id: string) => {
      if (id === "continue") {
        if (recent !== null) void openSlot(recent.id);
        return;
      }
      if (id === "new") {
        document.querySelector<HTMLInputElement>("[data-new-keep-name]")?.focus();
        return;
      }
      if (id === "keeps") {
        void refreshBeaconSlots(ctx);
        document.querySelector<HTMLButtonElement>("[data-keep-take]")?.focus();
        return;
      }
      if (id === "settings") {
        document.querySelector<HTMLElement>(".bb-tablet [data-settings-tab]")?.focus();
        return;
      }
      if (id === "credits") document.querySelector<HTMLElement>("[data-credits-scroller]")?.focus();
    };
    const initial = menuFocus.id ?? (recent === null ? "new" : "continue");
    return (
      <div className="bb-menu bb-title" data-title-menu="" aria-label="Beacon Bastion">
        <div className="bb-dusk" aria-hidden />
        <header className="bb-lintel-wrap">
          <Brazier size={78} className="bb-lintel-fire" />
          <GameFrame material="stone" cut="chamfer" depth={20} padding="18px 38px 16px" className="bb-lintel">
            <h1 className="bb-wordmark">
              <span data-text="Beacon">Beacon</span>
              <span data-text="Bastion">Bastion</span>
            </h1>
          </GameFrame>
          <p className="bb-motto">Hold the road the raiders carved.</p>
        </header>
        <VerbList
          verbs={verbs}
          initialId={initial}
          enabled={!armed && busy === null}
          className="bb-planks"
          onPick={pick}
          onActive={setActive}
          render={(verb, itemProps, choose) => (
            <GameFrame
              key={verb.id}
              as="button"
              material="wood"
              cut="notch"
              depth={11}
              padding="9px 22px 10px"
              className="bb-plank"
              disabled={verb.disabled}
              data-active={active === verb.id ? "" : undefined}
              {...itemProps}
              onClick={choose}
            >
              <span className="bb-plank-label" data-text={verb.label}>{verb.label}</span>
              {verb.hint === undefined ? null : <span className="bb-plank-hint">{verb.hint}</span>}
            </GameFrame>
          )}
        />
        <section className="bb-detail" aria-live="polite">
          {detail(active)}
        </section>
        <footer className="bb-chisel">
          <span>
            <b>↑↓</b> choose <b>Enter</b> take
          </span>
        </footer>
        {busy === null ? null : <Kindling label={busy} />}
      </div>
    );
  }

  const wave = Math.min(currentWaveNumber(), TOTAL_WAVES);
  const standing = session.creeps.size;
  const keepName = KEEP_LABEL[beaconSave(ctx).slot()] ?? beaconSave(ctx).slot();
  const verbs: Verb[] = [
    { id: "resume", label: "Hold the line" },
    { id: "save", label: `Save ${keepName}` },
    { id: "settings", label: "Settings" },
    { id: "credits", label: "Credits" },
    { id: "title", label: "Withdraw to title" },
  ];
  const pick = (id: string) => {
    if (id === "resume") resumeRun(ctx);
    else if (id === "save") void saveHere();
    else if (id === "settings") document.querySelector<HTMLElement>(".bb-tablet [data-settings-tab]")?.focus();
    else if (id === "credits") document.querySelector<HTMLElement>("[data-credits-scroller]")?.focus();
    else if (id === "title") void whileLoading("Writing the keep", () => withdrawToTitle(ctx, beaconSave(ctx).slot()));
  };
  return (
    <div className="bb-menu bb-pause" aria-label="Defense paused">
      <div className="bb-dusk" aria-hidden />
      <div className="bb-standard">
        <div className="bb-pole" aria-hidden>
          <i />
          <i />
        </div>
        <div className="bb-banner">
          <div className="bb-cloth">
            <Brazier size={52} className="bb-banner-fire" />
            <h1 className="bb-hold" data-text="Hold">Hold</h1>
            <p className="bb-banner-wave">
              <span>Wave {roman(wave)}</span>
              <span>
                {standing} raider{standing === 1 ? "" : "s"} on the road
              </span>
            </p>
            <VerbList
              verbs={verbs}
              initialId={menuFocus.id ?? "resume"}
              enabled={!armed && busy === null}
              className="bb-stitches"
              onPick={pick}
              onBack={back}
              onActive={setActive}
              render={(verb, itemProps, choose) => (
                <button
                  key={verb.id}
                  type="button"
                  className="bb-stitch"
                  data-quiet={verb.id === "title" ? "" : undefined}
                  data-active={active === verb.id ? "" : undefined}
                  {...itemProps}
                  onClick={choose}
                >
                  {verb.label}
                </button>
              )}
            />
            <p className="bb-banner-note">{notice ?? "Esc to hold the line"}</p>
          </div>
        </div>
      </div>
      <section className="bb-detail bb-pause-detail" aria-live="polite">
        {active === "settings" ? <StoneSettings onCaptureChange={setArmed} /> : active === "credits" ? credits : null}
      </section>
      {busy === null ? null : <Kindling label={busy} />}
    </div>
  );
}

/** Icon used by the HUD's pause sigil; kept beside the menu it opens. */
export function PauseSigil({ onPress }: { onPress: () => void }) {
  return (
    <GameFrame as="button" material="stone" cut="shield" depth={7} padding="8px 10px 14px" className="bb-sigil" aria-label="Pause the defense" onClick={onPress}>
      <GameIcon name="pause" size={20} />
    </GameFrame>
  );
}
