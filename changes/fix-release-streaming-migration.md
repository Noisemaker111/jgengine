### Migrate

- When constructing a complete `StreamingSettings` object, add all required fields: `maxConcurrentLoads: 4`, `maxResidentBytes: Infinity`, and `residentEvictionOrder: "oldest"`. Callers using `Partial<StreamingSettings>` or spreading `DEFAULT_STREAMING_SETTINGS` inherit these defaults. Existing streaming fields remain required in complete objects.
