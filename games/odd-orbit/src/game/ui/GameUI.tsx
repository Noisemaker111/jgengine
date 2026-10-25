import { useEffect, useState } from "react";
import { HudCanvas, HudPanel, useHudLayout, useDisplayProfile, usePanels } from "@jgengine/react";
import { GameFrame } from "@jgengine/react/gameFrame";
import { useGameFonts } from "@jgengine/react/gameFonts";
import { GameIcon } from "@jgengine/react/gameIcons";
import { HudButton } from "@jgengine/react/hudButton";
import { useGame, useSceneObjects } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { GAME_FONTS } from "../../art/fonts/fonts";
import { householdStore } from "../session/store";
import { orbitSession } from "../session/lifecycle";
import { nextBill, RATION_BUNDLE, RELIEF, PANTRY_CAP } from "../sim/economy";
import { BuildPalette } from "./components/BuildPalette";
import { Inspector } from "./components/Inspector";
import { RosterPanel } from "./components/RosterPanel";
import { CharterNote, TermLetter, TransmissionSlip } from "./components/Charter";
import { FURNITURE_BY_ID } from "../objects/catalog";
import { HULL_PATCH_COST, repairCost } from "../sim/events";
import { FridgeMagnets, HouseClock } from "./components/TopBar";
import { creditsText } from "./components/bits";
import { Enamel } from "./fiction/kit";
import { OrbitMenu, type OrbitPreferences } from "./menu/OrbitMenu";

const PREF_KEY = "odd-orbit.preferences.v2";

function readPreferences(): OrbitPreferences {
  try { const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}"); return { calm: p?.calm === true, contrast: p?.contrast === true }; }
  catch { return { calm: false, contrast: false }; }
}

/**
 * The habitat HUD as the household's own kitchen: a wall clock and calendar top-left, the fridge
 * door top-right, the beings as magnets down the left, and a tray of three tools at the foot.
 * Everything steps back when nothing is changing and comes forward when the household needs you.
 */
