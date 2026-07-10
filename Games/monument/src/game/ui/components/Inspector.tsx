import { useRef, useState } from "react";
import type { ReactNode } from "react";

import { useGame, useGameStore } from "@jgengine/react/hooks";

import {
  ARCHITECTURAL_TRAJECTORIES,
  CELL,
  COMPOSITIONS,
  DESIGN_LANGUAGES,
  HALF,
  PLAZA_KINDS,
  PROFILES,
  PROGRAMS,
  TONES,
  TYPOLOGIES,
  type Building,
  type DesignLanguage,
  type FacadeStrategy,
  type Plaza,
  type PlazaKind,
  type Program,
  type StructuralSystem,
  type Tone,
  type Typology,
} from "../../catalog";
import { controlContextNote, controlDisabledReason } from "../../city/applicability";
import { cityBuildings, cityPlazas } from "../../city/state";
import { performanceFor, plazaPerformance } from "../../city/metrics";
import { EYEBROW, HAIRLINE, PANEL } from "../theme";
import { CardButton, LabelRow, Meter, OptionStrip, Range, StatCell, Swatch, type Run } from "./InspectorControls";

const CHIP_ACTIVE = "border border-[#171916] bg-[#171916] text-[#eeeae0]";
const CHIP_IDLE = "border border-[rgba(20,22,18,0.22)] text-[#171916] hover:bg-[rgba(20,22,18,0.08)]";
const READOUT = "border border-[rgba(20,22,18,0.16)] bg-[rgba(255,255,255,0.4)]";

const FACADES: readonly FacadeStrategy[] = ["ribbon", "deep-grid", "brise-soleil", "punched", "exoskeleton", "screen"];
const STRUCTURES: readonly StructuralSystem[] = ["frame", "walls", "cores"];
const DENSITY_LABELS = ["sparse", "measured", "rich", "dense", "maximal"] as const;
const TABS = [
  ["massing", "Massing"],
  ["envelope", "Envelope"],
  ["use", "Use"],
  ["analysis", "Analysis"],
] as const;

type Tab = (typeof TABS)[number][0];

const SITE_OPTIONS = [
  { id: "parcel", label: "Parcel", sub: "one block", width: 28, depth: 28 },
  { id: "cross", label: "Cross-block", sub: "two-block span", width: 62, depth: 28 },
  { id: "linear", label: "Urban bar", sub: "three-block span", width: 94, depth: 28 },
  { id: "court", label: "Megacourt", sub: "two by two", width: 62, depth: 62 },
  { id: "super", label: "Superblock", sub: "three by two", width: 94, depth: 62 },
] as const;

const COMPOSITION_EFFECTS: Record<Building["composition"], string> = {
  bar: "One directional plate. BREAK cuts its rhythm without changing the family.",
  split: "Two separated wings held together by intermittent inhabited bridges.",
  cluster: "Rooms and houses aggregate in both directions around a shared center.",
  stack: "Independent plates slide and shrink as they rise, making occupied terraces.",
  court: "Four inhabited edges preserve a real open room at the center.",
  bridge: "Vertical anchors carry distinct airborne rooms across an open ground.",
  ring: "A continuous civic perimeter wraps a tall shared atrium.",
  capsule: "Replaceable pods attach to permanent service spines and transfer arms.",
  megastructure: "A deep structural armature hosts incomplete districts and sky streets.",
};

