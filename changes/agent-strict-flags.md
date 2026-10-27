### Changed

- Games: the six strict compiler flags (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noFallthroughCasesInSwitch`) are now on for every in-repo game through `games/tsconfig.base.json`, and in llmville's own tsconfig. Each game's `check-types` (run by CI) now enforces them, so new strict errors cannot come back.
