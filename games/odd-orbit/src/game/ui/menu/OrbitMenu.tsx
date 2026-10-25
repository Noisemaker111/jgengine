import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useDisplayProfile } from "@jgengine/react";
import { GameCursor } from "@jgengine/react/gameCursor";
import { GameFrame } from "@jgengine/react/gameFrame";
import { GameIcon, type GameIconName } from "@jgengine/react/gameIcons";
import { useViewportScrollLock } from "@jgengine/react/gameMenu";
import { useGame, useGameClock } from "@jgengine/react/hooks";
import { useMenuNav } from "@jgengine/react/menuNav";
import { useGameContext } from "@jgengine/react/provider";
import { useSaveSlots } from "@jgengine/react/saveSlots";
import { useStore } from "@jgengine/react/store";
import { EntityPreview } from "@jgengine/shell/render/EntityPreview";
import type { SaveSlotMeta } from "@jgengine/core/game/saveSlots";
import { creditsForSourceIds } from "@jgengine/assets/credits";
import { mergeCredits } from "@jgengine/core/game/credits";

import { ASSET_SOURCE_IDS } from "../../assets";
import { moodOfNeeds } from "../../agents";
import { AlienMesh } from "../../render/AlienMesh";
import { orbitSession } from "../../session/lifecycle";
import { householdStore } from "../../session/store";
import { ORBIT_SLOTS, orbitProfile, orbitSlotKey, readOrbitSave } from "../../session/save";
import { newOrbitSlot, openOrbitSlot, orbitSlotLabel, orbitSlots, refreshOrbitSlots, saveOrbitSlot, workingMember } from "../../menuSave";
import { AlienSwatch } from "../components/bits";
import { HouseSettings, type HousePreference } from "../fiction/HouseSettings";
import { Enamel, ENAMEL, navItem, OrbitWordmark, PaperNote, type EnamelTone } from "../fiction/kit";

/** Capture-only focus request: a shot declares which verb it wants highlighted. */
export const menuFocus: { id: string | null } = { id: null };

const credits = mergeCredits({
  sections: [
    { heading: "Original game art", entries: [{ label: "Odd Orbit", detail: "Original plan-derived household portraits and habitat interface." }] },
    { heading: "Engine", entries: [
      { label: "JG Engine", detail: "Apache-2.0", href: "https://github.com/Noisemaker111/jgengine" },
      { label: "React / Three.js", detail: "MIT" },
    ] },
  ],
}, creditsForSourceIds(ASSET_SOURCE_IDS));

export interface OrbitPreferences {
  calm: boolean;
  contrast: boolean;
}

type Prefs = { preferences: OrbitPreferences; onPreference: (key: keyof OrbitPreferences, value: boolean) => void };

function housePrefs({ preferences, onPreference }: Prefs): HousePreference[] {
  return [
    { id: "calm", label: "Calm interface", on: preferences.calm, set: (on) => onPreference("calm", on) },
    { id: "contrast", label: "Bolder panels", on: preferences.contrast, set: (on) => onPreference("contrast", on) },
  ];
}

/** The field guide, one line per rhythm of the day. */
const GUIDE: readonly { icon: GameIconName; title: string; line: string }[] = [
  { icon: "hourglass", title: "Share the day", line: "Yield works 08–14 for credits. Bloom tends 14–18 for rations. Three shifts open 08–18." },
  { icon: "buffArrow", title: "Grow a post", line: "Every shift earns standing. Rungs open at 3 and 9 standing; promote from a being's card." },
  { icon: "bread", title: "Keep a pantry", line: "Meals use rations: six cost 36 credits. The habitat bill lands at midnight." },
  { icon: "feather", title: "Make room to rest", line: "Work raises stress. Burnout stops pay until Nourish and Rest pass 50." },
  { icon: "heart", title: "Build bonds", line: "Friends keep each other company. A bonded pair never works apart." },
];

