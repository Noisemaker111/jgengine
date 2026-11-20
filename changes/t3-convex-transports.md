createConvexGameChatSync turns a game's own Convex chat functions into a ChatSync with no UI hooks

Engine seam: packages/convex/src/convexChatSync.ts, packages/convex/src/convexChatTransport.ts, packages/convex/src/convexPresenceTransport.ts, packages/convex/src/createConvexBackend.ts, packages/convex/src/index.ts, packages/convex/src/server.ts, packages/core/src/chat/chat.view.tsx, packages/core/src/chat/chatContract.ts and 3 more

### Migrate

- ChatTransport, ChatActions, chatTransportFromSync and createConvexChatTransport are gone; use ChatSync (createLocalChatTransport is now createLocalChatSync)
- PresenceTransport, createConvexPresenceTransport, createLocalPresenceTransport and createConvexBackend's presence option are gone; presence is presenceSync

### Added

- createConvexGameChatSync turns a game's own Convex chat functions into a ChatSync with no UI hooks
- `createConvexGameChatSync` (`@jgengine/convex`): A game's own Convex chat functions on the engine's {@link ChatSync}: one live query per subscribed channel (its recent history, newest last) and one send mutation, through the client's `watchQuery` and `mutation`.
- `createConvexGameChatSync` (`@jgengine/convex/convexChatSync`): A game's own Convex chat functions on the engine's {@link ChatSync}: one live query per subscribed channel (its recent history, newest last) and one send mutation, through the client's `watchQuery` and `mutation`. Also `ConvexChatFunctions`.
- `createLocalChatSync` (`@jgengine/core/chat/chatContract`): Chat kept in this process: one ChatSync with a bounded history per channel, for offline play and tests.

### Removed

- `@jgengine/convex` no longer exports `ConvexPresenceFunctions`, `createConvexChatTransport`, `createConvexPresenceTransport`.
- `@jgengine/convex/convexChatTransport` no longer exports `ConvexChatFunctions`, `createConvexChatTransport`.
- `@jgengine/convex/convexPresenceTransport` no longer exports `ConvexPresenceFunctions`, `createConvexPresenceTransport`.
- `@jgengine/core/chat/chat.view` no longer exports `chatTransportFromSync`.
- `@jgengine/core/chat/chatContract` no longer exports `ChatActions`, `ChatTransport`, `createLocalChatTransport`.
- `@jgengine/core/multiplayer` no longer exports `ChatActions`, `ChatTransport`, `PresenceActions`, `PresenceFeeds`, `PresenceSession`, `PresenceTransport`.
- `@jgengine/core/multiplayer/presenceContract` no longer exports `PresenceActions`, `PresenceFeeds`, `PresenceSession`, `PresenceTransport`, `createLocalPresenceTransport`.
- `@jgengine/core/ui.view` no longer exports `chatTransportFromSync`.
