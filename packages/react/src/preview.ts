import type { ComponentType } from "react";

export type GamePreviewProps = {
  className?: string;
};

export type GamePreviewComponent = ComponentType<GamePreviewProps>;

export type GamePreviewStates = Record<string, GamePreviewComponent>;