export function GameUI() {
  useGameFonts(GAME_FONTS);
  const layout = useHudLayout({ storageKey: "odd-orbit" });
  const profile = useDisplayProfile();
  const household = useStore(householdStore);
  const session = useStore(orbitSession);
  const { commands } = useGame();
  const objects = useSceneObjects();
  const panels = usePanels([{ id: "build", group: "habitat" }, { id: "ledger", group: "habitat" }]);
  const drawer = panels.isOpen("build") ? "build" : panels.isOpen("ledger") ? "ledger" : null;
  const setDrawer = (id: "build" | "ledger" | null) => { if (id) panels.open(id); else { panels.close("build"); panels.close("ledger"); } };
  const [preferences, setPreferences] = useState(readPreferences);
  const command = (name: string, data: Record<string, unknown> = {}) => commands.run(name, data);
  const modal = session.screen !== null;
  const compact = profile.compact;
  const landscape = compact && !profile.portrait;
  const phone = compact && !landscape;
  const canBuy = household.credits >= RATION_BUNDLE.cost && household.pantry + RATION_BUNDLE.quantity <= PANTRY_CAP;
  const canRelief = household.reliefDay !== household.day && household.pantry < 4 && household.credits < RATION_BUNDLE.cost;
  const bill = nextBill(household, objects);
  const broken = (household.hazards?.broken ?? []).flatMap((id) => { const obj = objects.find((o) => o.instanceId === id); return obj === undefined ? [] : [{ id, catalogId: obj.catalogId }]; });
  const setPreference = (key: keyof OrbitPreferences, value: boolean) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* The session status surfaces storage availability. */ }
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.repeat || event.defaultPrevented) return;
      if (session.screen !== null) return;
      event.preventDefault();
      command("orbit.pause");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session.screen, commands]);
  const sheetOpen = drawer !== null || household.selectedMemberId !== null;
  return <>
    <HudCanvas layout={layout} className={`orbit-ui ${compact ? "orbit-compact" : ""} ${landscape ? "orbit-landscape" : ""} ${preferences.calm ? "orbit-calm" : ""} ${preferences.contrast ? "orbit-contrast" : ""}`}>
      {!modal && <>
        <HudPanel id="clock" anchor="top-left" priority="critical"><HouseClock compact={compact} /></HudPanel>
        <HudPanel id="fridge" anchor="top-right" priority="critical"><FridgeMagnets compact={phone} /></HudPanel>
        {!sheetOpen && <HudPanel id="charter" anchor="top-right" order={1} priority="secondary"><CharterNote compact={phone} /></HudPanel>}
        {household.incident != null && household.charter?.review == null && <HudPanel id="transmission" anchor="top" priority="critical"><TransmissionSlip /></HudPanel>}
        {!(phone && sheetOpen) && <HudPanel id="roster" anchor={phone ? "bottom" : "left"} order={phone ? 1 : 0} priority="critical"><RosterPanel compact={compact} /></HudPanel>}
        {household.selectedMemberId && !drawer && <HudPanel id="inspector" anchor={phone ? "bottom" : "right"} order={phone ? 2 : 0} priority="secondary"><Inspector /></HudPanel>}
        {drawer && <HudPanel id="drawer" anchor={phone ? "bottom" : "right"} order={phone ? 2 : 0} priority="secondary">
          <GameFrame material="paper" cut="box" padding="0" edgeWidth={0} shadow={false} className="orbit-drawer" as="section" aria-label={drawer === "build" ? "Habitat furnishings" : "Daily balance"}>
            <header>
              <span className="orbit-drawer-icon"><GameIcon name={drawer === "build" ? "hammer" : "bread"} size={22} /></span>
              <h2>{drawer === "build" ? "Furnishings catalogue" : "Pantry & bills"}</h2>
              <Enamel as="button" tone="cream" radius={99} padding="0" className="orbit-close" aria-label="Close habitat panel" onClick={() => setDrawer(null)}><GameIcon name="cross" size={14} /></Enamel>
            </header>
            <div className="orbit-drawer-body">
              {drawer === "build" ? <BuildPalette onChoose={() => setDrawer(null)} /> : <>
                <div className="orbit-balance">
                  <span>Earned today<b>{creditsText(household.dayIncome)}</b></span>
                  <span>Grown today<b>{household.dayHarvest} rations</b></span>
                  <span>Due at midnight<b>{Math.round(bill)}</b></span>
                  <span>In the jar<b>{creditsText(Math.floor(household.credits))}</b></span>
                  {household.debt > 0 && <span className="warning">Debt carried<b>{creditsText(household.debt)}</b></span>}
                </div>
                {household.lastDay && <p className="orbit-day-report">Yesterday: {creditsText(household.lastDay.income)} earned, {household.lastDay.harvest} rations grown, {household.lastDay.bill} billed, {household.lastDay.missed} shifts missed.</p>}
                <HudButton disabled={!canBuy} onClick={() => command("household.rations")}>Buy {RATION_BUNDLE.quantity} rations · {RATION_BUNDLE.cost} credits</HudButton>
                <p className="orbit-fine">{canBuy ? "Each meal uses one ration." : household.pantry + RATION_BUNDLE.quantity > PANTRY_CAP ? "The pantry has no room for six more." : `Need ${creditsText(RATION_BUNDLE.cost - household.credits)} more credits.`}</p>
                <HudButton disabled={!canRelief} onClick={() => command("household.relief")}>Emergency {RELIEF.quantity} rations · +{RELIEF.debt} debt</HudButton>
                <p className="orbit-fine">{canRelief ? "Once a day. The next bill repays up to 40." : household.reliefDay === household.day ? "Relief already taken today." : "Only when under 4 rations and 36 credits."}</p>
                {(broken.length > 0 || household.hazards?.hullLeak === true) && <>
                  <h3 className="orbit-repairs-head">Repairs</h3>
                  {broken.map(({ id, catalogId }) => (
                    <HudButton key={id} disabled={household.credits < repairCost(catalogId)} onClick={() => command("household.repair", { id })}>Mend the {FURNITURE_BY_ID[catalogId]?.name ?? "furnishing"} · {repairCost(catalogId)} credits</HudButton>
                  ))}
                  {household.hazards?.hullLeak === true && <HudButton disabled={household.credits < HULL_PATCH_COST} onClick={() => command("household.patchHull")}>Patch the torpor wing · {HULL_PATCH_COST} credits</HudButton>}
                  <p className="orbit-fine">Broken furnishings stand idle and an inspector fines a habitat in disrepair.</p>
                </>}
              </>}
            </div>
          </GameFrame>
        </HudPanel>}
        <HudPanel id="actions" anchor={landscape ? "bottom-left" : "bottom"} priority="critical">
          <nav className="orbit-tray" aria-label="Habitat tools">
            <Enamel as="button" tone="butter" radius={20} padding="0" className="orbit-tool" aria-expanded={drawer === "build"} onClick={() => setDrawer(drawer === "build" ? null : "build")}>
              <GameIcon name="hammer" size={22} /><span>Furnish</span>
            </Enamel>
            <Enamel as="button" tone={household.pantry < 4 ? "coral" : "mint"} radius={20} padding="0" className="orbit-tool" aria-expanded={drawer === "ledger"} onClick={() => setDrawer(drawer === "ledger" ? null : "ledger")}>
              <GameIcon name="bread" size={22} /><span>Pantry</span>{household.pantry < 4 && <i className="orbit-badge" aria-label="Pantry is low">!</i>}
            </Enamel>
            <Enamel as="button" tone="lilac" radius={20} padding="0" className="orbit-tool" onClick={() => command("orbit.pause")}>
              <GameIcon name="tome" size={22} /><span>Handbook</span>
            </Enamel>
          </nav>
        </HudPanel>
        {household.buildTool && <HudPanel id="placement" anchor="bottom" order={1} priority="critical">
          <GameFrame material="paper" cut="ticket" depth={10} padding="8px 18px" edgeWidth={0} className="orbit-placement">
            <span>Tap open floor to place it.</span>
            <Enamel as="button" tone="coral" radius={12} padding="4px 12px" onClick={() => command("build.cancel")}>Cancel</Enamel>
          </GameFrame>
        </HudPanel>}
      </>}
    </HudCanvas>
    {!modal && <TermLetter />}
    {modal && <OrbitMenu preferences={preferences} onPreference={setPreference} />}
  </>;
}
