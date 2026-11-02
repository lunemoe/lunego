---
"@lunego/ui": minor
---

`List` is now an accessible single-select listbox: `role="listbox"`/`option`,
`aria-selected`/`aria-disabled`, roving tabindex, ArrowUp/Down/Home/End
navigation, Enter/Space selection, disabled-option skipping, empty-list safety,
and an editable-descendant guard. Escape is left to `UiMenuStack`/`Modal`, so
focus trap and close/restore behavior stay in one place.
