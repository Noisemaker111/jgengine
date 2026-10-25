import { createElement, useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import type { SaveSlotMeta } from "@jgengine/core/game/saveSlots";
import { GameCursor } from "@jgengine/react/gameCursor";
import { GameFrame, gameCutPath } from "@jgengine/react/gameFrame";
import { GameIcon } from "@jgengine/react/gameIcons";
import { useViewportScrollLock } from "@jgengine/react/gameMenu";
import { useMenuNav, type MenuNavItemProps } from "@jgengine/react/menuNav";
import { EntityPreview } from "@jgengine/shell/render/EntityPreview";
import { IsolatedEntityModel } from "@jgengine/shell/render/SceneModels";
import { entityModels } from "../../world/models";
import { tribuneAds } from "../../credits";
import { BurnerPhone, type PhonePad } from "../fiction/BurnerPhone";
import { HH, KeyLegend, navItem, useMenuSound, useMoveTick, useRoom } from "../fiction/kit";
import { PhoneSettings, type SettingsPad } from "../fiction/PhoneSettings";

export interface TitleItem {
  id: "continue" | "new" | "keeps" | "settings" | "credits";
  label: string;
  hint?: string;
  disabled?: boolean;
}

/** A stable small wobble per letter, so the marquee letters sit a little crooked on their rails. */
function wobble(seed: number): CSSProperties {
  const n = Math.sin(seed * 12.9898) * 43758.5453;
  const r = n - Math.floor(n);
  return { "--hh-tilt": `${((r - 0.5) * 5).toFixed(2)}deg`, "--hh-drop": `${((r * 7) % 1 * 3 - 1).toFixed(1)}px` } as CSSProperties;
}

/** A word in changeable marquee letters: every character its own black plastic tile. */
function MarqueeLetters({ text, seed }: { text: string; seed: number }) {
  const words = text.split(" ");
  let at = seed * 31;
  return (
    <span className="hh-letters">
      {words.map((word, w) => (
        <span key={w} className="hh-word">
          {[...word].map((ch, i) => <i key={i} style={wobble((at += 1))}>{ch}</i>)}
          {w < words.length - 1 ? " " : null}
        </span>
      ))}
    </span>
  );
}

/** The roadside sign's neon: two words in glass tube over an enamel box ringed with chaser bulbs. */
export function NeonSign({ small = false }: { small?: boolean }) {
  return (
    <GameFrame material="enamel" tint="#0b3742" cut="chamfer" depth={small ? 12 : 20} edge={HH.cream} edgeWidth={small ? 3 : 4} padding="0" className={`hh-sign-box ${small ? "small" : ""}`}>
      <i className="hh-bulbs top" aria-hidden="true" />
      <i className="hh-bulbs bottom" aria-hidden="true" />
      <i className="hh-bulbs left" aria-hidden="true" />
      <i className="hh-bulbs right" aria-hidden="true" />
      <span className="hh-sign-inner">
        <span className="hh-sign-kicker">Mainsail · Gulf coast</span>
        <span className="hh-neon amber" data-text="Harbor">Harbor</span>
        <span className="hh-neon coral" data-text="Heat">Heat</span>
        <svg className="hh-neon-palm" viewBox="0 0 80 110" aria-hidden="true">
          <g className="glow">
            <path d="M40 106 C 42 80 44 58 40 34" />
            <path d="M40 34 C 30 20 16 18 4 26" />
            <path d="M40 34 C 46 18 60 14 74 20" />
            <path d="M40 34 C 26 30 18 40 14 52" />
            <path d="M40 34 C 54 30 64 38 68 50" />
            <path d="M40 34 C 38 22 40 10 48 4" />
          </g>
          <g className="tube">
            <path d="M40 106 C 42 80 44 58 40 34" />
            <path d="M40 34 C 30 20 16 18 4 26" />
            <path d="M40 34 C 46 18 60 14 74 20" />
            <path d="M40 34 C 26 30 18 40 14 52" />
            <path d="M40 34 C 54 30 64 38 68 50" />
            <path d="M40 34 C 38 22 40 10 48 4" />
          </g>
        </svg>
      </span>
    </GameFrame>
  );
}

/**
 * The title as a Mainsail roadside sign at dusk: the HARBOR HEAT neon on an enamel box ringed with
 * chaser bulbs, and under it the motel-style marquee letter board where tonight's choices are spelled
 * out in black plastic letters. Each choice opens its own object beside the sign: the parcel tag of
 * the last run, a courier licence to sign, the three dispatch bays' tags, the burner phone's settings
 * and a Tribune clipping of credits.
 */
export function HarborTitle({
  items,
  initialId,
  detail,
  notice,
}: {
  items: readonly TitleItem[];
  initialId: string;
  /** Draws the object for a choice; `active` while the player is working inside it. */
  detail: (id: TitleItem["id"], active: boolean, back: () => void) => ReactNode;
  notice: string;
}) {
  const sound = useMenuSound();
  const room = useRoom();
  const compact = room !== "wide";
  const stacked = room === "stacked";
  useViewportScrollLock(true);
  const [entered, setEntered] = useState<TitleItem["id"] | null>(null);
  const back = () => {
    sound.play("back");
    setEntered(null);
  };
  const confirm = (id: string) => {
    const item = items.find((entry) => entry.id === id);
    if (item === undefined || item.disabled === true) return;
    sound.play("confirm");
    setEntered(item.id);
  };
  const nav = useMenuNav({
    ids: items.map((item) => item.id),
    disabled: items.filter((item) => item.disabled === true).map((item) => item.id),
    initialId,
    enabled: entered === null,
    onConfirm: confirm,
  });
  useMoveTick(nav.activeId, entered === null);
  const shown = (entered ?? (stacked ? null : nav.activeId)) as TitleItem["id"] | null;

  return (
    <div className={`hh-title ${stacked ? "compact" : ""} ${room === "short" ? "short" : ""}`} data-entered={entered ?? undefined}>
      <i className="hh-title-dusk" aria-hidden="true" />
      <section className="hh-sign-col" aria-label="Harbor Heat">
        <NeonSign small={compact} />
        <i className="hh-sign-posts" aria-hidden="true"><b /><b /></i>
        {stacked && entered !== null ? null : (
          <nav className="hh-marquee" aria-label="Title menu" {...nav.containerProps}>
            <span className="hh-marquee-cap">Tonight on the coast</span>
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className="hh-marquee-row"
                aria-label={item.label}
                aria-disabled={item.disabled === true ? "true" : undefined}
                data-active={nav.activeId === item.id ? "" : undefined}
                {...navItem(nav.itemProps(item.id))}
                onClick={() => {
                  nav.setActive(item.id);
                  confirm(item.id);
                }}
              >
                <MarqueeLetters text={item.label} seed={index + 1} />
                {item.hint === undefined ? null : <small>{item.hint}</small>}
              </button>
            ))}
            <GameCursor variant="chevron" color={HH.coral} gap={10} thickness={4} arm={18} />
          </nav>
        )}
      </section>
      {shown === null ? null : (
        <section
          className="hh-title-detail"
          data-detail={shown}
          onPointerDown={() => {
            if (entered !== shown) setEntered(shown);
          }}
        >
          {stacked ? (
            <button type="button" className="hh-title-back" onClick={back}>
              <GameIcon name="arrowLeft" size={16} /> Back to the sign
            </button>
          ) : null}
          {detail(shown, entered === shown, back)}
        </section>
      )}
      <footer className="hh-title-foot">
        <span className="hh-title-notice" role="status">{notice}</span>
        {compact ? null : (
          <KeyLegend items={[{ keys: ["↑", "↓"], label: "move" }, { keys: ["Enter"], label: "select" }, { keys: ["Esc"], label: "back" }]} />
        )}
      </footer>
    </div>
  );
}

