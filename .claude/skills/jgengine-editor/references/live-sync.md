# Live-sync reconnect

`DocumentLiveSync.pullPatches(revision)` retains up to 64 patches. A cursor older
than that history receives one current snapshot with the requested base revision
and the authority's current revision. Apply it with `applyDocumentPatch`; preserve
the emitted revision so the next command patch joins the same stream. Snapshot
recovery replaces the whole document and accounts for deleted authored content.

`pull_runtime_deltas` retains up to 128 ephemeral deltas. When a requested cursor
has a gap, the RPC returns an empty `deltas` array and a current `snapshot` even
without `includeSnapshot`. Replace the cached runtime snapshot; do not merge it
into old entities, since evicted removals must disappear. Continue polling from
its `seq`. A current cursor receives ordinary deltas; `includeSnapshot` can also
request the snapshot explicitly. Neither channel changes authored content unless
an explicit write-back command does so.