function GuidePage(): ReactNode {
  return (
    <div className="orbit-guide" data-field-guide="">
      <h2>Caring for a strange household</h2>
      {GUIDE.map((step) => (
        <div key={step.title} className="orbit-guide-step">
          <span className="orbit-guide-icon"><GameIcon name={step.icon} size={22} /></span>
          <div><strong>{step.title}</strong><span>{step.line}</span></div>
        </div>
      ))}
    </div>
  );
}

function CreditsPage(): ReactNode {
  return (
    <div className="orbit-credits">
      <h2>Credits</h2>
      {credits.sections.map((section) => (
        <section key={section.heading}>
          <h3>{section.heading}</h3>
          {section.entries.map((entry) => <p key={`${entry.label}-${entry.detail ?? ""}`}><strong>{entry.label}</strong>{entry.detail ? <span> · {entry.detail}</span> : null}</p>)}
        </section>
      ))}
      {credits.notice && <p className="orbit-credits-notice">{credits.notice}</p>}
    </div>
  );
}

/**
 * Odd Orbit's front end. The title is the habitat's porch: an enamel house sign hanging over the
 * living habitat, the verbs as enamel door plates, and a note pinned beside them for whatever the
 * highlighted plate opens. Pause is the household handbook lying open on the floor plan.
 */
export function OrbitMenu(props: Prefs): ReactNode {
  const session = useStore(orbitSession);
  const [busy, setBusy] = useState<string | null>(null);
  const whileLoading = useCallback(async (label: string, work: () => Promise<unknown>) => {
    setBusy(label);
    try { await Promise.all([work(), new Promise((resolve) => setTimeout(resolve, 260))]); }
    finally { setBusy(null); }
  }, []);
  useViewportScrollLock(session.screen !== null);
  return (
    <div className="orbit-menu">
      {session.screen === "menu" && <PorchTitle {...props} whileLoading={whileLoading} />}
      {session.screen === "paused" && <Handbook {...props} whileLoading={whileLoading} />}
      {busy !== null && <div className="orbit-menu-busy" role="status" aria-live="polite"><Enamel tone="butter" radius={14} padding="10px 18px">{busy}</Enamel></div>}
    </div>
  );
}

type Loader = (label: string, work: () => Promise<unknown>) => Promise<void>;

interface Plate { id: string; label: string; icon: GameIconName; tone: EnamelTone; disabled?: boolean; hint?: string }