/** A small enamel press-button for tags and cards. */
export function StampButton({ children, tone = "coral", onClick, disabled, className, ref, ...rest }: { children: ReactNode; tone?: "coral" | "teal" | "ink"; onClick?: () => void; disabled?: boolean; className?: string; ref?: Ref<HTMLElement> } & Record<`data-${string}` | `aria-${string}`, unknown> & Partial<Omit<MenuNavItemProps, "ref">>) {
  const tint = tone === "coral" ? HH.coral : tone === "teal" ? HH.teal : HH.ink;
  return (
    <GameFrame ref={ref as never} as="button" material="enamel" tint={tint} cut="slant" depth={10} edge={HH.night} edgeWidth={2} padding="8px 20px 7px" className={`hh-stamp-btn ${className ?? ""}`} disabled={disabled} onClick={onClick} {...rest}>
      {children}
    </GameFrame>
  );
}

/** The last run's parcel tag, with the frame its courier left and the button that picks it up. */
export function ContinueTag({ slot, bayLabel, active, onContinue }: { slot: SaveSlotMeta | null; bayLabel: string; active: boolean; onContinue: () => void }) {
  const nav = useMenuNav({ ids: ["go"], enabled: active && slot !== null, onConfirm: onContinue });
  return (
    <GameFrame material="paper" tint="#f7ead0" cut="ticket" depth={18} edge="#3a2a18" edgeWidth={2} padding="0" className="hh-tag hh-tag-wide">
      <i className="hh-tag-hole" aria-hidden="true" />
      <span className="hh-tag-head"><span>Mainsail express</span><b>Parcel tag</b></span>
      {slot === null ? (
        <span className="hh-tag-empty">
          <b>No run on the board</b>
          <small>Take a run, then save it at the board.</small>
        </span>
      ) : (
        <span className="hh-tag-body" {...nav.containerProps}>
          <Snapshot src={typeof slot.meta.thumbnail === "string" ? slot.meta.thumbnail : null} />
          <span className="hh-tag-fields">
            <span className="hh-tag-name">{slot.name ?? "Courier"}</span>
            <span className="hh-tag-row"><small>Bay</small><b>{bayLabel}</b></span>
            <span className="hh-tag-row"><small>On the road</small><b>{String(slot.meta.playtime ?? "0m")}</b></span>
            <span className="hh-tag-row"><small>Parcels</small><b>{String(slot.meta.parcels ?? 0)}</b></span>
            <StampButton data-harbor-continue="" {...navItem(nav.itemProps("go"))} onClick={onContinue}>Pick it up</StampButton>
          </span>
        </span>
      )}
      {active && slot !== null ? <GameCursor variant="brackets" color={HH.coral} /> : null}
    </GameFrame>
  );
}

