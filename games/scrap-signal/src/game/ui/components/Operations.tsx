import { useEffect, useState } from "react";
import { HudPanel, useBrowserSuspension, useDisplayProfile } from "@jgengine/react";
import { GameIcon } from "@jgengine/react/gameIcons";
import { HudFade } from "@jgengine/react/hudFade";
import { useGame, useGamePhase, useGameStore } from "@jgengine/react/hooks";
import { useMenuNav } from "@jgengine/react/menuNav";
import { useGameContext } from "@jgengine/react/provider";
import { useSettings } from "@jgengine/react/settings";
import { useStore } from "@jgengine/react/store";
import { gamePhase, setGamePhase } from "@jgengine/core/game/gamePhase";
import { RELAY, relayDistance, relayStore } from "../../relay";
import { riftStore } from "../../rift/rift";
import { characterIdStore, vendorOpenStore, travelOpenStore, skillsOpenStore, blackMarketOpenStore } from "../../stores";
import { FieldTerminalShell, PauseTerminal, type TerminalPage } from "../fiction/FieldTerminal";
import { Crt, navItem, Pips, Plate, SIGNAL, Stamp, Waveform } from "../fiction/kit";
import { OverlayPortal } from "../fiction/OverlayHost";

export function Operations() {
  const ctx = useGameContext();
  const { commands } = useGame();
  const { phase } = useGamePhase();
  const settings = useSettings();
  const profile = useDisplayProfile();
  const character = useStore(characterIdStore);
  const relay = useStore(relayStore);
  const riftRun = useStore(riftStore).run;
  const vendor = useStore(vendorOpenStore);
  const travel = useStore(travelOpenStore);
  const skills = useStore(skillsOpenStore);
  const market = useStore(blackMarketOpenStore);
  const distance = useGameStore(relayDistance);
  const [manual, setManual] = useState(false);
  const [page, setPage] = useState<TerminalPage>("menu");
  const [saveMessage, setSaveMessage] = useState("");
  const modal = vendor !== null || travel || skills || market || settings.isOpen;
  const paused = manual || modal;

  useEffect(() => {
    // The front end owns the phase until the player starts or continues a run: a restored run waits
    // behind the menu, so this overlay must never promote it to `playing` on its own.
    if (character === null || phase === "menu" || gamePhase(ctx) === "ended") return;
    setGamePhase(ctx, paused ? "paused" : "playing");
    if (paused) { ctx.time.pause(); document.exitPointerLock?.(); }
    else ctx.time.play();
  }, [ctx, character, paused, phase]);
  // The terminal always opens on its command screen.
  useEffect(() => { if (!manual) { setPage("menu"); setSaveMessage(""); } }, [manual]);

  useBrowserSuspension((reason) => {
    if (reason === "pointer-lock-lost" && modal) return;
    if (gamePhase(ctx) === "playing") { ctx.time.pause(); setGamePhase(ctx, "paused"); setManual(true); }
  });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.code !== "Escape" || settings.isOpen || character === null || phase === "ended") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (vendor !== null) commands.run("vendor.close", {});
      else if (travel) commands.run("travel.close", {});
      else if (skills) commands.run("ui.openSkills", {});
      else if (market) commands.run("blackmarket.close", {});
      else if (manual && page === "settings") setPage("menu");
      else setManual((value) => !value);
    };
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("keydown", key, true);
    };
  }, [ctx, commands, character, phase, vendor, travel, skills, market, settings.isOpen, modal, manual, page]);

  async function save() {
    setSaveMessage("Saving…");
    try {
      if (ctx.game.save === undefined) { setSaveMessage("Save unavailable in this host"); return; }
      await ctx.game.save.checkpoint();
      // The world snapshot alone cannot restore the reclaimer; the run document keeps the character.
      commands.run("run.save", {});
      setSaveMessage(ctx.game.save.status() === "error" ? "Save failed · your current session is still running" : "Checkpoint saved · resume after reload");
    } catch { setSaveMessage("Save failed · your current session is still running"); }
  }
  if (character === null) return null;
  const active = relay.phase === "defend" || relay.phase === "upload";
  const result = relay.phase === "won" || relay.phase === "lost";
  return <>
    {/* An idle contract gives way to a live Overdrive run, as the mission log does. */}
    {!active && riftRun !== null && (riftRun.phase === "running" || riftRun.phase === "intermission") ? null : (
    <HudPanel id="dead-air" anchor="top-left" compact="keep" interactive>
      <HudFade watch={[relay.phase, relay.wave, relay.rewarded, relay.enemies.length, Math.round(distance / 20)]} hold={active} dimTo={0.55} idleMs={7000}>
        <Plate material="hull" cut="notch" depth={10} rim="#22363c" padding="0" className={`ss-contract ${active ? "live" : ""}`}>
          <div className="ss-contract-head">
            <Stamp tone="phosphor">{relay.rewarded ? "Carrier restored" : "Salvage contract"}</Stamp>
            <Waveform color={active ? SIGNAL.amber : SIGNAL.phosphorDim} seed={relay.wave + 2} />
          </div>
          <Crt className="ss-contract-tube">
            <strong className="ss-contract-name">DEAD AIR <span>{active ? `${relay.wave}/3` : `${Math.round(distance)} m`}</span></strong>
            <p>{active ? relay.phase === "defend" ? `Clear the ambush · ${relay.enemies.length} hostiles` : distance > RELAY.radius ? "Return to the copper ring to upload" : "Hold position · uploading carrier" : "Copper-ring relay · north of crash site"}</p>
            {active ? <>
              <div className="ss-contract-meter"><Pips value={relay.upload} max={RELAY.uploadSeconds} count={12} color={SIGNAL.phosphor} /><b>{relay.upload.toFixed(1)}/6s</b></div>
              <small>{Math.ceil(relay.remaining)}s window</small>
            </> : <small>Walk to the console · E to begin{relay.rewarded ? " · replay available" : " · $120 + 3 cores"}</small>}
          </Crt>
          {active && <>
            <button type="button" className="ss-toggle" aria-pressed={relay.overclock === true} onClick={() => commands.run("relay.overclock", {})}>
              <i aria-hidden="true" /><span>V · {relay.overclock ? "Overclock ON — reserve shield" : "Clear first — enable overclock"}</span>
            </button>
            <small className="ss-contract-note">{relay.overclock ? "Inside ring: bank signal during combat, costs 6 shield/sec. Stops at 10 shield. Still clear every hostile." : "Clear first keeps your shield. Overclock trades protection for up to 6s less upload per wave."}</small>
          </>}
        </Plate>
      </HudFade>
    </HudPanel>
    )}
    <HudPanel id="pause-operation" anchor="top-right" order={-2} compact="keep" interactive>
      <Plate as="button" material="carbon" cut="notch" depth={7} rim="#5b4a33" padding="0" className="ss-pause-key" aria-label="Pause (Esc)" onClick={() => setManual(true)}>
        <GameIcon name="pause" size={14} /><span>Esc</span>
      </Plate>
    </HudPanel>
    <OverlayPortal>
      {manual && !modal && !result && (
        <PauseTerminal page={page} onPage={setPage} onResume={() => setManual(false)} onSave={save} saveMessage={saveMessage} />
      )}
      {result && <DeadAirReport compact={profile.compact} won={relay.phase === "won"} wave={relay.wave} remaining={relay.remaining} reason={relay.reason} onContinue={() => { setManual(false); commands.run("relay.continue", {}); }} />}
    </OverlayPortal>
  </>;
}

