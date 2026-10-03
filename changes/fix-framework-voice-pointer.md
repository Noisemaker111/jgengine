### Fixed

- `PushToTalkButton` owns one primary pointer or Enter/Space activation and releases its hold on cancellation, capture loss, interruption and unmount. Secondary touches, auxiliary mouse buttons and key repeats preserve the owner's session; caller-owned toggle and open-mic policy remain intact.
