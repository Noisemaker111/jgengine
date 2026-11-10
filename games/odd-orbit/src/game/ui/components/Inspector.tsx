/** @jsxImportSource @jgengine/core/ui/jsx */
import { HudButton } from "@jgengine/core/hud/hudButton.view";
import { KitPanel } from "@jgengine/core/ui/kit/uiKitRoot.view";
import { useRef } from "@jgengine/core/ui/jsx";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { useGame, useGameStore, useSceneObjects } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useFrameBind } from "@jgengine/core/ui/liveBind.view";
import { NEEDS } from "../../needs/needs";
import { moodOfNeeds, bondWord, householdBook } from "../../agents";
import {
  bloomHarvestIn, careerView, postRows, rungProgressIn, stationPayIn, STATION_NAME, yieldShiftValue,
  RUNG_NAMES,
} from "../../careers";
import { householdStore } from "../../session/store";
import { shiftRan } from "../../session/shiftSessions";
import { pairKey, type HouseholdState } from "../../session/types";
import { activeGoalLabel, waitingForStation } from "../../sim/simulate";
import { LIFESTYLES, scheduleLabel, SHIFT_SECONDS, canChangeLifestyle, yieldShiftLabel } from "../../sim/schedule";
import { FURNITURE_BY_ID } from "../../objects/catalog";
import { shiftIsOpen } from "../../sim/schedule";
import { AlienSwatch, MoodBadge, NeedBar } from "./bits";
import { traitsOf } from "../../traits";
import { Enamel } from "../fiction/kit";

const CARE = [{ goal: "hunger", label: "Nourish", detail: "Uses 1 ration" }, { goal: "energy", label: "Rest", detail: "Lowers stress" }, { goal: "fun", label: "Play", detail: "Lowers stress" }] as const;

/** Everything the care card prints for one being, as plain values: the card redraws only when one of them changes. */
function inspectorView(household: HouseholdState, objects: readonly SceneObject[], now: number) {
  const id = household.selectedMemberId;
  const member = id ? household.members[id] : null;
  if (!member || !id) return null;
  const view = careerView(household);
  const progress = rungProgressIn(view, member);
  const yieldPay = stationPayIn(view, member, "yield");
  const bloomPay = stationPayIn(view, member, "bloom");
  const crop = member.bloomCrop ?? "pantry";
  const reward = bloomHarvestIn(view, member, crop, false);
  const hasPaidStation = objects.some(object => member.lifestyle === "bloom" ? object.catalogId === "bloom_planter" : FURNITURE_BY_ID[object.catalogId]?.role === "work");
  const book = householdBook(household);
  const company = member.action.kind === "wander" && member.action.company !== undefined ? household.members[member.action.company]?.name : undefined;
  const mood = moodOfNeeds(member.needs);
  const traits = traitsOf(member);
  return {
    id,
    name: member.name,
    job: member.job,
    plan: member.bodyPlan,
    lifestyle: member.lifestyle,
    mood: { tier: mood.tier, face: mood.face, label: mood.label },
    goal: activeGoalLabel(member, company),
    traits: traits.map(trait => ({ id: trait.id, label: trait.label, blurb: trait.blurb })),
    feverHours: (member.illUntil ?? 0) > now ? Math.ceil(((member.illUntil ?? 0) - now) / 210 * 24) : null,
    recovering: member.recovering,
    stress: Math.round(member.stress),
    stressWidth: Math.round(Math.max(0, Math.min(100, member.stress))),
    needs: NEEDS.map(need => { const pct = Math.max(0, Math.min(100, member.needs[need])); return { need, value: Math.round(pct), low: pct < 30 }; }),
    progressLine: `${progress.career.label} · ${RUNG_NAMES[progress.rung - 1]} (rung ${progress.rung}/3) · household standing ${progress.have}`,
    payLine: `Yield ${yieldPay.masteryLabel} · pay x${yieldPay.factor.toFixed(2)} on a console. Bloom ${bloomPay.masteryLabel} · pay x${bloomPay.factor.toFixed(2)} on a planter${bloomPay.rations > 0 ? `, +${bloomPay.rations} ration${bloomPay.rations === 1 ? "" : "s"}` : ""}.`,
    posts: postRows(household, member).map(row => ({
      id: row.career.id,
      label: row.career.label,
      current: row.current,
      open: row.open,
      note: row.current ? `${STATION_NAME[row.career.station === "either" ? (member.lifestyle === "bloom" ? "bloom" : "yield") : row.career.station]} post` : row.open ? `${row.career.station === "either" ? "either station" : `${STATION_NAME[row.career.station]} family`}` : `${row.needs} standing`,
    })),
    canPromote: progress.canPromote,
    promoteLabel: progress.canPromote ? `Promote to ${progress.career.label} ${progress.nextLabel} · pay x${(progress.nextRung === 3 ? progress.career.native[2] : progress.career.native[1]).toFixed(2)}` : progress.reason,
    concern: member.concern,
    care: CARE.map(action => {
      const available = objects.some(object => FURNITURE_BY_ID[object.catalogId]?.role === action.goal && (action.goal !== "fun" || object.catalogId !== "bloom_planter"));
      const empty = action.goal === "hunger" && household.pantry === 0;
      return { goal: action.goal, label: action.label, disabled: !available || empty, reason: !available ? "Add a station" : empty ? "Pantry empty" : action.detail };
    }),
    rhythm: `${scheduleLabel(member)} · ${member.completedShifts} completed / ${member.missedShifts} missed shifts`,
    canChange: canChangeLifestyle(member),
    crop,
    cropLocked: member.shiftProgress > 0 || member.harvestToday > 0,
    crops: (["pantry", "export"] as const).map(choice => ({ choice, output: bloomHarvestIn(view, member, choice, false) })),
    paidReason: !hasPaidStation ? `Add a ${member.lifestyle === "bloom" ? "Bloom Planter" : "Yield Console"} with Furnish` : member.recovering ? "Recover before paid work" : member.shiftDay === household.day ? "Today's paid shift is finished or missed" : !shiftIsOpen(member, now) ? `Paid window: ${scheduleLabel(member)}` : null,
    shiftLabel: yieldShiftLabel(member, waitingForStation(household, member, objects)),
    reward,
    yieldValue: yieldShiftValue(household, member),
    shiftSeconds: Math.round(member.lifestyle === "yield" ? member.workToday : member.shiftProgress),
    workedToday: member.workToday.toFixed(0),
    harvestToday: member.harvestToday,
    bonds: household.order.filter(other => other !== id).map(other => ({ id: other, name: household.members[other]?.name ?? "?", value: household.relationships[pairKey(id, other)] ?? 0 })).sort((a, b) => b.value - a.value).map(bond => ({ id: bond.id, name: bond.name, value: Math.round(bond.value), word: bondWord(book, id, bond.id) })),
  };
}

