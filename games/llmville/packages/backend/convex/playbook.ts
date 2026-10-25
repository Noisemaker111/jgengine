import { buildAgentPlaybookContent } from "@llmville/game/agent/playbook";
import { convexApiCatalog, convexApiHowToCall } from "./convexApiCatalog";

export type AgentPlaybook = ReturnType<typeof buildAgentPlaybook>;

export function buildAgentPlaybook() {
  return buildAgentPlaybookContent(convexApiCatalog, convexApiHowToCall);
}