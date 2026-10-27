### Changed

- New engine helper `definedFields` (`@jgengine/core/data/definedFields`): passes maybe-missing values on as optional fields, leaving out the undefined ones, so code stays correct under exact optional property types.
- llmville: first pass toward the strict type flags (517 errors down to 303). Builder session, agent asset requests, dev endpoints, generated assets and rack commands read untyped input through the engine's record check instead of dot access; map decor and procedural props pass optional transforms through `definedFields`.
