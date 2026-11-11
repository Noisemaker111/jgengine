/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneAction, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { KeyLegend, Label, Scrim, Text, useMenuSound, useRoom, useScreenTouch } from "./kit";
import { HH, DISPLAY } from "./theme";

/** One reply the courier can give. */
export interface Reply {
  label: string;
  /** The job a reply takes, drawn as a work order instead of a plain answer. */
  job?: boolean;
  run: () => void;
}

/** Who is talking: their name, who they run with, and the cast body their portrait is shot from. */
export interface Speaker {
  name: string;
  /** Faction label for the plate: "Mainsail locals", "HHPD". */
  crew?: string | undefined;
  /** A tone for the plate: `locals` mint, `carmine` coral, `hhpd` blue. */
  faction?: string | undefined;
  /** An entity model id; kept so the talk re-keys when the face changes. */
  portrait?: string | undefined;
}

const PLATE: Record<string, string> = { locals: HH.teal, carmine: "#8c2a22", hhpd: "#1f3f86" };

/** Initials of the capitalised words in a name: "Marco 'Two-Tone' Ruiz" → "MR". */
export function initials(name: string): string {
  return name.split(/\s+/).filter((part) => /^[A-Z]/.test(part) && !part.endsWith(".")).map((part) => part[0]).slice(0, 2).join("");
}

/**
 * Face to face with a contact: a snapshot frame with their initials over their crew colour, their
 * name on an enamel plate, what they say in a speech balloon, and the courier's numbered answers.
 * Arrows or the pad pick a reply, Enter or A says it, Escape or B walks away.
 */
export function FaceToFace({ speaker, lines, replies, onLeave }: { speaker: Speaker; lines: readonly string[]; replies: readonly Reply[]; onLeave: () => void }) {
  useScreenTouch();
  const sound = useMenuSound();
  const { width } = useRuneViewport();
  const compact = useRoom() !== "wide";
  const plate = PLATE[speaker.faction ?? ""] ?? HH.ink;
  const say = (reply: Reply) => { sound.play("confirm"); reply.run(); };
  const balloonWidth = Math.min(560, width - (compact ? 32 : 260));
  return (
    <Scrim back={() => { sound.play("back"); onLeave(); }} label={`Talking to ${speaker.name}`} role="dialog" padding={compact ? [16, 16, 16, 16] : 0}>
      <RuneView layout={compact ? "stack" : "row"} gap={18} items={compact ? "center" : "start"}>
        <RuneView items="center" gap={8}>
          <RuneView width={compact ? 96 : 150} height={compact ? 96 : 150} padding={6} fill="#f4ede0" shadow={{ x: 5, y: 6, blur: 0, color: "#00000088" }}>
            <RuneView grow={1} justify="center" items="center" gradient={{ angle: 2.2, stops: [[0, "#d9c7a2"], [1, plate]] }}>
              <Text family={DISPLAY} size={compact ? 40 : 64} color={HH.cream} text={initials(speaker.name)} />
            </RuneView>
          </RuneView>
          <RuneView padding={[5, 14, 4, 14]} fill={plate} border={{ width: 2, color: HH.cream }} radius={4} items="center">
            <Text family={DISPLAY} size={20} tracking={0.8} color={HH.cream} text={speaker.name} />
            {speaker.crew === undefined ? null : <Label color="#e7f2ef" text={speaker.crew} />}
          </RuneView>
        </RuneView>
        <RuneView width={balloonWidth} gap={12}>
          <RuneView padding={[14, 18, 14, 18]} gap={6} fill="#fffaf0" border={{ width: 3, color: HH.night }} radius={18} shadow={{ x: 5, y: 6, blur: 0, color: "#00000088" }}>
            {lines.map((line, index) => <Text key={index} size={16} color={HH.night} text={line} />)}
          </RuneView>
          <RuneView gap={6} label="Your reply">
            {replies.map((reply, index) => (
              <RuneAction key={reply.label} label={reply.label} run={() => say(reply)} layout="row" gap={10} items="center" padding={[8, 12, 8, 10]} radius={4}
                fill={reply.job === true ? HH.amber : "#102e3bee"} border={{ width: 2, color: reply.job === true ? HH.night : "#76d4c366" }} hover="#ffffff22" press="#00000030">
                <RuneView width={24} height={24} radius={12} fill={reply.job === true ? HH.night : HH.amber} justify="center" items="center">
                  <Text family={DISPLAY} size={15} color={reply.job === true ? HH.amber : HH.night} text={String(index + 1)} />
                </RuneView>
                <Text weight={600} color={reply.job === true ? HH.night : HH.cream} text={reply.label} />
              </RuneAction>
            ))}
          </RuneView>
          {compact ? null : <KeyLegend items={[{ keys: ["↑", "↓"], label: "choose" }, { keys: ["Enter"], label: "say it" }, { keys: ["Esc"], label: "walk away" }]} />}
        </RuneView>
      </RuneView>
    </Scrim>
  );
}
