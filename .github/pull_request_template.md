## What & why

<!-- One or two sentences: what this changes and why. Link the issue it closes. -->

Closes #

## Changelog — required for `packages/*/src` changes

Every change to published-SDK source lands its own line in `CHANGELOG.md` under
`## [Unreleased]`, so the next release's notes are complete without an archaeology
pass. Entries accumulate there across PRs and are renamed to the version number when
we publish (and mirrored into `packages/core/src/meta/changelog.ts`).

- [ ] I added a bullet under `## [Unreleased]` (Migrate / Added / Changed / Removed)
      describing the consumer-facing change, **or**
- [ ] this PR changes no published-SDK source (docs, tooling, tests, `Games/*`) or is a
      pure refactor with no observable change — bypassed with `[skip changelog]` in a
      commit message.

`bun run check-changelog` runs in CI and blocks a source PR whose `[Unreleased]`
section is untouched.

## Verification

<!-- Tests run, screenshots for visual claims (see the jgengine-verify skill), or why
     none are needed. -->
