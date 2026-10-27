### Changed

- odd-orbit now type-checks clean under the strict flags (unchecked index access, exact optional properties, no index-signature dot access).
- odd-orbit's save checker names every stored field it reads, so a misspelled field is a type error instead of a silent `undefined`.
- A career rung with no pay value now fails loudly instead of paying `NaN`.