function PorchTitle({ preferences, onPreference, whileLoading }: Prefs & { whileLoading: Loader }): ReactNode {
  const ctx = useGameContext();
  const household = useStore(householdStore);
  const session = useStore(orbitSession);
  const profile = useDisplayProfile();
  const slots = useSaveSlots(orbitSlots);
  const [name, setName] = useState(orbitProfile.name);
  const [notice, setNotice] = useState<string | null>(null);
  const [inSettings, setInSettings] = useState(false);
  const [sheet, setSheet] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  useEffect(() => { setName(orbitProfile.name); refreshOrbitSlots(); }, []);
  const recent = orbitSlots.mostRecent();
  const emptySlot = slots.find((slot) => slot.empty)?.id ?? ORBIT_SLOTS[0];
  const kept = slots.filter((slot) => !slot.empty).length;
  const compact = profile.compact;

  const plates: Plate[] = [
    { id: "continue", label: "Continue", icon: "arrowRight", tone: "mint", disabled: recent === null, hint: recent === null ? "Nobody lives here yet" : (recent.name ?? orbitSlotLabel(recent.id)) },
    { id: "new", label: "Move in", icon: "key", tone: "pink", hint: `Into ${orbitSlotLabel(emptySlot)}` },
    { id: "careers", label: "Households", icon: "pin", tone: "butter", hint: `${kept} of ${slots.length} kept` },
    { id: "guide", label: "Field guide", icon: "eye", tone: "sky", hint: "Shifts, posts, bonds" },
    { id: "settings", label: "Settings", icon: "gear", tone: "lilac", hint: "Sound, picture, keys" },
    { id: "credits", label: "Credits", icon: "star", tone: "cream" },
  ];

  const openCareer = (slot: string) => whileLoading("Opening the front door", async () => {
    if (!openOrbitSlot(ctx, slot)) setNotice(`${orbitSlotLabel(slot)} is empty.`);
    else setName(orbitProfile.name);
  });
  const startCareer = () => void whileLoading("Moving the household in", async () => { newOrbitSlot(ctx, emptySlot, name); });

  const confirm = (id: string) => {
    if (id === "continue" && recent !== null) { void openCareer(recent.id); return; }
    if (id === "careers") refreshOrbitSlots();
    if (compact) setSheet(true);
    if (id === "new") requestAnimationFrame(() => nameField.current?.focus());
    if (id === "settings") setInSettings(true);
  };
  const nav = useMenuNav({
    ids: plates.map((plate) => plate.id),
    disabled: plates.filter((plate) => plate.disabled).map((plate) => plate.id),
    initialId: menuFocus.id ?? (recent === null ? "new" : "continue"),
    enabled: !inSettings && !(compact && sheet),
    onConfirm: confirm,
    onBack: compact && sheet ? () => setSheet(false) : undefined,
  });
  const active = nav.activeId ?? "new";
  useEffect(() => { if (active !== "settings") setInSettings(false); if (active === "careers") refreshOrbitSlots(); }, [active]);

  const note = (() => {
    if (active === "continue") {
      const saved = recent === null ? null : readOrbitSave(undefined, recent.id).save;
      const member = saved === null ? null : workingMember(saved.household);
      const thumb = recent?.meta.thumbnail;
      if (recent === null || saved === null) {
        return <div className="orbit-note-body" data-continue-shift=""><h2>Nobody lives here yet</h2><p>{session.saveStatus === "damaged" ? "The saved household is unreadable. Moving in replaces it." : session.saveStatus === "unavailable" ? "This browser cannot keep a household." : "Move a household in, work a shift, then save from the handbook."}</p></div>;
      }
      return (
        <div className="orbit-note-body" data-continue-shift="">
          <PortraitFrame thumb={typeof thumb === "string" ? thumb : null} />
          <h2>{recent.name ?? orbitSlotLabel(recent.id)}</h2>
          <div className="orbit-stamps">
            <Stamp icon="hourglass" text={String(recent.meta.day ?? "")} />
            <Stamp icon="coin" text={`${saved.household.credits}`} />
            <Stamp icon="bread" text={`${saved.household.pantry}`} />
          </div>
          <p>{member === null ? "Saved between shifts." : `${member.name} is on the ${member.lifestyle === "yield" ? "Yield" : "Bloom"} shift.`}</p>
          <Enamel as="button" tone="mint" radius={16} padding="10px 22px" className="orbit-note-action" onClick={() => void openCareer(recent.id)}>
            <GameIcon name="arrowRight" size={18} /> Open the door
          </Enamel>
        </div>
      );
    }
    if (active === "new") {
      return (
        <div className="orbit-note-body" data-new-career-pane="">
          <h2>Moving-in card</h2>
          <label className="orbit-name-line">
            <span>Household name</span>
            <input ref={nameField} data-new-career-name="" value={name} maxLength={40} placeholder="The ..." onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); startCareer(); } }} />
          </label>
          <div className="orbit-stamps">
            <Stamp icon="coin" text="640" />
            <Stamp icon="bread" text="12" />
            <Stamp icon="heart" text="4 beings" />
          </div>
          <p className="orbit-note-fine">{emptySlot !== null ? `Into ${orbitSlotLabel(emptySlot)}.` : "Every room is full; Households can clear one."}</p>
          <Enamel as="button" tone="pink" radius={16} padding="10px 22px" className="orbit-note-action" data-new-career-start="" disabled={emptySlot === null} onClick={startCareer}>
            <GameIcon name="key" size={18} /> Move in
          </Enamel>
        </div>
      );
    }
    if (active === "careers") {
      return (
        <div className="orbit-note-body">
          <h2>Households</h2>
          <div className="orbit-polaroids">
            {slots.map((slot, i) => <Polaroid key={slot.id} slot={slot} tilt={[-2, 1.5, -1][i % 3]!}
              onOpen={() => void openCareer(slot.id)}
              onNew={() => newOrbitSlot(ctx, slot.id, name)}
              onClear={() => void whileLoading("Clearing the household", async () => {
                window.localStorage.removeItem(orbitSlotKey(slot.id));
                refreshOrbitSlots();
                setNotice(`${orbitSlotLabel(slot.id)} is clear.`);
              })} />)}
          </div>
        </div>
      );
    }
    if (active === "guide") return <div className="orbit-note-body"><GuidePage /></div>;
    if (active === "settings") {
      return (
        <div className="orbit-note-body" data-orbit-settings="" onPointerDown={() => setInSettings(true)}>
          <h2>Settings</h2>
          <HouseSettings active={inSettings} onBack={() => setInSettings(false)} preferences={housePrefs({ preferences, onPreference })} />
        </div>
      );
    }
    return <div className="orbit-note-body"><CreditsPage /></div>;
  })();

  const showNote = !compact || sheet;
  return (
    <div className={`orbit-title ${compact ? "compact" : ""}`} role="dialog" aria-label="Odd Orbit">
      <div className="orbit-title-vignette" aria-hidden="true" />
      <div className="orbit-porch" hidden={compact && sheet}>
        <div className="orbit-sign-wrap">
          <span className="orbit-chain left" aria-hidden="true" /><span className="orbit-chain right" aria-hidden="true" />
          <Enamel tone="cream" radius={28} edgeWidth={3} padding={compact ? "16px 22px 14px" : "22px 34px 18px"} className="orbit-sign">
            <OrbitWordmark />
            <span className="orbit-sign-plaque">a home for four strange beings</span>
          </Enamel>
        </div>
        <nav className="orbit-plates" aria-label="Front door" {...nav.containerProps}>
          {plates.map((plate, i) => (
            <Enamel key={plate.id} as="button" tone={plate.tone} radius={16} padding="0" disabled={plate.disabled}
              className="orbit-plate" style={{ rotate: `${[-1.2, 0.8, -0.5, 1, -0.8, 0.6][i]}deg` }}
              {...navItem(nav.itemProps(plate.id))} onClick={() => { nav.setActive(plate.id); confirm(plate.id); }}>
              <span className="orbit-plate-row">
                <span className="orbit-plate-icon"><GameIcon name={plate.icon} size={20} /></span>
                <span className="orbit-plate-label">{plate.label}</span>
                {plate.hint && active === plate.id && <span className="orbit-plate-hint">{plate.hint}</span>}
              </span>
            </Enamel>
          ))}
          <GameCursor variant="chevron" color="#ffd98a" gap={8} thickness={4} />
        </nav>
      </div>
      {showNote && (
        <div className="orbit-title-note">
          {compact && <Enamel as="button" tone="plum" radius={14} padding="8px 14px" className="orbit-sheet-back" onClick={() => { setSheet(false); setInSettings(false); }}><GameIcon name="arrowLeft" size={16} /> Porch</Enamel>}
          <PaperNote tilt={compact ? 0 : 1.2} torn={!compact} pin={ENAMEL.pink} className="orbit-title-paper">{note}</PaperNote>
        </div>
      )}
      <p className="orbit-title-foot">{notice ?? `${orbitSlotLabel(session.slot)} · ${household.credits} credits · ${household.pantry} rations · ${household.order.length} beings`}</p>
    </div>
  );
}

