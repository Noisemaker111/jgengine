---
name: jgengine-multiplayer
description: Design authority, transport, replication, sessions, and host persistence.
---

# JGengine multiplayer

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
