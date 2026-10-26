export { gameTemplate, displayNameFromId, GAME_ID_PATTERN } from "./templates";
export type { TemplateFile, TemplateOptions, TemplateVariant } from "./templates";
export { runCreate, writeGame } from "./create";
export {
  buildPlan,
  checkToolchains,
  defaultIdentifier,
  parseDesktopArgs,
  resolveMetadata,
  runDesktop,
  runDesktopAsync,
  validateHttpsUrl,
  writeStaging,
} from "./desktop";
export type { DesktopArgs, DesktopMetadata, DesktopPlan, StageResult, ToolchainReport } from "./desktop";
export { diagnoseProject, runDoctor } from "./doctor";
export type { Finding } from "./doctor";
export { cliVersion } from "./pkg";