/** A courier frame stapled to a tag, or a stencilled blank where none was kept. */
function Snapshot({ src }: { src: string | null }) {
  return (
    <span className="hh-snap" aria-hidden="true">
      {src === null ? <span className="hh-snap-blank"><GameIcon name="map" size={36} /></span> : <img src={src} alt="" />}
      <i className="hh-snap-staple" />
    </span>
  );
}

/** The courier licence: a photo of the runner, the name you sign, the bay the run goes in. */
export function CourierLicence({ name, onName, bayLabel, active, onBegin }: { name: string; onName: (next: string) => void; bayLabel: string; active: boolean; onBegin: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const nav = useMenuNav({ ids: ["go"], enabled: active, onConfirm: onBegin });
  const touch = useRoom() !== "wide";
  useEffect(() => {
    // On a desk the name field takes the keyboard at once; on a phone it waits for a tap so the
    // on-screen keyboard does not cover the licence.
    if (active && !touch) input.current?.focus();
  }, [active, touch]);
  const model = entityModels.street_runner;
  return (
    <GameFrame material="paper" tint="#f3e7cc" cut="notch" depth={18} edge={HH.ink} edgeWidth={3} padding="0" className="hh-licence" data-new-dispatch-pane="">
      <span className="hh-licence-band"><span>Mainsail express</span><b>Courier licence</b></span>
      <span className="hh-licence-body">
        <span className="hh-licence-photo">
          {model === undefined ? null : (
            // The preview camera aims at the stage origin, so the runner is lowered until the head and
            // shoulders sit there: a licence photo, not a full-length shot.
            <EntityPreview mood="studio" backdrop="#c9d6cf" environment={false} cameraPosition={[0, 0.02, 2.3]} fov={28} dpr={[1, 1.25]} className="hh-licence-canvas">
              {createElement("group", { position: [0, -1.42, 0] }, <IsolatedEntityModel model={model} />)}
            </EntityPreview>
          )}
          <i className="hh-licence-scale" aria-hidden="true" />
        </span>
        <span className="hh-licence-fields">
          <label className="hh-licence-field">
            <small>Courier name</small>
            <input
              ref={input}
              data-new-dispatch-name=""
              value={name}
              maxLength={24}
              spellCheck={false}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => onName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onBegin();
                }
              }}
            />
          </label>
          <span className="hh-licence-meta"><small>Bay</small><b>{bayLabel}</b></span>
          <span className="hh-licence-meta"><small>Pays</small><b>Cash · cred</b></span>
          <span {...nav.containerProps}>
            <StampButton data-new-dispatch-start="" {...navItem(nav.itemProps("go"))} onClick={onBegin}>Take the run</StampButton>
          </span>
        </span>
      </span>
      <span className="hh-licence-stamp" aria-hidden="true">Valid · Mainsail</span>
    </GameFrame>
  );
}

