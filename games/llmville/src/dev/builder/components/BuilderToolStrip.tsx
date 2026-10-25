import { Tooltip, useTooltip } from "@/components/ui/tooltip";

import { BUILDER_CSS } from "@/dev/builder/components/builderStyles";
import { BUILDER_TOOLS, BuilderRailIcon } from "@/dev/builder/components/builderTools";
import { BuilderStore, useBuilderState } from "@/dev/builder/builderStore";
import { cn } from "@/components/ui/cn";

export function BuilderToolStrip() {
  const state = useBuilderState();
  const activeTool = state.tool === "stamp" ? null : state.tool;

  return (
    <div className={BUILDER_CSS.canvasToolStrip} role="toolbar" aria-label="Canvas tools">
      {BUILDER_TOOLS.map((tool) => {
        const isActive = activeTool === tool.id;
        const disabled = false;
        return (
          <CanvasToolButton
            key={tool.id}
            active={isActive}
            disabled={disabled}
            label={tool.label}
            description={disabled ? "Not available while editing a street tile" : tool.description}
            shortcut={tool.shortcut}
            onClick={() => {
              if (disabled) return;
              BuilderStore.setTool(tool.id);
            }}
          >
            <BuilderRailIcon icon={tool.icon} active={isActive} />
          </CanvasToolButton>
        );
      })}
      {state.tool === "stamp" && state.activePlacement ? (
        <CanvasToolButton
          active
          label="Placing"
          description={`Placing ${state.activePlacement.label}. Click the floor for each copy. Press Esc to stop.`}
          shortcut="Esc"
          onClick={() => BuilderStore.clearActivePlacement()}
        >
          <span className="font-mono text-[10px] font-bold">···</span>
        </CanvasToolButton>
      ) : null}
    </div>
  );
}

interface CanvasToolButtonProps {
  active: boolean;
  disabled?: boolean;
  label: string;
  description: string;
  shortcut: string;
  onClick: () => void;
  children: React.ReactNode;
}

function CanvasToolButton({ active, disabled = false, label, description, shortcut, onClick, children }: CanvasToolButtonProps) {
  const { triggerProps, tooltipProps } = useTooltip();
  return (
    <div {...triggerProps} className={cn("relative", triggerProps.className)}>
      <button
        type="button"
        className={cn(
          BUILDER_CSS.toolSquare,
          active && BUILDER_CSS.toolSquareActive,
          disabled && "cursor-not-allowed opacity-35",
        )}
        aria-label={label}
        aria-pressed={active}
        aria-disabled={disabled}
        onClick={onClick}
      >
        {children}
      </button>
      <Tooltip {...tooltipProps} placement="right">
        <div className="grid gap-0.5">
          <span className="font-game text-[11px] font-bold text-[var(--brand-cream)]">{label}</span>
          <span className="text-[10px] leading-snug text-[var(--brand-cream-dim)]">{description}</span>
          {shortcut ? (
            <span className="font-mono text-[9px] text-[var(--brand-cream-dim)]/80">
              {shortcut}
            </span>
          ) : null}
        </div>
      </Tooltip>
    </div>
  );
}