function Stamp({ icon, text }: { icon: GameIconName; text: string }): ReactNode {
  return <span className="orbit-stamp"><GameIcon name={icon} size={16} />{text}</span>;
}

/** A household's saved frame, hung in a little wooden portrait frame. */
function PortraitFrame({ thumb }: { thumb: string | null }): ReactNode {
  return (
    <GameFrame material="wood" cut="box" padding="8px" edge="#2b160a" className="orbit-portrait-frame">
      {thumb !== null ? <img src={thumb} alt="The household as it was left" /> : <span className="orbit-portrait-empty"><GameIcon name="eye" size={28} /></span>}
    </GameFrame>
  );
}

function Polaroid({ slot, tilt, onOpen, onNew, onClear }: { slot: SaveSlotMeta; tilt: number; onOpen: () => void; onNew: () => void; onClear: () => void }): ReactNode {
  const thumb = slot.meta.thumbnail;
  return (
    <div className="orbit-polaroid" style={{ rotate: `${tilt}deg` }}>
      <GameFrame material="paper" cut="box" padding="8px 8px 10px" edge="#6b4c3a" edgeWidth={1}>
        <span className="orbit-polaroid-shot">{typeof thumb === "string" ? <img src={thumb} alt="" /> : <GameIcon name={slot.empty ? "key" : "eye"} size={26} />}</span>
        <strong>{slot.empty ? orbitSlotLabel(slot.id) : (slot.name ?? orbitSlotLabel(slot.id))}</strong>
        <small>{slot.empty ? "Empty rooms" : `${slot.meta.day ?? ""} · ${slot.meta.credits ?? ""}`}</small>
        <span className="orbit-polaroid-actions">
          {slot.empty
            ? <Enamel as="button" tone="pink" radius={10} padding="4px 10px" onClick={onNew}>Move in</Enamel>
            : <>
                <Enamel as="button" tone="mint" radius={10} padding="4px 10px" onClick={onOpen}>Open</Enamel>
                <Enamel as="button" tone="coral" radius={10} padding="4px 10px" onClick={onClear} aria-label={`Clear ${orbitSlotLabel(slot.id)}`}><GameIcon name="cross" size={14} /></Enamel>
              </>}
        </span>
      </GameFrame>
    </div>
  );
}

