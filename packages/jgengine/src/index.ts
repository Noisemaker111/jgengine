export { gameTemplate, displayNameFromId, GAME_ID_PATTERN, IN_REPO_TSCONFIG_PATHS } from "./templates";
export type { TemplateFile, TemplateOptions, TemplateVariant } from "./templates";
export { runCreate, writeGame, registerRootGameScript } from "./create";
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
export { diagnose, runDoctor } from "./doctor";
export type { Finding } from "./doctor";
export { cliVersion } from "./pkg";