/** The bay's verb and its chips are cut on a slant like the stamp buttons, at a smaller depth. */
const VERB_CUT: CSSProperties = { clipPath: gameCutPath("slant", 8) };
const CHIP_CUT: CSSProperties = { clipPath: gameCutPath("slant", 6) };

/** One dispatch bay's tag: who is kept there, how long they've run, and what you can do with it. */
export function BayTags({ bays, labels, active, onLoad, onNew, onClear }: {
  bays: readonly SaveSlotMeta[];
  labels: Record<string, string>;
  active: boolean;
  onLoad: (slot: SaveSlotMeta) => void;
  onNew: (slot: SaveSlotMeta) => void;
  onClear: (slot: SaveSlotMeta) => void;
}) {
  const sound = useMenuSound();
  const stacked = useRoom() === "stacked";
  const [arming, setArming] = useState<string | null>(null);
  const nav = useMenuNav({
    ids: bays.map((bay) => bay.id),
    columns: stacked ? 1 : bays.length,
    enabled: active,
    onConfirm: (id) => {
      const bay = bays.find((entry) => entry.id === id);
      if (bay === undefined) return;
      sound.play("confirm");
      if (bay.empty) onNew(bay);
      else onLoad(bay);
    },
  });
  useMoveTick(nav.activeId, active);
  return (
    <div className="hh-bays" {...nav.containerProps}>
      {bays.map((bay, index) => (
        <GameFrame
          key={bay.id}
          as="button"
          material="paper"
          tint={bay.empty ? "#e9dcc0" : "#f7ead0"}
          cut="ticket"
          depth={14}
          edge="#3a2a18"
          edgeWidth={2}
          padding="0"
          className="hh-tag hh-bay"
          data-empty={bay.empty ? "" : undefined}
          data-save-slot-load={bay.empty ? undefined : bay.id}
          aria-label={bay.empty ? `${labels[bay.id] ?? bay.id}: empty bay, start a run` : `${labels[bay.id] ?? bay.id}: load ${bay.name ?? "courier"}`}
          {...navItem(nav.itemProps(bay.id))}
          onClick={() => {
            nav.setActive(bay.id);
            if (bay.empty) onNew(bay);
            else onLoad(bay);
          }}
        >
          <i className="hh-tag-hole" aria-hidden="true" />
          <span className="hh-tag-head"><span>Bay {index + 1}</span><b>{labels[bay.id] ?? bay.id}</b></span>
          <Snapshot src={typeof bay.meta.thumbnail === "string" ? bay.meta.thumbnail : null} />
          {bay.empty ? (
            <span className="hh-bay-empty">Empty bay</span>
          ) : (
            <span className="hh-bay-info">
              <b>{bay.name ?? "Courier"}</b>
              <small>{String(bay.meta.playtime ?? "0m")} · {String(bay.meta.parcels ?? 0)} parcels</small>
            </span>
          )}
          <span className="hh-bay-verb" style={VERB_CUT}>{bay.empty ? "Start here" : "Load"}</span>
        </GameFrame>
      ))}
      <span className="hh-bay-tools">
        {bays.filter((bay) => !bay.empty).map((bay) => (
          <span key={bay.id} className="hh-bay-tool">
            <small>{labels[bay.id] ?? bay.id}</small>
            <button type="button" className="hh-chip" style={CHIP_CUT} onClick={() => onNew(bay)}>New run here</button>
            <button
              type="button"
              className="hh-chip danger"
              style={CHIP_CUT}
              data-armed={arming === bay.id ? "" : undefined}
              onClick={() => {
                if (arming !== bay.id) {
                  setArming(bay.id);
                  return;
                }
                setArming(null);
                onClear(bay);
              }}
            >
              {arming === bay.id ? "Sure? Clear it" : "Clear"}
            </button>
          </span>
        ))}
      </span>
      {active ? <GameCursor variant="brackets" color={HH.coral} /> : null}
    </div>
  );
}

