### Changed

- Editor RPC (`decodeEditorBridgeRequest`, `@jgengine/editor`) now rejects any top-level request field the method does not declare with `unknown field "<name>" for method "<verb>"` instead of ignoring it and returning `ok: true`.
