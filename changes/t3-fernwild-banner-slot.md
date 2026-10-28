ObjectiveBannerHost and OnboardingBanner take placement: "inline", so the banner can stack inside a HudSlots slot instead of covering the screen at a fixed height

Refs #2687

Engine seam: packages/core/src/mission/objectiveBanner.view.tsx, packages/core/src/onboarding/onboarding.view.tsx

### Added

- ObjectiveBannerHost and OnboardingBanner take placement: "inline", so the banner can stack inside a HudSlots slot instead of covering the screen at a fixed height

### Changed

- Fernwild's tutorial banner sits in the top slot above the ADDED/CONSUMED lines, so the two never overlap
