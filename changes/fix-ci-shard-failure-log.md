Part of #2894

Root cause: the shard digest copied Bun's ##[group] marker and the passing tests before each failure, so on GitHub the failure folded into a collapsed group and the run page's only annotation read '- []'

### Changed

- Part of #2894
