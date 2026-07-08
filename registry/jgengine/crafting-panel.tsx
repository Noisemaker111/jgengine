import { useState, type CSSProperties, type ReactNode } from "react";

import { HudPanel } from "@/components/ui/hud-panel";

const chamfer = (cut: number) =>
  `polygon(${cut}px 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, ${cut}px 100%, 0 calc(100% - ${cut}px), 0 ${cut}px)`;

const slantBar = (lean: number) =>
  `polygon(${lean}px 0, 100% 0, calc(100% - ${lean}px) 100%, 0 100%)`;

const clampFraction = (value: number) => (Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value)));

function HoverButton({
  onClick,
  disabled,
  style,
  hoverStyle,
  dataJg,
  className,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  style: CSSProperties;
  hoverStyle: CSSProperties;
  dataJg?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      data-jg={dataJg}
      className={className}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...style, ...(hovered && disabled !== true ? hoverStyle : {}) }}
    >
      {children}
    </button>
  );
}

function IconWell({ size, children }: { size: number; children?: ReactNode }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden"
      style={{
        width: size,
        height: size,
        clipPath: chamfer(5),
        border: "1px solid var(--jg-edge-bright)",
        background: "linear-gradient(180deg, var(--jg-surface) 0%, var(--jg-surface-deep) 100%)",
      }}
    >
      {children}
    </div>
  );
}

export interface CraftingRecipeRow {
  id: string;
  icon?: ReactNode;
  name: string;
  inputs: readonly { icon?: ReactNode; label: string; have: number; need: number }[];
  craftable?: boolean;
  craftFraction?: number;
}

export function CraftingPanel({
  title = "Crafting",
  recipes,
  onCraft,
  width = 360,
  className,
}: {
  title?: string;
  recipes: readonly CraftingRecipeRow[];
  onCraft?: (id: string) => void;
  width?: number;
  className?: string;
}) {
  return (
    <div className={className} data-jg="crafting-panel">
      <HudPanel title={title} width={width}>
        <div className="flex flex-col gap-2">
          {recipes.map((recipe) => {
            const craftable = recipe.craftable ?? true;
            const showProgress =
              recipe.craftFraction !== undefined && recipe.craftFraction > 0 && recipe.craftFraction < 1;
            return (
              <div
                key={recipe.id}
                data-jg="crafting-recipe"
                className="flex flex-col gap-1 pb-1.5"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
              >
                <HoverButton
                  dataJg="crafting-recipe-header"
                  disabled={!craftable}
                  onClick={onCraft === undefined ? undefined : () => onCraft(recipe.id)}
                  className={`flex w-full items-center gap-2 p-1 text-left ${craftable ? "cursor-pointer" : "cursor-not-allowed"}`}
                  style={{ border: "none", background: "transparent" }}
                  hoverStyle={{ background: "rgba(255,255,255,0.04)" }}
                >
                  <IconWell size={30}>{recipe.icon}</IconWell>
                  <span
                    className="text-xs font-bold"
                    style={{ color: craftable ? "var(--jg-text)" : "var(--jg-text-dim)" }}
                  >
                    {recipe.name}
                  </span>
                </HoverButton>
                <div className="flex flex-wrap items-center gap-1.5 pl-[38px]">
                  {recipe.inputs.map((input, index) => (
                    <span key={index} className="flex items-center gap-1.5">
                      {index > 0 && (
                        <span
                          aria-hidden
                          className="h-1 w-1 shrink-0 rotate-45"
                          style={{ background: "var(--jg-edge-bright)" }}
                        />
                      )}
                      <span
                        className="flex items-center gap-[3px] font-mono text-[10px]"
                        style={{ color: input.have >= input.need ? "var(--jg-success)" : "var(--jg-danger)" }}
                      >
                        {input.icon}
                        {input.label} {input.have}/{input.need}
                      </span>
                    </span>
                  ))}
                </div>
                {showProgress && (
                  <div
                    className="ml-[38px] h-[3px] overflow-hidden"
                    style={{ clipPath: slantBar(3), background: "var(--jg-surface-deep)" }}
                  >
                    <div
                      className="h-full"
                      style={{
                        width: `${clampFraction(recipe.craftFraction ?? 0) * 100}%`,
                        background: "var(--jg-accent)",
                        boxShadow: "0 0 6px var(--jg-accent-glow)",
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </HudPanel>
    </div>
  );
}
