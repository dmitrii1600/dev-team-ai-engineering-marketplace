## What changed

<!-- Which plugin, which skills/agents/hooks were added or changed, and why. -->

## Checklist

- [ ] `version` in `plugin.json` bumped (SemVer) and an entry added to the plugin's `CHANGELOG.md`
- [ ] `name` in `marketplace.json` matches `name` in `plugin.json`
- [ ] `claude plugin validate . --strict` and `claude plugin validate plugins/<name> --strict` pass
- [ ] Plugin tested manually with `claude --plugin-dir ./plugins/<name>`
- [ ] No secrets, tokens or `../` paths outside the plugin directory
- [ ] If hooks / `.mcp.json` / scripts changed: described what runs on the user's machine
- [ ] README (plugin table) and CODEOWNERS updated for a new plugin