/** The settings, on the same burner phone the pause menu uses. */
export function TitlePhone({ active, onBack }: { active: boolean; onBack: () => void }) {
  const [pad, setPad] = useState<SettingsPad | null>(null);
  const phonePad: PhonePad = {
    up: () => pad?.move("up"),
    down: () => pad?.move("down"),
    left: () => pad?.adjust(-1),
    right: () => pad?.adjust(1),
    ok: () => pad?.confirm(),
  };
  return (
    <BurnerPhone label="Settings" app="Settings" className="hh-title-phone" softLeft={{ label: "Select", run: () => pad?.confirm() }} softRight={{ label: "Back", run: onBack }} pad={phonePad} keypad={false}>
      <PhoneSettings active={active} onBack={onBack} onPad={setPad} />
    </BurnerPhone>
  );
}

/** Credits as a clipping from the Mainsail Tribune's back page. */
export function TribuneCredits() {
  const assets = tribuneAds();
  return (
    <GameFrame material="paper" tint="#efe6d2" cut="torn" depth={14} edge="none" padding="0" className="hh-tribune">
      <span className="hh-tribune-mast"><b>The Mainsail Tribune</b><small>Late edition · Credits</small></span>
      <span className="hh-tribune-head">Who made the heat</span>
      <span className="hh-tribune-lede">
        <span><b>Harbor Heat</b> Mainsail dispatch: game and art direction. Original city, booth, towers and poster.</span>
        <span><b>Engine</b> JGengine: scene, save, menu.</span>
        <span><b>Type</b> Bangers and Barlow, SIL Open Font License.</span>
      </span>
      <span className="hh-tribune-rule">Classifieds · props and people on loan</span>
      <span className="hh-tribune-ads" tabIndex={0} aria-label="Asset credits">
        {assets.map((entry) => (
          <span key={entry.title + entry.page} className="hh-tribune-ad">
            <b>{entry.title}</b>
            {entry.who === "" ? null : <span>{entry.who}</span>}
            {entry.page === "" ? null : <small>{entry.page}</small>}
          </span>
        ))}
      </span>
    </GameFrame>
  );
}
