# jest-dom matchers reference

The matchers registered by `@testing-library/jest-dom`. Prefer the most specific matcher that states the user-visible fact. Back to [SKILL.md](../SKILL.md).

| Matcher | Checks |
|---------|--------|
| `toBeInTheDocument()` | Element is in the DOM |
| `toBeVisible()` | Element is visible to the user |
| `toBeEnabled()` / `toBeDisabled()` | Enabled/disabled state |
| `toHaveTextContent(/text/i)` | Contains text |
| `toHaveValue('val')` | Input/select current value |
| `toHaveAttribute('href', '/path')` | HTML attribute |
| `toBeChecked()` | Checkbox/radio is checked |
| `toHaveFocus()` | Element has focus |
| `toBeRequired()` | Input is required |
| `toHaveClass('cls')` | Has CSS class (use sparingly) |
| `toHaveAccessibleDescription()` | `aria-describedby` text |
| `toBeEmptyDOMElement()` | No visible content |
