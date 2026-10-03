### Migrate

- Custom `createQuestJournal` reward dependencies and `applyQuestRewards` appliers with multiple item rewards must supply an all-or-reject `grantItems` callback. Legacy single-item callbacks remain supported; multiple items without a batch callback reject before writes.

### Fixed

- Built-in quest rewards stage the complete item batch against inventory capacity and kind rules before committing, preventing duplicated earlier rewards on retry. Reentrant turn-in calls reject while rewards are applying.
