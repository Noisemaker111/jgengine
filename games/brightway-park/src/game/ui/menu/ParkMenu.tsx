import { type ReactNode, useEffect, useState } from "react";
import { ContinuePane, CreditsPane, SaveSlotsPane } from "@jgengine/react/gameMenuSaves";
import { GameMenu, GamePauseMenu } from "@jgengine/react/gameMenu";
import { useGame, useGameClock, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useSaveSlots } from "@jgengine/react/saveSlots";
import { useSettings } from "@jgengine/react/settings";
import { KitButton } from "@jgengine/react/uiKitRoot";

import { captureParkThumb, parkProfile } from "../../parkProfile";
import { parkSlots, refreshParkSlot } from "../../parkSlot";
import { SCENARIOS } from "../../scenarios";
import { session } from "../../session";
import { resultOpen } from "../components/ParkFlow";
import { parkFlags, usePark } from "../usePark";

/** Capture-only focus request: a shot declares which verb it wants highlighted. */
export const parkFocus: { id: string | null } = { id: null };

const LOGO = { image: new URL("../../../../public/art/brightway-sign.svg", import.meta.url).href, title: "Brightway Park" };
const TOKENS = { "--jg-menu-logo-size": "clamp(40px, 6vw, 78px)" };

export interface ParkMenuProps {
  reducedMotion: boolean;
  onReducedMotion: (next: boolean) => void;
}

/** Brightway Park's front end: the park behind, the gate board in front; the kit draws every row and pane. */
export function ParkMenu({ reducedMotion, onReducedMotion }: ParkMenuProps): ReactNode {
  const { commands } = useGame();
  const clock = useGameClock();
  useGameStore(() => [session.started, session.hasSave, session.saveStatus].join("|"));
  const ctx = useGameContext();
  const w = usePark();
  const day = w.num("park.day");
  const flags = parkFlags(w);
  const slots = useSaveSlots(parkSlots);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState(parkProfile.name ?? "");
  const recent = slots.find((slot) => !slot.empty) ?? null;
  useEffect(() => { refreshParkSlot(); }, []);
  const settings = <ParkSettings reducedMotion={reducedMotion} onReducedMotion={onReducedMotion} />;

  if (session.started) {
    if (!clock.paused || resultOpen(ctx)) return null;
    return (
      <GamePauseMenu open label="The midway can wait" onResume={() => commands.run("pauseToggle", {})} eyebrow="The midway can wait" logo={LOGO} style={TOKENS}
        tagline="Your visitors and finances are paused." footer={<span>Brightway Park · day {day}</span>}
        items={[{ id: "resume", label: "Resume the park" }, { id: "save", label: "Save the park", hint: session.saveStatus }, { id: "settings", label: "Park settings" }, { id: "help", label: "How to play" }]}
        detail={(id) => id === "settings" ? settings : id === "help" ? <Help /> : id === "save" ? <p>{notice ?? "Saving keeps the day, the guests and the books as they stand."}</p> : null}
        onSelect={(id) => {
          if (id === "resume") commands.run("pauseToggle", {});
          else if (id === "save") void captureParkThumb().then(() => { commands.run("park.save", {}); refreshParkSlot(); setNotice("The park is on the board."); });
        }} />
    );
  }
  if (flags.gameOver || flags.ribbon) return null;

  return (
    <GameMenu label="Brightway Park" initialId={parkFocus.id ?? (recent === null ? "new" : "continue")} eyebrow="Seaside fair · build the midway" logo={LOGO} style={TOKENS}
      tagline="Turn a quiet coastal fair into a blue ribbon park." footer={<span>Brightway Park · day {day}</span>}
      items={[
        { id: "continue", label: "Continue", hint: recent === null ? "No park on the board" : `${recent.name ?? "Brightway Park"} · day ${String(recent.meta.day ?? day)}`, disabled: recent === null },
        { id: "new", label: "Open the park", hint: recent === null ? "Free play, or pick a scenario" : "Start fresh or pick a scenario" },
        { id: "saves", label: "Park saves", hint: recent === null ? "Nothing saved yet" : `Day ${String(recent.meta.day ?? 1)} on the board` },
        { id: "settings", label: "Settings", hint: "Motion, sound, controls" },
        { id: "credits", label: "Credits" },
      ]}
      detail={(id) => {
        if (id === "continue") return <ContinuePane slot={recent} now={() => Date.now()} emptyMessage="No park saved yet. Open one and the day starts from the gate." onContinue={() => commands.run("park.start", {})} />;
        if (id === "new") return <NewParkPane name={name} onName={setName} hasSave={recent !== null} onFresh={() => commands.run("park.new", {})}
          onScenario={(scenarioId) => { commands.run("park.scenario", { id: scenarioId }); commands.run("park.start", {}); }} />;
        if (id === "saves") return <SaveSlotsPane model={parkSlots} heading="Park saves" columns={1} onContinue={() => commands.run("park.start", {})} onLoad={() => commands.run("park.start", {})} />;
        if (id === "settings") return settings;
        if (id === "credits") return <CreditsPane heading="Credits" notice="Original Brightway art. Third-party packs are CC0." sections={[
          { heading: "Brightway Park", entries: [{ label: "The seaside fair", detail: "game and art direction" }] },
          { heading: "Assets", entries: [{ label: "KayKit, Quaternius, ambientCG", detail: "CC0 art" }] },
          { heading: "Engine", entries: [{ label: "JGengine", detail: "scene, save, menu" }] }]} />;
        return null;
      }}
      onSelect={(id) => {
        if (id === "continue" && recent !== null) commands.run("park.start", {});
        // With nothing saved, opening the park is one press; with a save, the pane asks first.
        if (id === "new") { if (recent === null) commands.run("park.start", {}); else document.querySelector<HTMLElement>("[data-park-scenario]")?.focus(); }
        if (id === "saves") document.querySelector<HTMLButtonElement>("[data-save-slot-load]")?.focus();
      }} />
  );
}

