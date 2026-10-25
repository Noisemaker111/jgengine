import { createElement, useMemo } from "react";
import { useDisplayProfile } from "@jgengine/react/display";
import { GameCursor } from "@jgengine/react/gameCursor";
import { GameFrame } from "@jgengine/react/gameFrame";
import { useMenuNav } from "@jgengine/react/menuNav";
import { EntityPreview } from "@jgengine/shell/render/EntityPreview";
import { IsolatedEntityModel } from "@jgengine/shell/render/SceneModels";
import { entityModels } from "../../world/models";
import { HH, KeyLegend, navItem, useMenuSound, useMoveTick, useScreenTouch } from "./kit";

/** One reply the courier can give. */
export interface Reply {
  label: string;
  /** The job a reply takes, drawn as a work order instead of a plain answer. */
  job?: boolean;
  run: () => void;
}

/** Who is talking: their name, who they run with, and the body their portrait is shot from. */
export interface Speaker {
  name: string;
  /** Faction label for the plate: "Mainsail locals", "HHPD". */
  crew?: string;
  /** A tone for the plate: `locals` mint, `carmine` coral, `hhpd` blue. */
  faction?: string;
  /** An entity model id from `entityModels` for the portrait. */
  portrait?: string;
}

const PLATE: Record<string, string> = { locals: HH.teal, carmine: "#8c2a22", hhpd: "#1f3f86" };

/**
 * Face to face with a contact: their portrait in a snapshot frame and their name on an enamel plate,
 * what they say in a comic speech balloon, and the courier's answers as numbered replies under it.
 * Up/down or the d-pad picks a reply, Enter or A says it, Escape or B walks away (the last reply).
 */
export function FaceToFace({ speaker, lines, replies, onLeave }: { speaker: Speaker; lines: readonly string[]; replies: readonly Reply[]; onLeave: () => void }) {
  const compact = useDisplayProfile().compact;
  const sound = useMenuSound();
  useScreenTouch();
  const ids = useMemo(() => replies.map((_, index) => `reply-${index}`), [replies]);
  const say = (id: string) => {
    const reply = replies[Number(id.slice("reply-".length))];
    if (reply === undefined) return;
    sound.play("confirm");
    reply.run();
  };
  const nav = useMenuNav({ ids, onConfirm: say, onBack: () => { sound.play("back"); onLeave(); } });
  useMoveTick(nav.activeId);
  const model = speaker.portrait === undefined ? undefined : entityModels[speaker.portrait];
  return (
    <div className={`hh-talk ${compact ? "compact" : ""}`} role="dialog" aria-label={`Talking to ${speaker.name}`}>
      <div className="hh-talk-who">
        <span className="hh-mug" aria-hidden="true">
          {model === undefined ? <b className="hh-mug-initials">{initials(speaker.name)}</b> : (
            <span className="hh-mug-window">
              <EntityPreview mood="studio" backdrop="#d9c7a2" environment={false} cameraPosition={[0, 0.02, 1.35]} fov={24} dpr={[1, 1.25]} className="hh-mug-canvas">
                {createElement("group", { position: [0, -1.56, 0] }, <IsolatedEntityModel model={model} />)}
              </EntityPreview>
            </span>
          )}
        </span>
        <GameFrame material="enamel" tint={PLATE[speaker.faction ?? ""] ?? HH.ink} cut="chamfer" depth={8} edge={HH.cream} edgeWidth={2} padding="6px 14px 5px" className="hh-plate">
          <span className="hh-plate-text">
            <b>{speaker.name}</b>
            {speaker.crew === undefined ? null : <small>{speaker.crew}</small>}
          </span>
        </GameFrame>
      </div>
      <div className="hh-talk-say">
        <div className="hh-balloon">
          {lines.map((line, index) => <p key={index}>{line}</p>)}
        </div>
        <nav className="hh-replies" aria-label="Your reply" {...nav.containerProps}>
          {replies.map((reply, index) => (
            <button key={reply.label} type="button" className="hh-reply" data-job={reply.job === true ? "" : undefined} {...navItem(nav.itemProps(`reply-${index}`))} onClick={() => { nav.setActive(`reply-${index}`); say(`reply-${index}`); }}>
              <i>{index + 1}</i>
              <span>{reply.label}</span>
            </button>
          ))}
          <GameCursor variant="chevron" color={HH.amber} gap={4} thickness={3} arm={9} />
        </nav>
        {compact ? null : <KeyLegend items={[{ keys: ["↑", "↓"], label: "choose" }, { keys: ["Enter"], label: "say it" }, { keys: ["Esc"], label: "walk away" }]} />}
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).filter((part) => /^[A-Z]/.test(part) && !part.endsWith(".")).map((part) => part[0]).slice(0, 2).join("");
}
