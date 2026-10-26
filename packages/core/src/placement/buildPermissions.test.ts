import { describe, expect, test } from "bun:test";

import { createPlotPermissions } from "./buildPermissions";

describe("plot permissions restore", () => {
  test("grants, guild and ownership survive a snapshot round trip", () => {
    const live = createPlotPermissions({ plotId: "p1", ownerId: "ann", guildId: "crew", guildRole: "viewer" });
    live.grant("bob", "editor");
    live.grant("cat", "viewer");
    live.transferOwner("bob");
    const saved = live.snapshot();
    expect(saved).toMatchObject({ plotId: "p1", ownerId: "bob", guildId: "crew" });

    const resumed = createPlotPermissions({ plotId: "p1", ownerId: "cat" });
    resumed.restore(saved);
    expect(resumed.snapshot()).toEqual(saved);
    expect(resumed.roleOf({ userId: "bob" })).toBe("owner");
    expect(resumed.roleOf({ userId: "cat" })).toBe("viewer");
    expect(resumed.canEdit({ userId: "bob" })).toBe(true);
    expect(resumed.canView({ userId: "dave", guildId: "crew" })).toBe(true);
    expect(resumed.canEdit({ userId: "dave", guildId: "crew" })).toBe(false);
    expect(resumed.roleOf({ userId: "ann" })).toBeNull();
  });
});