/** How far the being's shift has run, as the bar's width: it fills every tick and is drawn without a render. */
function shiftWidth(household: HouseholdState): number {
  const id = household.selectedMemberId;
  const member = id ? household.members[id] : undefined;
  if (member === undefined) return 0;
  const progress = member.lifestyle === "yield" ? member.workToday : member.shiftProgress;
  return Math.max(0, Math.min(100, (progress / SHIFT_SECONDS) * 100));
}

export function Inspector() {
  const ctx = useGameContext();
  const { commands } = useGame();
  const objects = useSceneObjects();
  const card = useGameStore((c) => inspectorView(householdStore.read(c), objects, c.time.now()));
  const shiftBar = useRef<HTMLElement>(null);
  useFrameBind(shiftBar, () => shiftWidth(householdStore.read(ctx)), (width, element) => { element.style.width = `${width}%`; });
  if (card === null) return null;
  const { id, crop, reward, paidReason, shiftLabel } = card;
  return <KitPanel material="paper" cut="box" padding="0" edgeWidth={0} shadow={false} className="orbit-inspector" as="section" aria-label={`${card.name} care and schedule`}>
    <header><AlienSwatch plan={card.plan} size={52}/><div><h2>{card.name}</h2><small>{card.job}</small></div><HudButton className="orbit-close" aria-label="Close member care" onClick={() => commands.run("member.select",{ id:null })}>×</HudButton></header>
    <div className="orbit-inspector-body">
    <div className="orbit-member-state"><MoodBadge tier={card.mood.tier} face={card.mood.face} label={card.mood.label}/><span>{card.goal}</span></div>
    <div className="orbit-traits" role="list" aria-label="Traits">{card.traits.map(trait => <Enamel key={trait.id} role="listitem" tone="lilac" radius={99} padding="2px 10px" className="orbit-trait" title={trait.blurb}>{trait.label}</Enamel>)}</div>
    <p className="orbit-fine">{card.traits.map(trait => trait.blurb).join(" ")}</p>
    {card.feverHours !== null && <p className="orbit-warning">Fever: no paid work and rest drains faster for another {card.feverHours} hours.</p>}
    <div className="orbit-stress"><span>{card.recovering ? "Burnout recovery" : "Stress"}</span><span className="orbit-bar" role="meter" aria-label="Stress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={card.stress}><i style={{ width: `${card.stressWidth}%`, background: "#ff9e8c" }}/></span><b>{card.stress}</b></div>
    {card.recovering && <p className="orbit-warning">Paid work stops during recovery. Reach 50 Nourish and Rest, then reduce stress below 35.</p>}
    <div className="orbit-full-needs">{card.needs.map(({ need, value, low }) => <NeedBar key={need} need={need} value={value} low={low}/>)}</div>
    <h3>Post & mastery</h3>
    <p className="orbit-fine">{card.progressLine}</p>
    <p className="orbit-fine">{card.payLine}</p>
    <div className="orbit-posts" role="group" aria-label="Posts">{card.posts.map(row => <HudButton key={row.id} aria-pressed={row.current} disabled={row.current || !row.open} onClick={() => commands.run("member.career", { id, career: row.id })}>{row.label}<small>{row.note}</small></HudButton>)}</div>
    <HudButton disabled={!card.canPromote} onClick={() => commands.run("member.promote", { id })}>{card.promoteLabel}</HudButton>
    {card.concern && <p role="status" className="orbit-warning">{card.concern}</p>}
    <p className="orbit-fine">A shift raises mastery and household standing. Rungs cost standing, never credits; a Bloom Master adds a ration to every harvest.</p>
    <h3>Care now</h3><div className="orbit-care" role="group" aria-label="Direct care">{card.care.map(action => <HudButton key={action.goal} disabled={action.disabled} onClick={() => commands.run("member.direct", { id, goal:action.goal === "fun" ? "play" : action.goal })}>{action.label}<small>{action.reason}</small></HudButton>)}</div>
    <h3>Daily rhythm</h3><p className="orbit-fine">{card.rhythm}</p>
    <div className="orbit-lifestyles" role="group" aria-label="Daily schedule">{LIFESTYLES.map(lifestyle => <HudButton key={lifestyle.id} disabled={card.lifestyle !== lifestyle.id && !card.canChange} aria-pressed={card.lifestyle === lifestyle.id} onClick={() => commands.run("member.lifestyle", { id, lifestyle:lifestyle.id })}><strong>{lifestyle.label}</strong><span>{lifestyle.blurb}</span></HudButton>)}</div>
    {!card.canChange && <p className="orbit-fine">Today’s paid shift is committed. Change rhythm tomorrow.</p>}
    {card.lifestyle === "bloom" && <><h3>Choose today's crop</h3><div className="orbit-lifestyles" role="group" aria-label="Bloom crop">{card.crops.map(({ choice, output }) => <HudButton key={choice} aria-pressed={crop === choice} disabled={card.cropLocked && crop !== choice} onClick={() => commands.run("member.bloomCrop", { id, crop:choice })}><strong>{choice === "pantry" ? "Pantry crop" : "Export crop"}</strong><span>{output.rations} rations · {output.credits} credits</span></HudButton>)}</div><p className="orbit-fine">Export trades 3 rations for 12 extra credits. Friends tending nearby add 1 ration and 12 credits. {card.cropLocked ? "Crop committed until tomorrow." : "Choose before tending starts."}</p></>}
    <HudButton className="orbit-paid-action" disabled={paidReason !== null || shiftLabel !== null} onClick={() => commands.run("member.direct", { id, goal: card.lifestyle === "bloom" ? "tend" : "work" })}>{shiftLabel ?? (card.lifestyle === "bloom" ? `Tend ${crop} crop · ${reward.rations} rations + ${reward.credits} credits` : `Start Yield shift · earn up to ${card.yieldValue} credits`)}</HudButton>
    <p className="orbit-fine">{paidReason ?? (shiftLabel !== null ? "Shift under way. Care needs can interrupt it." : "20 seconds at the station. Care needs can interrupt your shift.")}</p>
    <div className="orbit-shift"><span>Shift progress</span><span className="orbit-bar" role="progressbar" aria-valuemin={0} aria-valuemax={SHIFT_SECONDS} aria-valuenow={card.shiftSeconds}><i ref={shiftBar} style={{ width: `${shiftWidth(householdStore.read(ctx))}%`, background: "#8fdcb8" }}/></span><span>{card.shiftSeconds} / {SHIFT_SECONDS}s</span></div>
    <p className="orbit-fine">Today: {card.workedToday} seconds worked · {card.harvestToday} rations grown</p>
    <HudButton className="orbit-release" onClick={() => commands.run("member.release", { id })}>Release direction · let {card.name.split(" ")[0]} choose</HudButton>
    <h3>Relationships</h3><p className="orbit-fine">Conversations ease stress. Two stressed beings may dispute instead.</p>
    <div className="orbit-bonds">{card.bonds.map(bond => <div key={bond.id}><span><strong>{bond.name}</strong><small>{bond.word} · {bond.value}</small></span><HudButton onClick={() => commands.run("member.socialize", { id, withId:bond.id })}>Talk</HudButton></div>)}</div>
    <p className="orbit-fine">Select a furnishing in the habitat to direct this being. A Bond Ring used alone can only restore Social to 55.</p>
    </div>
  </KitPanel>;
}
