---
name: jgengine-multiplayer
description: Design authority, transport, replication, sessions, and host persistence.
---

# JGengine multiplayer

## Do you need this skill at all?

| Situation | Answer |
| --- | --- |
| Solo / single-player | Do not load this skill; omit `multiplayer` entirely — offline is the shell default |
| Couch / same-screen play | Still solo — one client, no adapter |
| Friends co-op, no server | `p2p({ room })` |
| Hosted authoritative shared world | `ws({ authority: "server" })` + `@jgengine/node` host |
| Presence/ghosts only | `wsPresence()` |
| Cloud persistence | Convex adapters |

## Ownership

This skill owns network topology, authority, transports, sessions/presence, replication/projection, reconnect, hosted runners, and persistence adapters. Serializable game state and save semantics stay in `jgengine-gameplay`.

Use [capabilities.md](capabilities.md) for intent-to-import discovery, [api.md](api.md) for signatures, and [reference.md](reference.md) for transport, host, projection, persistence, and deployment recipes.

## Canonical workflow

1. Choose authority and trust boundaries before transport.
2. Keep commands/intents separate from authoritative state transitions.
3. Define serializable snapshots/deltas and viewer-specific projection.
4. Select a transport pipe and host adapter without changing game protocol.
5. Add reconnect, idempotency, persistence cadence, and failure behavior.
6. Test multiple clients, visibility boundaries, and restore/rejoin behavior.

## Design rules

- Protocol and state contracts live below concrete server/browser adapters.
- Replication is bounded by rooms, interest, change detection, or projection—not global broadcast/full serialization.
- Private state is filtered authoritatively; UI hiding is not security.
- Persistence adapters accept structural interfaces and keep backend dependencies out of core.
- Deterministic ids and commands make retries/reconnect safe.

## Traps

- Local loopback success does not prove authority or privacy.
- Presence/chat/voice are session channels, not game-state ownership.
- Do not couple a primitive to WebSocket, Convex, Postgres, or one deployment topology.
- Reward allocation, inventory mutation, and progression policy remain gameplay/combat concerns.

## Shared-world capacity and persistence

| Topology | Membership and session state | Command reads | Presence fan-out |
| --- | --- | --- | --- |
| Rooms | **256 members maximum** in the room document | Declared actor/player and chunk scope | Neighborhood index |
| Shared | Indexed `jgServerMembers`, separate `jgServerCapacity`, per-user profile session state; no 256-member engine cap | Declared actor/player and chunk scope; player-only writes avoid the world row | Neighborhood index, 10 Hz maximum default pose writes |

Use `createGameServerFunctions({ topology: "shared", runtimes })` for one persistent world. Shared topology defaults to singleton matchmaking. Capacity is not a throughput guarantee; verify the command and subscription read sets under crowd load. Subscribe to `getServerCapacity` for shared membership/status without volatile world revision reads.

Every gameplay command declares `scope(input)`: use `{ players: "actor", chunkKeys: [] }` for player-only work and `chunkKeysAround(position, 1)` for spatial work. The omitted-command default is actor-only with no chunks; an explicit `{}` requests the whole world and needs a justified bounded workload. Hosts use `helpers.runCommand` and its `beforePersist` callback to pair game writes with membership and revision checks in one transaction. Never copy that check/apply/persist loop into a game.

Every presence query is neighborhood-scoped. Pass `PresenceSession.viewerChunkKey` through `createConvexPresenceTransport`. Hosts with custom authentication, bot ownership, or spawn policy use `createWorldPresenceStore` from `@jgengine/convex/worldPresence`: resolve trusted identities and access first, then call `ensure`, `sync`, `revoke`, `active`, `nearby`, and `reap`. Store rows in `jgPoses`, never a game-owned presence table. Optional snapshot callbacks persist game-owned last-position fields at the store's cadence. Bot identity may differ from its authorized owner; preserve that mapping explicitly. Resident rows implement `PresenceResidentRow.actorExternalId` and `ownerActorId` exactly.

Persist only dirty profiles/chunks. Join/leave are roster writes; they do not dirty or rewrite the world. Reset a player with `helpers.resetPlayerProfile`, which runs the same initializer used by joins, and keep the shared world intact.

## Scheduled work

A cron never collects a whole table. Use presence-gated `forEachOnlinePlayer` with a bounded `batchSize`, an internal batch handler, and a continuation reference: each page schedules its handler and the next page as separate transactions. `OnlinePlayer.homeGameId` carries optional application identity from its pose row. Persist elapsed-time anchors with effects; use `accrueSince` to cap offline catch-up. `allServers` is only for explicitly global systems with a bounded server budget.

Pass runtimes to `jgengineCronSpecs` so no tick cron registers when no runtime declares `onTick`; set per-spec `intervalSeconds` deliberately. Retention sweeps and one-shot backfills are bounded, report `remaining`, and stop at convergence. Delete completed migration crons instead of leaving hourly table scans installed forever.

Join failures return typed `full`, `closed`, or `unauthorized` outcomes. Surface them through a retry gate; returning a rejection without visible UI is unfinished. Browser adapters leave sessions on `pagehide`.

For the explicit shared-builder composition, `jgengine create "World Name" --shape shared-world-builder` generates the connected Convex shell, runtime scope declarations, claim/accrual examples, chat, indexed presence, and an online batch pipeline. The generated README owns setup; replace the demonstration economy and author buildable world content in the editor.