interface Chapter { id: string; label: string; icon: GameIconName; page: string }

/** The pause menu: the household handbook, open to today's page. */
function Handbook({ preferences, onPreference, whileLoading }: Prefs & { whileLoading: Loader }): ReactNode {
  const ctx = useGameContext();
  const { commands } = useGame();
  const household = useStore(householdStore);
  const session = useStore(orbitSession);
  const profile = useDisplayProfile();
  const [notice, setNotice] = useState<string | null>(null);
  const [inSettings, setInSettings] = useState(false);
  const [leaf, setLeaf] = useState(false);
  const compact = profile.compact;
  const slotLabel = orbitSlotLabel(session.slot);
  const chapters: Chapter[] = [
    { id: "resume", label: "Back to the household", icon: "arrowLeft", page: "1" },
    { id: "save", label: `Save to ${slotLabel}`, icon: "pin", page: "2" },
    { id: "guide", label: "Field guide", icon: "eye", page: "3" },
    { id: "settings", label: "Settings", icon: "gear", page: "8" },
    { id: "credits", label: "Credits", icon: "star", page: "12" },
    { id: "title", label: "Save & step outside", icon: "key", page: "—" },
  ];
  const close = () => commands.run("orbit.resume", {});
  const saveHere = () => whileLoading("Writing the household down", async () => {
    const written = await saveOrbitSlot(ctx);
    setNotice(written ? `Written into ${slotLabel}` : "This browser could not keep the household");
  });
  const confirm = (id: string) => {
    if (id === "resume") close();
    else if (id === "save") void saveHere();
    else if (id === "title") void whileLoading("Writing the household down", async () => { await saveOrbitSlot(ctx); commands.run("orbit.title", {}); });
    else {
      if (compact) setLeaf(true);
      if (id === "settings") setInSettings(true);
    }
  };
  const nav = useMenuNav({
    ids: chapters.map((c) => c.id),
    initialId: menuFocus.id ?? "resume",
    enabled: !inSettings && !(compact && leaf),
    onConfirm: confirm,
    onBack: compact && leaf ? () => setLeaf(false) : close,
  });
  const active = nav.activeId ?? "resume";
  useEffect(() => { if (active !== "settings") setInSettings(false); }, [active]);
  const working = workingMember(household);
  const featured = working?.id ?? household.order[0] ?? null;
  const entity = featured === null ? null : ctx.scene.entity.get(featured);
  const clock = useGameClock();
  const hour = Math.floor(clock.calendar.hour);
  const minute = clock.calendar.minute;

  const rightPage = (() => {
    if (active === "guide") return <GuidePage />;
    if (active === "settings") return <div data-orbit-settings="" onPointerDown={() => setInSettings(true)}><h2>Settings</h2><HouseSettings active={inSettings} onBack={() => { setInSettings(false); if (compact) setLeaf(false); }} preferences={housePrefs({ preferences, onPreference })} /></div>;
    if (active === "credits") return <CreditsPage />;
    if (active === "save") return <div className="orbit-page-note"><h2>Write today down</h2><p>The household, its beings and their shift go into {slotLabel}.</p>{notice && <span className="orbit-ink-stamp">{notice}</span>}</div>;
    if (active === "title") return <div className="orbit-page-note"><h2>Step outside</h2><p>The handbook saves the household, then you are back on the porch.</p></div>;
    return (
      <div className="orbit-page-note">
        <h2>Everyone is waiting</h2>
        <div className="orbit-roll">
          {household.order.map((id) => {
            const member = household.members[id];
            if (member === undefined) return null;
            const mood = moodOfNeeds(member.needs);
            return <div key={id} className="orbit-roll-line"><AlienSwatch plan={member.bodyPlan} size={34} /><strong>{member.name}</strong><span>{mood.label}</span></div>;
          })}
        </div>
        {notice && <span className="orbit-ink-stamp">{notice}</span>}
      </div>
    );
  })();

  const showLeft = !compact || !leaf;
  const showRight = !compact || leaf;
  return (
    <div className={`orbit-pause ${compact ? "compact" : ""}`} role="dialog" aria-label="The household is paused">
      <div className="orbit-pause-dim" aria-hidden="true" />
      <div className="orbit-book">
        <GameFrame material="leather" cut="box" padding={compact ? "10px" : "14px"} edge="#24110a" className="orbit-book-cover">
          <div className="orbit-book-pages">
            {showLeft && (
              <GameFrame material="paper" cut="box" padding={compact ? "18px 18px 16px" : "26px 30px 22px"} edge="none" className="orbit-page left">
                <span className="orbit-page-eyebrow">Household handbook · {slotLabel}</span>
                <h1>Day {household.day + 1}<small>{String(hour).padStart(2, "0")}:{String(minute).padStart(2, "0")}</small></h1>
                {entity !== null && (
                  <div className="orbit-family-portrait">
                    <GameFrame material="wood" cut="box" padding="6px" edge="#2b160a">
                      <EntityPreview mood="studio" environment={false} cameraPosition={[0, 0.25, 3.7]} fov={30} dpr={[1, 1.5]} faceCamera className="orbit-portrait-canvas">
                        <group position={[0, -0.85, 0]}><AlienMesh entity={entity} /></group>
                      </EntityPreview>
                    </GameFrame>
                    <span className="orbit-portrait-caption">{working !== null ? `${working.name} is on shift` : "Between shifts"}</span>
                  </div>
                )}
                <nav className="orbit-index" aria-label="Handbook" {...nav.containerProps}>
                  {chapters.map((chapter) => (
                    <button key={chapter.id} type="button" className="orbit-index-line" {...navItem(nav.itemProps(chapter.id))} onClick={() => { nav.setActive(chapter.id); confirm(chapter.id); }}>
                      <GameIcon name={chapter.icon} size={18} />
                      <span>{chapter.label}</span>
                      <i aria-hidden="true" />
                      <em>{chapter.page}</em>
                    </button>
                  ))}
                  <GameCursor variant="chevron" color="#c2477f" gap={2} />
                </nav>
              </GameFrame>
            )}
            {showRight && (
              <GameFrame material="paper" cut="box" padding={compact ? "18px 18px 16px" : "26px 30px 22px"} edge="none" className="orbit-page right">
                {compact && <button type="button" className="orbit-leaf-back" onClick={() => { setLeaf(false); setInSettings(false); }}><GameIcon name="arrowLeft" size={16} /> Contents</button>}
                {rightPage}
              </GameFrame>
            )}
          </div>
        </GameFrame>
        <span className="orbit-ribbon" aria-hidden="true" />
      </div>
      <p className="orbit-pause-foot">{household.credits} credits · {household.pantry} rations · {household.debt} debt</p>
    </div>
  );
}