const fmt = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : Math.round(n).toString();

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function formCharacter(b: Building): { name: string; copy: string } {
  if (b.composition === "capsule" && b.branches > 4)
    return { name: "Branching metabolist city", copy: "Inhabited booms leave permanent service spines as airborne streets and terminal rooms." };
  if (b.composition === "capsule" && b.taper > 38)
    return { name: "Tapered plug-in monument", copy: "Replaceable pods contract into a legible skyline around a permanent serviced core." };
  if (b.composition === "capsule")
    return { name: "Metabolist pod frame", copy: "Service spines, transfer racks and replaceable rooms form an architecture designed to keep changing." };
  if (b.height > 78 && b.crown > 58 && b.branches > 3 && ["charcoal", "terracotta"].includes(b.tone))
    return { name: "Neo-noir vertical city", copy: "Layered infrastructure, lit crowns, deep setbacks and airborne streets." };
  if (b.height > 48 && b.vegetation > 58 && b.articulation > 45)
    return { name: "Inhabited arcology", copy: "A dense climatic world of gardens, branches, courts and shared sky rooms." };
  if (b.composition === "cluster" && b.height < 36 && b.articulation > 56 && b.moduleDensity > 2)
    return { name: "Hill village", copy: "Fine-grain houses, shifting roofs, lanes and accidental courtyards." };
  if (b.composition === "megastructure" && b.articulation > 45)
    return { name: "Open megaframe", copy: "A permanent armature hosting changeable neighborhoods and bridges." };
  if (b.voids > 52 && b.pilotis > 4)
    return { name: "Porous civic condenser", copy: "Open ground and carved social rooms connect the building to the city." };
  if (b.taper > 38 || b.profile === "twisted")
    return { name: "Concrete landform", copy: "A singular silhouette shaped by gravity, light and sectional drift." };
  return { name: "Evolving urban fabric", copy: "Pull the colored handles; character emerges from proportion and repetition." };
}

function ProgramTag({ program }: { program: Program }): ReactNode {
  const p = PROGRAMS[program];
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 border border-[rgba(20,22,18,0.35)]" style={{ background: p.color }} />
      <span className="text-[10px] font-medium uppercase tracking-[0.05em] text-[#171916]">{p.short}</span>
    </span>
  );
}

function Shell({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className={`flex max-h-[calc(100dvh-6rem)] w-[330px] flex-col overflow-hidden ${PANEL}`}>{children}</div>
  );
}

export function Inspector({ building, plaza }: { building: Building | null; plaza: Plaza | null }): ReactNode {
  const { commands } = useGame();
  const run: Run = (action, input) => {
    commands.run(action, input);
  };
  if (plaza !== null) return <PlazaInspector plaza={plaza} run={run} />;
  if (building !== null) return <BuildingInspector building={building} run={run} />;
  return null;
}

