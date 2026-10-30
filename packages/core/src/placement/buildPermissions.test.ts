import { describe, expect, test } from "bun:test";

import { createPlotPermissions, type BuildRoleLadder } from "./buildPermissions";

/** The test's own ladder: visitors look, builders build, the owner sits on top. */
const ROLES: BuildRoleLadder<"visitor" | "builder" | "owner"> = {
  ladder: ["visitor", "builder", "owner"],
  editor: "builder",
  guildDefault: "visitor",
};

describe("plot permissions restore", () => {
  test("grants, guild and ownership survive a snapshot round trip", () => {
    const live = createPlotPermissions({
      ...ROLES,
      plotId: "p1",
      ownerId: "ann",
      guildId: "crew",
      guildRole: "visitor",
    });
    live.grant("bob", "builder");
    live.grant("cat", "visitor");
    live.transferOwner("bob");
    const saved = live.snapshot();
    expect(saved).toMatchObject({ plotId: "p1", ownerId: "bob", guildId: "crew" });

    const resumed = createPlotPermissions({ ...ROLES, plotId: "p1", ownerId: "cat" });
    resumed.restore(saved);
    expect(resumed.snapshot()).toEqual(saved);
    expect(resumed.roleOf({ userId: "bob" })).toBe("owner");
    expect(resumed.roleOf({ userId: "cat" })).toBe("visitor");
    expect(resumed.canEdit({ userId: "bob" })).toBe(true);
    expect(resumed.canView({ userId: "dave", guildId: "crew" })).toBe(true);
    expect(resumed.canEdit({ userId: "dave", guildId: "crew" })).toBe(false);
    expect(resumed.roleOf({ userId: "ann" })).toBeNull();
  });
});

describe("plot permissions ladder", () => {
  test("a guild joins at the ladder's guild default unless a role is named", () => {
    const live = createPlotPermissions({ ...ROLES, plotId: "p1", ownerId: "ann" });
    live.setGuild("crew");
    expect(live.roleOf({ userId: "dave", guildId: "crew" })).toBe("visitor");
    expect(live.canEdit({ userId: "dave", guildId: "crew" })).toBe(false);

    live.setGuild("crew", "builder");
    expect(live.canEdit({ userId: "dave", guildId: "crew" })).toBe(true);

    live.setGuild(null);
    expect(live.roleOf({ userId: "dave", guildId: "crew" })).toBeNull();
  });

  test("everyone holds the open role, a ban strips every role but the owner's, and bans survive a save", () => {
    const live = createPlotPermissions({ ...ROLES, everyone: "visitor", plotId: "p1", ownerId: "ann" });
    expect(live.roleOf({ userId: "stranger" })).toBe("visitor");
    expect(live.canEdit({ userId: "stranger" })).toBe(false);

    live.grant("bob", "builder");
    live.ban("bob");
    live.ban("ann");
    expect(live.canView({ userId: "bob" })).toBe(false);
    expect(live.canEdit({ userId: "ann" })).toBe(true);

    const resumed = createPlotPermissions({ ...ROLES, everyone: "visitor", plotId: "p1", ownerId: "ann" });
    resumed.restore(JSON.parse(JSON.stringify(live.snapshot())));
    expect(resumed.canView({ userId: "bob" })).toBe(false);
    resumed.unban("bob");
    expect(resumed.canEdit({ userId: "bob" })).toBe(true);
  });

  test("a ladder that cannot seat its editor or guild default is rejected", () => {
    expect(() =>
      createPlotPermissions({
        ladder: ["visitor", "owner"],
        editor: "builder",
        guildDefault: "visitor",
        plotId: "p1",
        ownerId: "ann",
      }),
    ).toThrow(/not on the plot's role ladder/);
    expect(() =>
      createPlotPermissions({
        ladder: [],
        editor: "builder",
        guildDefault: "visitor",
        plotId: "p1",
        ownerId: "ann",
      }),
    ).toThrow(/at least one role/);
  });
});
