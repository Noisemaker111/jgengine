import { cn } from "@/components/ui/cn";

const ACTION_BASE =
  "game-button game-button-compact min-w-[100px] font-game text-sm font-bold italic uppercase tracking-tight";

export const MODEL_CARD_ACTION_VARIANT = {
  train: "train",
  unlock: "unlock",
  progress: "progress",
  locked: "locked",
  reveal: "reveal",
  serve: "serve",
  serving: "serving",
} as const;

export type ModelCardActionVariant = (typeof MODEL_CARD_ACTION_VARIANT)[keyof typeof MODEL_CARD_ACTION_VARIANT];

export type ModelCardActionProps =
  | {
      variant: typeof MODEL_CARD_ACTION_VARIANT.train;
      label: string;
      disabled?: boolean;
      onClick: () => void;
    }
  | { variant: typeof MODEL_CARD_ACTION_VARIANT.unlock; label: string; disabled?: boolean; onClick: () => void }
  | { variant: typeof MODEL_CARD_ACTION_VARIANT.progress; label: string }
  | { variant: typeof MODEL_CARD_ACTION_VARIANT.locked; label: string }
  | { variant: typeof MODEL_CARD_ACTION_VARIANT.reveal; onReveal: () => void }
  | { variant: typeof MODEL_CARD_ACTION_VARIANT.serve; onServe: () => void; label?: string }
  | { variant: typeof MODEL_CARD_ACTION_VARIANT.serving };

export function ModelCardAction(props: ModelCardActionProps) {
  if (props.variant === MODEL_CARD_ACTION_VARIANT.train) {
    return (
      <button
        type="button"
        onClick={props.onClick}
        disabled={props.disabled}
        className={cn(
          ACTION_BASE,
          !props.disabled
            ? "game-button-secondary border-brand-coral/50 text-brand-coral hover:bg-brand-coral/10"
            : "cursor-not-allowed opacity-40",
        )}
      >
        {props.label}
      </button>
    );
  }
  if (props.variant === MODEL_CARD_ACTION_VARIANT.unlock) {
    return (
      <button
        type="button"
        onClick={props.onClick}
        disabled={props.disabled}
        className={cn(
          ACTION_BASE,
          !props.disabled
            ? "game-button-secondary border-brand-teal/50 text-brand-teal hover:bg-brand-teal/10"
            : "cursor-not-allowed opacity-40",
        )}
      >
        {props.label}
      </button>
    );
  }
  if (props.variant === MODEL_CARD_ACTION_VARIANT.progress) {
    return (
      <div className={cn(ACTION_BASE, "game-button-secondary border-brand-amber/50 text-brand-amber cursor-default")}>
        {props.label}
      </div>
    );
  }
  if (props.variant === MODEL_CARD_ACTION_VARIANT.locked) {
    return (
      <div className={cn(ACTION_BASE, "game-button-secondary opacity-40 cursor-default")}>{props.label}</div>
    );
  }
  if (props.variant === MODEL_CARD_ACTION_VARIANT.reveal) {
    return (
      <button type="button" onClick={props.onReveal} className={cn(ACTION_BASE, "game-button-primary")}>
        Reveal
      </button>
    );
  }
  if (props.variant === MODEL_CARD_ACTION_VARIANT.serve) {
    return (
      <button type="button" onClick={props.onServe} className={cn(ACTION_BASE, "game-button-primary")}>
        {props.label ?? "Serve"}
      </button>
    );
  }
  return (
    <div className={cn(ACTION_BASE, "game-button-secondary border-brand-teal/50 text-brand-teal cursor-default")}>
      <span className="h-2 w-2 animate-pulse rounded-full bg-brand-teal" />
      Serving
    </div>
  );
}
