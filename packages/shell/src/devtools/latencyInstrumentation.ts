import { instrumentLatency } from "@jgengine/core/devtools/devtools";
import type { ShellMultiplayer } from "../multiplayer";

/** @internal */
export function withDevtoolsLatency(multiplayer: ShellMultiplayer): ShellMultiplayer {
  return {
    ...multiplayer,
    backend: {
      ...instrumentLatency(multiplayer.backend, ["pushFeedEntry"]),
      transport: instrumentLatency(multiplayer.backend.transport, ["joinServer", "leaveServer", "runCommand"]),
    },
  };
}