function BuildingInspector({ building, run }: { building: Building; run: Run }): ReactNode {
  const [tab, setTab] = useState<Tab>("massing");
  const nameCapture = useRef(true);
  const buildings = useGameStore(cityBuildings);
  const plazas = useGameStore(cityPlazas);

  const performance = performanceFor(building, buildings, plazas);
  const score = Math.round((performance.daylight + performance.egress + performance.publicLife) / 3);
  const egressLow = performance.egress < 70;
  const adviceTitle = egressLow ? "Egress pressure" : "Spatial reading";
  const adviceCopy = egressLow
    ? "Height and occupancy exceed the current core strategy. Add a core or reduce the floor plate."
    : performance.daylight < 55
      ? "Deep floor plates are limiting useful daylight. Narrow the section or increase facade porosity."
      : "The structure has a legible load path, viable daylight, and an active relationship to the district.";

  const apply = (patch: Partial<Building>): void => run("building.update", { id: building.id, patch, capture: true });
  const slide = (patch: Partial<Building>, capture: boolean): void =>
    run("building.update", { id: building.id, patch, capture });

  const siteLimit = HALF * CELL;
  const nudge = (dx: number, dz: number): void =>
    apply({ x: clamp(building.x + dx, -siteLimit, siteLimit), z: clamp(building.z + dz, -siteLimit, siteLimit) });
  const snapToBlock = (): void =>
    apply({ x: Math.round(building.x / CELL) * CELL, z: Math.round(building.z / CELL) * CELL });

  const remix = (): void => {
    const compositions = Object.keys(COMPOSITIONS) as Building["composition"][];
    const profiles = Object.keys(PROFILES) as Building["profile"][];
    const nextComposition = compositions[(compositions.indexOf(building.composition) + 2 + building.terraces) % compositions.length];
    const nextProfile = profiles[(profiles.indexOf(building.profile) + 1 + building.cores) % profiles.length];
    apply({
      composition: nextComposition,
      profile: nextProfile,
      voids: ((building.voids + 23) % 68) + 2,
      taper: ((building.taper + 31) % 62) + 3,
      cantilever: (building.cantilever + 3.7) % 13,
      terraces: (building.terraces % 7) + 1,
    });
  };

  const floors = Math.max(1, Math.floor((building.height - building.pilotis) / building.floorHeight));
  const blocksX = Math.max(1, Math.round(building.width / CELL));
  const blocksZ = Math.max(1, Math.round(building.depth / CELL));
  const podFloors = Math.max(1, Math.floor((building.height - Math.min(building.pilotis, building.height * 0.28)) / building.floorHeight));
  const podDesiredRows = Math.round(Math.max(5, Math.min(14, 5 + Math.min(5, podFloors * 0.18) + ((building.moduleDensity - 1) / 4) * 5)));
  const podLanes = 1 + Number(building.moduleDensity >= 3 && building.depth > 18) + Number(building.moduleDensity === 5 && building.depth > 38);
  const podSpines = Math.round(Math.max(1, Math.min(3, Math.max(building.cores, podLanes))));
  const podRows = Math.min(podDesiredRows, Math.max(4, Math.floor(64 / (podSpines * 2))));
  const podVoidBands = building.voids < 20 ? 0 : building.voids < 42 ? 1 : building.voids < 60 ? 2 : 3;
  const podCrown = building.crown > 76 ? 4 : building.crown > 44 ? 2 : 0;
  const articulationTierBonus = ["bar", "megastructure"].includes(building.composition) ? Math.floor(building.articulation / 45) : 0;
  const requestedTiers = Math.max(building.terraces, Math.ceil(floors / 7) + Math.floor((building.moduleDensity - 3) / 2) + articulationTierBonus);
  const generatedCount =
    building.composition === "capsule"
      ? (podRows - podVoidBands) * 2 * podSpines + building.branches + podCrown
      : Math.min(floors, requestedTiers);

  const character = formCharacter(building);
  const directMoves = [
    "repeat",
    controlDisabledReason(building, "cantilever") === undefined && "cantilever",
    controlDisabledReason(building, "voids") === undefined && "void",
    controlDisabledReason(building, "taper") === undefined && "taper",
    controlDisabledReason(building, "articulation") === undefined && "break",
    controlDisabledReason(building, "branches") === undefined && "branch",
    controlDisabledReason(building, "crown") === undefined && "crown",
  ]
    .filter(Boolean)
    .join(" · ");

  const designMoves = [
    { title: "Open the ground", sub: "Pilotis · civic threshold", run: () => apply({ pilotis: Math.max(5, building.pilotis), porosity: Math.max(48, building.porosity), structural: "frame" }) },
    { title: "Step to light", sub: "Terraces · inhabited roofs", run: () => apply({ composition: "stack", profile: "stepped", terraces: Math.max(4, building.terraces), depth: Math.min(62, building.depth + 3), balconies: Math.max(65, building.balconies) }) },
    { title: "Expose the frame", sub: "Deep grid · clear load path", run: () => apply({ structural: "frame", facade: "deep-grid", baySpacing: Math.max(4.2, building.baySpacing), porosity: Math.max(55, building.porosity) }) },
    { title: "Recombine form", sub: "New composition · same program", run: remix },
  ];

  return (
    <Shell>
      <div className={`border-b px-3.5 pb-2.5 pt-3 ${HAIRLINE}`}>
        <span className={EYEBROW}>Selected structure</span>
        <input
          aria-label="Building name"
          value={building.name}
          onFocus={() => {
            nameCapture.current = true;
          }}
          onChange={(event) => {
            run("building.update", { id: building.id, patch: { name: event.target.value }, capture: nameCapture.current });
            nameCapture.current = false;
          }}
          className="mt-1 w-full bg-transparent text-[15px] font-bold tracking-[-0.01em] text-[#171916] outline-none focus:bg-[rgba(255,255,255,0.4)]"
        />
      </div>

      <div className={`flex items-center gap-3 border-b px-3.5 py-2 ${HAIRLINE}`}>
        <ProgramTag program={building.program} />
        <span className="text-[10px] text-[#6d7069]">{floors} levels</span>
        <span className="text-[10px] text-[#6d7069]">{fmt(building.width * building.depth * floors)} m² GFA</span>
      </div>

      <div className={`flex border-b ${HAIRLINE}`}>
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] transition ${
              tab === id ? "bg-[#171916] text-[#eeeae0]" : "text-[#4b4e47] hover:bg-[rgba(20,22,18,0.08)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pb-2">
        {tab === "massing" && (
          <>
            <div className={`mx-3.5 mt-3 p-2.5 ${READOUT}`}>
              <span className={EYEBROW}>Form becoming</span>
              <b className="mt-0.5 block text-[13px] font-bold tracking-[-0.01em] text-[#171916]">{character.name}</b>
              <p className="mt-1 text-[10px] leading-snug text-[#4b4e47]">{character.copy}</p>
              <small className="mt-1.5 block text-[9px] leading-snug text-[#8a8d84]">Direct handles: drag move; pull {directMoves}.</small>
            </div>

            <LabelRow label="Site placement" hint="move the selected structure" />
            <div className="flex items-stretch gap-1 px-3.5 py-1.5">
              <StatCell label="East / west" value={`${Math.round(building.x)}m`} />
              <StatCell label="North / south" value={`${Math.round(building.z)}m`} />
              <button type="button" onClick={snapToBlock} className={`px-2 text-[10px] font-medium ${CHIP_IDLE}`}>
                Snap to block
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1 px-3.5 py-1.5" aria-label="Nudge building by one block">
              <span />
              <button type="button" onClick={() => nudge(0, -CELL)} className={`py-1.5 text-[11px] font-semibold ${CHIP_IDLE}`}>N</button>
              <span />
              <button type="button" onClick={() => nudge(-CELL, 0)} className={`py-1.5 text-[11px] font-semibold ${CHIP_IDLE}`}>W</button>
              <span className="grid place-items-center text-[11px] text-[#8a8d84]">◇</span>
              <button type="button" onClick={() => nudge(CELL, 0)} className={`py-1.5 text-[11px] font-semibold ${CHIP_IDLE}`}>E</button>
              <span />
              <button type="button" onClick={() => nudge(0, CELL)} className={`py-1.5 text-[11px] font-semibold ${CHIP_IDLE}`}>S</button>
              <span />
            </div>
            <Range label="East / west" value={building.x} min={-siteLimit} max={siteLimit} step={1} unit="m" onChange={(v, c) => slide({ x: v }, c)} />
            <Range label="North / south" value={building.z} min={-siteLimit} max={siteLimit} step={1} unit="m" onChange={(v, c) => slide({ z: v }, c)} />

            <LabelRow label="Site extent" hint="cross streets and combine blocks" />
            <div className="grid grid-cols-3 gap-1 px-3.5 py-1.5">
              {SITE_OPTIONS.map((site) => (
                <CardButton
                  key={site.id}
                  active={Math.abs(building.width - site.width) < 4 && Math.abs(building.depth - site.depth) < 4}
                  title={site.label}
                  subtitle={site.sub}
                  onClick={() => apply({ width: site.width, depth: site.depth })}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1 px-3.5 py-1.5">
              <StatCell label="Site" value={`${blocksX}×${blocksZ}`} sub="blocks" />
              <StatCell label={building.composition === "capsule" ? "Pods" : "Tiers"} value={String(generatedCount)} sub="generated" />
              <StatCell label="Density" value={`${building.moduleDensity}/5`} />
            </div>

            <LabelRow label="Architectural trajectories" hint="strong starting propositions" />
            <div className="flex flex-col gap-1 px-3.5 py-1.5">
              {Object.entries(ARCHITECTURAL_TRAJECTORIES).map(([id, entry]) => (
                <CardButton key={id} active={false} title={entry.label} subtitle={entry.subtitle} description={entry.description} onClick={() => apply(entry.patch)} />
              ))}
            </div>

            <LabelRow label="Character grammar" hint="mix freely after applying" />
            <div className="grid grid-cols-2 gap-1 px-3.5 py-1.5">
              {(Object.keys(DESIGN_LANGUAGES) as DesignLanguage[]).map((language) => (
                <CardButton
                  key={language}
                  active={building.language === language}
                  title={DESIGN_LANGUAGES[language].label}
                  subtitle={DESIGN_LANGUAGES[language].subtitle}
                  onClick={() => apply(DESIGN_LANGUAGES[language].patch)}
                />
              ))}
            </div>

            <LabelRow label="Design moves" hint="coordinated gestures" />
            <div className="grid grid-cols-2 gap-1 px-3.5 py-1.5">
              {designMoves.map((move) => (
                <button key={move.title} type="button" onClick={move.run} className={`flex flex-col gap-0.5 p-2 text-left ${CHIP_IDLE}`}>
                  <b className="text-[10.5px] font-semibold text-[#171916]">{move.title}</b>
                  <small className="text-[9px] text-[#6d7069]">{move.sub}</small>
                </button>
              ))}
            </div>

            <LabelRow label="Composition engine" hint="the governing spatial rule" />
            <div className={`mx-3.5 p-2.5 ${READOUT}`} aria-live="polite">
              <span className={EYEBROW}>Active rule</span>
              <b className="mt-0.5 block text-[12px] font-bold text-[#171916]">{COMPOSITIONS[building.composition].label}</b>
              <p className="mt-1 text-[10px] leading-snug text-[#4b4e47]">{COMPOSITION_EFFECTS[building.composition]}</p>
            </div>
            <div className="grid grid-cols-3 gap-1 px-3.5 py-1.5">
              {(Object.keys(COMPOSITIONS) as Building["composition"][]).map((c) => (
                <CardButton
                  key={c}
                  active={building.composition === c}
                  title={COMPOSITIONS[c].label}
                  subtitle={COMPOSITIONS[c].subtitle}
                  onClick={() => {
                    if (c !== building.composition) apply({ composition: c });
                  }}
                />
              ))}
            </div>

            <LabelRow label="Growth profile" hint="how added floors behave" />
            <div className="grid grid-cols-3 gap-1 px-3.5 py-1.5">
              {(Object.keys(PROFILES) as Building["profile"][]).map((p) => (
                <CardButton key={p} active={building.profile === p} title={PROFILES[p].label} subtitle={PROFILES[p].subtitle} onClick={() => apply({ profile: p })} />
              ))}
            </div>

            <LabelRow label="Archetype" hint="a starting point, never a limit" />
            <div className="grid grid-cols-3 gap-1 px-3.5 py-1.5">
              {(Object.keys(TYPOLOGIES) as Typology[]).map((t) => {
                const p = TYPOLOGIES[t];
                return (
                  <CardButton
                    key={t}
                    active={building.typology === t}
                    title={p.label.replace("The ", "")}
                    subtitle={p.subtitle.split(" / ")[0]}
                    onClick={() =>
                      apply({
                        typology: t,
                        composition: p.composition,
                        profile: p.profile,
                        height: p.height,
                        width: p.width,
                        depth: p.depth,
                        terraces: p.terraces,
                        cantilever: p.cantilever,
                        floorHeight: p.floorHeight,
                        baySpacing: p.baySpacing,
                        structural: p.structural,
                        facade: p.facade,
                        pilotis: p.pilotis,
                        balconies: p.balconies,
                        cores: p.cores,
                        podiumHeight: p.podiumHeight,
                      })
                    }
                  />
                );
              })}
            </div>

            <Range label="Height" value={building.height} min={12} max={160} unit="m" onChange={(v, c) => slide({ height: v }, c)} />
            <Range label="Footprint X" value={building.width} min={8} max={128} step={1} unit="m" onChange={(v, c) => slide({ width: v }, c)} />
            <Range label="Footprint Y" value={building.depth} min={8} max={96} step={1} unit="m" onChange={(v, c) => slide({ depth: v }, c)} />

            <LabelRow label="Module density" hint="how much the system generates" />
            <div className="grid grid-cols-5 gap-1 px-3.5 py-1.5">
              {DENSITY_LABELS.map((lab, i) => {
                const v = i + 1;
                return (
                  <button
                    key={v}
                    type="button"
                    aria-label={`Density ${v}`}
                    onClick={() => apply({ moduleDensity: v })}
                    className={`flex flex-col items-center gap-0.5 py-1 ${building.moduleDensity === v ? CHIP_ACTIVE : CHIP_IDLE}`}
                  >
                    <b className="text-[12px] font-semibold">{v}</b>
                    <small className="text-[7.5px] uppercase tracking-[0.04em]">{lab}</small>
                  </button>
                );
              })}
            </div>

            <Range label="Break apart" value={building.articulation} min={0} max={100} step={0.5} unit="%" disabledReason={controlDisabledReason(building, "articulation")} onChange={(v, c) => slide({ articulation: v }, c)} />
            <Range label="Lateral branches" value={building.branches} min={0} max={8} disabledReason={controlDisabledReason(building, "branches")} onChange={(v, c) => slide({ branches: v }, c)} />
            <Range label="Crown intensity" value={building.crown} min={0} max={100} step={0.5} unit="%" disabledReason={controlDisabledReason(building, "crown")} onChange={(v, c) => slide({ crown: v }, c)} />
            <Range label="Floor-to-floor" value={building.floorHeight} min={2.8} max={5.4} step={0.05} unit="m" onChange={(v, c) => slide({ floorHeight: v }, c)} />
            <Range label="Structural bay" value={building.baySpacing} min={2.7} max={7.5} step={0.1} unit="m" disabledReason={controlDisabledReason(building, "baySpacing")} contextNote={controlContextNote(building, "baySpacing")} onChange={(v, c) => slide({ baySpacing: v }, c)} />
            <Range label="Terrace cuts" value={building.terraces} min={1} max={7} disabledReason={controlDisabledReason(building, "terraces")} onChange={(v, c) => slide({ terraces: v }, c)} />
            <Range label="Cantilever" value={building.cantilever} min={0} max={14} step={0.2} unit="m" disabledReason={controlDisabledReason(building, "cantilever")} onChange={(v, c) => slide({ cantilever: v }, c)} />
            <Range label="Carved void" value={building.voids} min={0} max={70} step={0.5} unit="%" disabledReason={controlDisabledReason(building, "voids")} onChange={(v, c) => slide({ voids: v }, c)} />
            <Range label="Vertical taper" value={building.taper} min={0} max={65} step={0.5} unit="%" disabledReason={controlDisabledReason(building, "taper")} onChange={(v, c) => slide({ taper: v }, c)} />
            <Range label="Pilotis / undercroft" value={building.pilotis} min={0} max={9} step={0.2} unit="m" onChange={(v, c) => slide({ pilotis: v }, c)} />
            <Range label="Exposed balconies" value={building.balconies} min={0} max={100} unit="%" disabledReason={controlDisabledReason(building, "balconies")} onChange={(v, c) => slide({ balconies: v }, c)} />

            <LabelRow label="Structural logic" hint="load path" />
            <OptionStrip options={STRUCTURES} value={building.structural} onSelect={(structural) => apply({ structural })} />
            <Range label="Orientation" value={building.rotation} min={0} max={315} step={45} unit="°" onChange={(v, c) => slide({ rotation: v }, c)} />
          </>
        )}

        {tab === "envelope" && (
          <>
            <LabelRow label="Concrete finish" hint="material palette" />
            <div className="flex flex-wrap gap-1.5 px-3.5 py-1.5">
              {(Object.keys(TONES) as Tone[]).map((t) => (
                <Swatch key={t} active={building.tone === t} color={TONES[t].color} label={TONES[t].label} onClick={() => apply({ tone: t })} />
              ))}
            </div>

            <LabelRow label="Facade system" hint="depth & shadow" />
            <OptionStrip options={FACADES} value={building.facade} onSelect={(facade) => apply({ facade })} />

            <Range label="Facade rhythm" value={building.rhythm} min={2} max={8} disabledReason={controlDisabledReason(building, "rhythm")} onChange={(v, c) => slide({ rhythm: v }, c)} />
            <Range label="Glazing ratio" value={building.porosity} min={15} max={80} unit="%" contextNote={controlContextNote(building, "porosity")} onChange={(v, c) => slide({ porosity: v }, c)} />
            <Range label="Facade depth" value={building.facadeDepth} min={0.2} max={4.5} step={0.1} unit="m" disabledReason={controlDisabledReason(building, "facadeDepth")} onChange={(v, c) => slide({ facadeDepth: v }, c)} />
            <Range label="Weathering" value={building.weathering} min={0} max={100} unit="%" onChange={(v, c) => slide({ weathering: v }, c)} />
            <Range label="Vegetation" value={building.vegetation} min={0} max={100} unit="%" disabledReason={controlDisabledReason(building, "vegetation")} onChange={(v, c) => slide({ vegetation: v }, c)} />

            <div className={`mx-3.5 mt-2 p-2.5 ${READOUT}`}>
              <span className={EYEBROW}>Board-mark direction</span>
              <p className="mt-1 text-[10px] leading-snug text-[#4b4e47]">Horizontal lifts emphasize the building as a constructed geological mass.</p>
            </div>
            <div className="grid grid-cols-2 gap-1 px-3.5 py-1.5">
              <StatCell label="Daylight" value={`${Math.max(18, Math.round(96 - building.depth * 1.8 + building.porosity * 0.15))}%`} />
              <StatCell label="Heat load" value={`${Math.round(18 + building.porosity * 0.55)}%`} />
            </div>
          </>
        )}

        {tab === "use" && (
          <>
            <LabelRow label="Occupancy model" hint="secondary to architecture" />
            <div className="flex flex-col gap-1 px-3.5 py-1.5">
              {(Object.keys(PROGRAMS) as Program[]).map((p) => {
                const entry = PROGRAMS[p];
                const active = building.program === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => apply({ program: p })}
                    className={`flex items-start gap-2 border p-2 text-left transition ${
                      active ? "border-[#171916] bg-[rgba(215,255,67,0.4)]" : "border-[rgba(20,22,18,0.18)] hover:bg-[rgba(20,22,18,0.06)]"
                    }`}
                  >
                    <span className="mt-0.5 h-3 w-3 shrink-0 border border-[rgba(20,22,18,0.35)]" style={{ background: entry.color }} />
                    <span className="flex flex-col gap-0.5">
                      <b className="text-[11px] font-semibold text-[#171916]">{entry.label}</b>
                      <small className="text-[9px] leading-snug text-[#6d7069]">{entry.description}</small>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-1 px-3.5 py-1.5">
              <StatCell label="Gross floor area" value={`${fmt(building.width * building.depth * floors)} m²`} />
              <StatCell label="Levels" value={String(floors)} />
            </div>
          </>
        )}

        {tab === "analysis" && (
          <>
            <div className="mx-3.5 mt-3 flex items-center justify-between bg-[#171916] px-3.5 py-3 text-[#eeeae0]">
              <div>
                <span className="block text-[8px] uppercase tracking-[0.12em] text-[#a8ada2]">Building performance</span>
                <b className="mt-1 block text-[30px] font-semibold leading-none text-[#d7ff43]">{score}</b>
                <small className="text-[8px] uppercase tracking-[0.06em] text-[#a8ada2]">integrated score / 100</small>
              </div>
              <span
                className="relative h-14 w-14 shrink-0 rounded-full"
                style={{ background: `conic-gradient(#d7ff43 ${score}%, #42463f ${score}%)` }}
              >
                <span className="absolute inset-[7px] rounded-full bg-[#171916]" />
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1 px-3.5 py-2">
              <StatCell label="Gross floor area" value={`${fmt(performance.gfa)} m²`} sub={`FAR ${performance.far.toFixed(1)}`} />
              <StatCell
                label="Embodied carbon"
                value={`${fmt(performance.carbon)} t`}
                sub={`${Math.round((performance.carbon / performance.gfa) * 1000)} kg/m²`}
              />
              <StatCell label="Useful daylight" value={`${performance.daylight}%`} sub={`${performance.shadeHours}h shade / day`} />
              <StatCell label="Energy demand" value={String(performance.energy)} sub="kWh/m²·yr" />
            </div>

            <LabelRow label="Design checks" hint="live model" />
            <Meter label="Daylight autonomy" value={performance.daylight} />
            <Meter label="Egress resilience" value={performance.egress} />
            <Meter label="Public interface" value={performance.publicLife} />
            <Meter label="Program diversity" value={Math.min(100, performance.diversity * 25)} />

            <div
              className={`mx-3.5 mt-3 border-l-[3px] bg-[rgba(255,255,255,0.4)] p-2.5 ${
                egressLow ? "border-[#d6634e]" : "border-[#6f8250]"
              }`}
            >
              <b className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#171916]">{adviceTitle}</b>
              <p className="mt-1 text-[10px] leading-snug text-[#4b4e47]">{adviceCopy}</p>
            </div>
          </>
        )}
      </div>

      <div className={`flex border-t ${HAIRLINE}`}>
        <button
          type="button"
          onClick={() => run("building.duplicate", { id: building.id })}
          className={`flex flex-1 items-center justify-center gap-1.5 border-r py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#171916] transition hover:bg-[rgba(20,22,18,0.08)] ${HAIRLINE}`}
        >
          <span className="text-[13px] leading-none">＋</span> Grow sibling
        </button>
        <button
          type="button"
          onClick={() => run("site.demolish", { id: building.id })}
          className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#171916] transition hover:bg-[#ef715b] hover:text-[#eeeae0]"
        >
          <span className="text-[12px] leading-none">✕</span> Remove
        </button>
      </div>
    </Shell>
  );
}

function PlazaInspector({ plaza, run }: { plaza: Plaza; run: Run }): ReactNode {
  const kind = PLAZA_KINDS[plaza.kind];
  return (
    <Shell>
      <div className={`border-b px-3.5 pb-2.5 pt-3 ${HAIRLINE}`}>
        <span className={EYEBROW}>Selected public realm</span>
        <div className="mt-1 text-[15px] font-bold tracking-[-0.01em] text-[#171916]">{kind.label}</div>
      </div>
      <div className={`flex items-center gap-3 border-b px-3.5 py-2 ${HAIRLINE}`}>
        <ProgramTag program="civic" />
        <span className="text-[10px] text-[#6d7069]">{plaza.trees} canopy trees</span>
      </div>

      <div className="flex-1 overflow-y-auto pb-2">
        <LabelRow label="Civic landscape" hint="spatial character" />
        <div className="flex flex-col gap-1 px-3.5 py-1.5">
          {(Object.keys(PLAZA_KINDS) as PlazaKind[]).map((k) => (
            <CardButton
              key={k}
              active={plaza.kind === k}
              title={PLAZA_KINDS[k].label}
              description={PLAZA_KINDS[k].description}
              onClick={() => run("plaza.update", { id: plaza.id, patch: { kind: k }, capture: true })}
            />
          ))}
        </div>
        <Range
          label="Canopy density"
          value={plaza.trees}
          min={0}
          max={14}
          onChange={(v, c) => run("plaza.update", { id: plaza.id, patch: { trees: v }, capture: c })}
        />
        <LabelRow label="Ground performance" hint="live" />
        <div className="flex flex-col gap-1.5 px-3.5 py-1.5">
          <Meter label="Shade cover" value={plazaPerformance(plaza).shade} color="#6f8f5c" />
          <Meter label="Stormwater" value={plazaPerformance(plaza).water} color="#5f91aa" />
          <Meter label="Social charge" value={plazaPerformance(plaza).social} color="#d7a13f" />
        </div>
      </div>

      <div className={`flex border-t ${HAIRLINE}`}>
        <button
          type="button"
          onClick={() => run("site.demolish", { id: plaza.id })}
          className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#171916] transition hover:bg-[#ef715b] hover:text-[#eeeae0]"
        >
          <span className="text-[12px] leading-none">✕</span> Remove
        </button>
      </div>
    </Shell>
  );
}
