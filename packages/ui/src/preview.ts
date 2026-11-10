import type { ComponentType } from "@jgengine/core/ui/jsx";

export type GamePreviewProps = {
  className?: string;
};

export type GamePreviewComponent = ComponentType<GamePreviewProps>;

export type GamePreviewStates = Record<string, GamePreviewComponent>;
