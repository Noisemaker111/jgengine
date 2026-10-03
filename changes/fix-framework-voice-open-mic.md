### Fixed

- `useVoice` reads open-mic transmission from its controller on mount and gates newly captured audio tracks before publication using the current mode and mute state. Explicit voice policy remains consistent across transport readiness and updates with stable route arrays.
