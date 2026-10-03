# Playable browser peer worlds

`resolvePeerShellMultiplayer` from `@jgengine/shell/multiplayer` accepts a
`playable` game with `p2p({ authority: "server" })`. The host constructs one
`HostedWorldSession` and `createWorldGameHost`; host and guest command transports
operate on that shared simulation. Passing only `gameId` retains the existing
presence-only reducer-host composition.

```ts
const session = await resolvePeerShellMultiplayer({
  gameId: "my-game", playable: game, role: "host", userId: identity.userId,
  room: "my-room", slotsPerServer: 2,
});
// Mount <GameHost playable={game} multiplayer={session} />.
// The joining tab uses role: "join" with the same room and its own identity.
await session.close();
```

The resolver owns one tick timer, signaling, peers and persistence teardown.
Ticks skip worlds with no active members; only the canonical game/server id is
admitted. `tickMs` defaults to 1000 / 30. Automatic saves default to a 1000 ms interval (`saveIntervalMs`); commands and
close retain their immediate save boundaries. `store` accepts an asynchronous
`HostedWorldStore` for restart recovery; omitted storage is memory-only.
`slotsPerServer` caps players inside the serialized world join queue; known live
members can reconnect at capacity and spectators do not consume player slots.

Admission becomes readable only after the join save succeeds. Rejected callers
cannot subscribe to world state or use a null sync result to request a full
snapshot. Each later subscription push rechecks membership; leaving revokes it.
A failed asynchronous load is retryable; successful hydration remains cached.
Capacity counts admitted players and initially resident host members, rather
than dirty players created by a failed join save. Failed admission or spectator
promotion retains player state for retry without reserving a new seat; retry
still checks current capacity. This is admission accounting, not world rollback.

Closing cancels ticks and signaling, closes the peer/router admission gate and
discards message handlers that have not started. The resolver awaits
`router.drain()` before the final world save. In-flight handlers and subscription
reads settle first, and repeated close calls return the same promise. A pending
backend operation keeps close pending; a final save failure rejects it. Custom
hosts using `createHostRouter` call `close()`, await `drain()`, then flush/stop
their owned host. `WorldGameHost.stop()` permanently fences admission and ticks,
drains already accepted world operations, and saves; repeated calls share its
completion. A stopped host must be replaced rather than restarted. The router
owns no host persistence policy.

Game joins use `onNewPlayer(ctx, player)`'s player argument. The authoritative
context's `ctx.player` identifies the host, while commands read their trusted
actor from `ctx.game.commands.actor()`. Persist game-owned seat and progression
state through registered stores; mutable module closures do not survive host
restart. A host player should use the same command/replica path as guests.

Default room signaling uses same-origin BroadcastChannel; it does not provide
cross-machine room discovery. Injectable `signaling`, peer factories and tick
scheduling support other host integrations and deterministic transport tests.
Tests through injected pipes prove command/replication behavior, not native
WebRTC browser connectivity. Verify that separately with two browser clients.

Resonant Crossing is the first intended adopter. Its published 0.18.x shell
resolver cannot supply a playable authoritative world. Keep that game on
published dependencies and wait for the coordinator's verified package release
before adopting this API; never substitute monorepo source aliases.
