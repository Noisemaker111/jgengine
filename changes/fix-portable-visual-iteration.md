### Fixed

- Portable `jgengine shoot` and `drive` enable touch and coarse-pointer media queries for mobile device profiles and clear touch emulation for desktop.
- Portable `drive --click` scrolls text targets into view and requires an unobstructed, enabled point within the viewport and clipping ancestors. Text matching remains case-insensitive.
- Portable CDP requests time out instead of hanging; `--timeout` bounds screenshot capture as well as frame readiness, and closing a session rejects pending requests.

- Native click targets also resolve accessible labels and allow three stable samples on slower rendered pages within a bounded 15-second settling budget.
