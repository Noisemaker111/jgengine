import { HudButton } from "@jgengine/react/hudButton";
import { GameFrame } from "@jgengine/react/gameFrame";
import { useGame, useGameClock, useSceneObjects } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { NEEDS } from "../../needs/needs";
import { moodOfNeeds, bondWord, householdBook } from "../../agents";
import {
  bloomHarvestIn, careerView, postRows, rungProgressIn, stationPayIn, STATION_NAME, yieldShiftValue,
  RUNG_NAMES,
} from "../../careers";
import { householdStore } from "../../session/store";
import { shiftRan } from "../../session/shiftSessions";
import { pairKey } from "../../session/types";
import { activeGoalLabel, waitingForStation } from "../../sim/simulate";
import { LIFESTYLES, scheduleLabel, SHIFT_SECONDS, canChangeLifestyle, yieldShiftLabel } from "../../sim/schedule";
import { FURNITURE_BY_ID } from "../../objects/catalog";
import { shiftIsOpen } from "../../sim/schedule";
import { AlienSwatch, MoodBadge, NeedBar } from "./bits";
import { traitsOf } from "../../traits";
import { Enamel } from "../fiction/kit";
export function Inspector() {
  const household = useStore(householdStore);
  const { commands } = useGame();
  const clock = useGameClock();
  const objects = useSceneObjects();
  const id = household.selectedMemberId;
  const member = id ? household.members[id] : null;
  if (!member || !id) return null;
  const view = careerView(household);
  const progress = rungProgressIn(view, member);
  const yieldPay = stationPayIn(view, member, "yield");
  const bloomPay = stationPayIn(view, member, "bloom");
  const cropLocked = member.shiftProgress > 0 || member.harvestToday > 0;
  const crop = member.bloomCrop ?? "pantry";
  const reward = bloomHarvestIn(view, member, crop, false);
  const posts = postRows(household, member);
  const hasPaidStation = objects.some(object => member.lifestyle === "bloom" ? object.catalogId === "bloom_planter" : FURNITURE_BY_ID[object.catalogId]?.role === "work");
  const paidReason = !hasPaidStation ? `Add a ${member.lifestyle === "bloom" ? "Bloom Planter" : "Yield Console"} with Furnish` : member.recovering ? "Recover before paid work" : member.shiftDay === household.day ? "Today's paid shift is finished or missed" : !shiftIsOpen(member, clock.now) ? `Paid window: ${scheduleLabel(member)}` : null;
  const care = [{ goal:"hunger", label:"Nourish", detail:"Uses 1 ration" }, { goal:"energy", label:"Rest", detail:"Lowers stress" }, { goal:"fun", label:"Play", detail:"Lowers stress" }] as const;
  const mood = moodOfNeeds(member.needs);
  const shiftProgress = member.lifestyle === "yield" ? member.workToday : member.shiftProgress;
  const shiftLabel = yieldShiftLabel(member, waitingForStation(household, member, objects));
  const bonds = household.order.filter(other => other !== id).map(other => ({ id: other, name: household.members[other]?.name ?? "?", value: household.relationships[pairKey(id, other)] ?? 0 })).sort((a,b) => b.value - a.value);
  const book = householdBook(household);
  const company = member.action.kind === "wander" && member.action.company !== undefined ? household.members[member.action.company]?.name : undefined;
  return <GameFrame material="paper" cut="box" padding="0" edgeWidth={0} shadow={false} className="orbit-inspector" as="section" aria-label={`${member.name} care and schedule`}>
    <header><AlienSwatch plan={member.bodyPlan} size={52}/><div><h2>{member.name}</h2><small>{member.job}</small></div><HudButton className="orbit-close" aria-label="Close member care" onClick={() => commands.run("member.select",{ id:null })}>×</HudButton></header>
    <div className="orbit-inspector-body">
    <div className="orbit-member-state"><MoodBadge tier={mood.tier} face={mood.face} label={mood.label}/><span>{activeGoalLabel(member, company)}</span></div>
    <div className="orbit-traits" role="list" aria-label="Traits">{traitsOf(member).map(trait => <Enamel key={trait.id} role="listitem" tone="lilac" radius={99} padding="2px 10px" className="orbit-trait" title={trait.blurb}>{trait.label}</Enamel>)}</div>
    <p className="orbit-fine">{traitsOf(member).map(trait => trait.blurb).join(" ")}</p>
    {(member.illUntil ?? 0) > clock.now && <p className="orbit-warning">Fever: no paid work and rest drains faster for another {Math.ceil(((member.illUntil ?? 0) - clock.now) / 210 * 24)} hours.</p>}
    <div className="orbit-stress"><span>{member.recovering ? "Burnout recovery" : "Stress"}</span><span className="orbit-bar" role="meter" aria-label="Stress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(member.stress)}><i style={{ width: `${Math.round(Math.max(0, Math.min(100, member.stress)))}%`, background: "#ff9e8c" }}/></span><b>{Math.round(member.stress)}</b></div>
    {member.recovering && <p className="orbit-warning">Paid work stops during recovery. Reach 50 Nourish and Rest, then reduce stress below 35.</p>}
    <div className="orbit-full-needs">{NEEDS.map(need => <NeedBar key={need} need={need} value={member.needs[need]}/>)}</div>
    <h3>Post & mastery</h3>
    <p className="orbit-fine">{progress.career.label} · {RUNG_NAMES[progress.rung - 1]} (rung {progress.rung}/3) · household standing {progress.have}</p>
    <p className="orbit-fine">Yield {yieldPay.masteryLabel} · pay x{yieldPay.factor.toFixed(2)} on a console. Bloom {bloomPay.masteryLabel} · pay x{bloomPay.factor.toFixed(2)} on a planter{bloomPay.rations > 0 ? `, +${bloomPay.rations} ration${bloomPay.rations === 1 ? "" : "s"}` : ""}.</p>
    <div className="orbit-posts" role="group" aria-label="Posts">{posts.map(row => <HudButton key={row.career.id} aria-pressed={row.current} disabled={row.current || !row.open} onClick={() => commands.run("member.career", { id, career: row.career.id })}>{row.career.label}<small>{row.current ? `${STATION_NAME[row.career.station === "either" ? (member.lifestyle === "bloom" ? "bloom" : "yield") : row.career.station]} post` : row.open ? `${row.career.station === "either" ? "either station" : `${STATION_NAME[row.career.station]} family`}` : `${row.needs} standing`}</small></HudButton>)}</div>
    <HudButton disabled={!progress.canPromote} onClick={() => commands.run("member.promote", { id })}>{progress.canPromote ? `Promote to ${progress.career.label} ${progress.nextLabel} · pay x${(progress.nextRung === 3 ? progress.career.native[2] : progress.career.native[1]).toFixed(2)}` : progress.reason}</HudButton>
    {member.concern && <p role="status" className="orbit-warning">{member.concern}</p>}
    <p className="orbit-fine">A shift raises mastery and household standing. Rungs cost standing, never credits; a Bloom Master adds a ration to every harvest.</p>
    <h3>Care now</h3><div className="orbit-care" role="group" aria-label="Direct care">{care.map(action => {
      const available = objects.some(object => FURNITURE_BY_ID[object.catalogId]?.role === action.goal && (action.goal !== "fun" || object.catalogId !== "bloom_planter"));
      const reason = !available ? "Add a station" : action.goal === "hunger" && household.pantry === 0 ? "Pantry empty" : action.detail;
      return <HudButton key={action.goal} disabled={!available || (action.goal === "hunger" && household.pantry === 0)} onClick={() => commands.run("member.direct", { id, goal:action.goal === "fun" ? "play" : action.goal })}>{action.label}<small>{reason}</small></HudButton>;
    })}</div>
    <h3>Daily rhythm</h3><p className="orbit-fine">{scheduleLabel(member)} · {member.completedShifts} completed / {member.missedShifts} missed shifts</p>
    <div className="orbit-lifestyles" role="group" aria-label="Daily schedule">{LIFESTYLES.map(lifestyle => <HudButton key={lifestyle.id} disabled={member.lifestyle !== lifestyle.id && !canChangeLifestyle(member)} aria-pressed={member.lifestyle === lifestyle.id} onClick={() => commands.run("member.lifestyle", { id, lifestyle:lifestyle.id })}><strong>{lifestyle.label}</strong><span>{lifestyle.blurb}</span></HudButton>)}</div>
    {!canChangeLifestyle(member) && <p className="orbit-fine">Today’s paid shift is committed. Change rhythm tomorrow.</p>}
    {member.lifestyle === "bloom" && <><h3>Choose today's crop</h3><div className="orbit-lifestyles" role="group" aria-label="Bloom crop">{(["pantry","export"] as const).map(choice => { const output = bloomHarvestIn(view, member, choice, false); return <HudButton key={choice} aria-pressed={crop === choice} disabled={cropLocked && crop !== choice} onClick={() => commands.run("member.bloomCrop", { id, crop:choice })}><strong>{choice === "pantry" ? "Pantry crop" : "Export crop"}</strong><span>{output.rations} rations · {output.credits} credits</span></HudButton>; })}</div><p className="orbit-fine">Export trades 3 rations for 12 extra credits. Friends tending nearby add 1 ration and 12 credits. {cropLocked ? "Crop committed until tomorrow." : "Choose before tending starts."}</p></>}
    <HudButton className="orbit-paid-action" disabled={paidReason !== null || shiftLabel !== null} onClick={() => commands.run("member.direct", { id, goal: member.lifestyle === "bloom" ? "tend" : "work" })}>{shiftLabel ?? (member.lifestyle === "bloom" ? `Tend ${crop} crop · ${reward.rations} rations + ${reward.credits} credits` : `Start Yield shift · earn up to ${yieldShiftValue(household, member)} credits`)}</HudButton>
    <p className="orbit-fine">{paidReason ?? (shiftLabel !== null ? "Shift under way. Care needs can interrupt it." : "20 seconds at the station. Care needs can interrupt your shift.")}</p>
    <div className="orbit-shift"><span>Shift progress</span><span className="orbit-bar" role="progressbar" aria-valuemin={0} aria-valuemax={SHIFT_SECONDS} aria-valuenow={Math.round(shiftProgress)}><i style={{ width: `${Math.max(0, Math.min(100, (shiftProgress / SHIFT_SECONDS) * 100))}%`, background: "#8fdcb8" }}/></span><span>{Math.round(shiftProgress)} / {SHIFT_SECONDS}s</span></div>
    <p className="orbit-fine">Today: {member.workToday.toFixed(0)} seconds worked · {member.harvestToday} rations grown</p>
    <HudButton className="orbit-release" onClick={() => commands.run("member.release", { id })}>Release direction · let {member.name.split(" ")[0]} choose</HudButton>
    <h3>Relationships</h3><p className="orbit-fine">Conversations ease stress. Two stressed beings may dispute instead.</p>
    <div className="orbit-bonds">{bonds.map(bond => <div key={bond.id}><span><strong>{bond.name}</strong><small>{bondWord(book, id, bond.id)} · {Math.round(bond.value)}</small></span><HudButton onClick={() => commands.run("member.socialize", { id, withId:bond.id })}>Talk</HudButton></div>)}</div>
    <p className="orbit-fine">Select a furnishing in the habitat to direct this being. A Bond Ring used alone can only restore Social to 55.</p>
    </div>
  </GameFrame>;
}