/** Dead Air's field report, printed on the forearm terminal when the contract closes. */
function DeadAirReport({ compact, won, wave, remaining, reason, onContinue }: { compact: boolean; won: boolean; wave: number; remaining: number; reason: string; onContinue: () => void }) {
  const nav = useMenuNav({ ids: ["continue"], initialId: "continue", onConfirm: onContinue });
  return (
    <div className="ss-scrim" role="dialog" aria-modal="true" aria-label="Dead Air results">
      <FieldTerminalShell compact={compact} label="Dead Air / field report" signal={won ? 4 : 0}>
        <div className="ss-term">
          <div className="ss-term-eyebrow">&gt; contract closed</div>
          <h1 className="ss-term-title">{won ? "You broke the silence." : "Carrier lost."}</h1>
          <p className="ss-term-line">{reason}</p>
          <div className="ss-term-result">
            <span><b>{won ? "03 / 03" : `${wave} / 03`}</b><small>ambush reached</small></span>
            <span><b>{Math.ceil(remaining)}s</b><small>carrier remaining</small></span>
          </div>
          <p className="ss-term-line">{won ? "Contract secured · $120 + 3 cores on first completion. The campaign and your loot remain yours." : "Your inventory is retained. Reconstruction charges the usual 7% cash fee when your chassis is down."}</p>
          <nav className="ss-term-menu" {...nav.containerProps}>
            <button type="button" className="ss-term-cmd" autoFocus {...navItem(nav.itemProps("continue"))} onClick={onContinue}>
              <span className="ss-term-prompt" aria-hidden="true">&gt;</span><span className="ss-term-cmd-label">Return to the wastes</span><small>The console accepts another attempt when you return.</small>
            </button>
          </nav>
        </div>
      </FieldTerminalShell>
    </div>
  );
}