/** Name the park, then open it in free play (the menu row) or start one of the scenarios. */
function NewParkPane({ name, onName, hasSave, onFresh, onScenario }: { name: string; onName: (next: string) => void; hasSave: boolean; onFresh: () => void; onScenario: (id: string) => void }): ReactNode {
  return (
    <div className="bw-pane">
      <label className="bw-field"><span>Park name</span>
        <input data-new-day-name="" value={name} maxLength={28} placeholder="Brightway Park" onChange={(event) => { onName(event.target.value); parkProfile.name = event.target.value.trim() === "" ? null : event.target.value.trim(); }} />
      </label>
      <p>Or take on a scenario:</p>
      <div className="bw-scenarios">
        {SCENARIOS.map((scenario) => <KitButton key={scenario.id} data-park-scenario={scenario.id} onClick={() => onScenario(scenario.id)}>{scenario.title}<small>{scenario.goal}</small></KitButton>)}
      </div>
      {hasSave ? <KitButton variant="ghost" data-new-day-fresh="" onClick={onFresh}>Start fresh · archive this save</KitButton> : null}
    </div>
  );
}

function ParkSettings({ reducedMotion, onReducedMotion }: ParkMenuProps): ReactNode {
  const controls = useSettings();
  return (
    <div className="bw-pane">
      <KitButton data-park-reduced-motion="" pressed={reducedMotion} onClick={() => onReducedMotion(!reducedMotion)}>Reduce motion · {reducedMotion ? "on" : "off"}</KitButton>
      <p>Stills the ride mechanisms and the board's own motion.</p>
      <KitButton onClick={controls.open}>Sound, graphics &amp; controls</KitButton>
      <p>{session.saveStatus}. Saves stay in this browser.</p>
    </div>
  );
}

function Help(): ReactNode {
  return (
    <div className="bw-pane">
      <p>Pan with WASD or the arrow keys, rotate with Q and E, scroll to zoom. On touch, hold the camera arrows and use ＋ and −.</p>
      <p>Pick a ticket in the build palette (B shows or hides it), then click a green spot. Number keys 1–6 pick a carousel, coaster, track, food, tree or path; X or right-click stops placing.</p>
      <p>Click a ride to set its ticket, see its line and service it before it breaks. The Books button holds the gate price, the ledger and the loan.</p>
    </div>
  );
}
