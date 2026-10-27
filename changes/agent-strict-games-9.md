### Changed

- llmville: the whole game now passes the strict compiler flags (strict-flag errors 173 → 0).
- llmville: component props and view-model fields that can be unset say so with `| undefined`; list reads check for a missing entry; fixed lists (avatars, builder materials, room templates) are typed as never empty.
- llmville: the error-report payload only sends fields that are set, and the toast theme no longer needs a cast.
