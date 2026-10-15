# Contributing

## Adding a plugin

1. Copy `plugins/dev-workflow` to `plugins/<your-plugin>` and remove the components you don't need.
2. In `plugins/<your-plugin>/.claude-plugin/plugin.json`, set `name`, `version: "0.1.0"`, `description` and `author`.
3. Add an entry to `.claude-plugin/marketplace.json`:

   ```json
   {
     "name": "<your-plugin>",
     "source": "./plugins/<your-plugin>",
     "description": "...",
     "category": "development",
     "tags": ["..."]
   }
   ```

   Keep entries sorted by `name`.
4. Add a row to the plugin table in [README.md](README.md) and an owner to [.github/CODEOWNERS](.github/CODEOWNERS).
5. Check locally (see below) and open a pull request.

## Rules

### Names

- The `name` in the marketplace entry **must match** the `name` in `plugin.json`. It is the install id (`<name>@dev-team-ai-engineering-marketplace`).
- Use kebab-case: `code-review`, not `CodeReview`.
- Don't start names with `claude-`, `anthropic-` or `cc-plugin-`; the validator rejects them.
- **Never rename** a published plugin: its name is stored in users' settings. Change `displayName` for the UI label instead. If a rename is unavoidable, add it to `renames` in `marketplace.json` (append only, never remove entries).

### Versions

- The version lives **only** in `plugin.json` (SemVer). Don't set `version` in `marketplace.json`; `plugin.json` silently overrides it.
- **Any change under `plugins/<name>/` requires a `version` bump** and an entry in the plugin's `CHANGELOG.md`. Without a new version number users never receive the update. CI enforces this.
- Patch for fixes, minor for new skills or agents, major for breaking changes (a skill removed or renamed, changed hook behaviour).

### Dependencies between plugins

- Declare them in `plugin.json` only: `"dependencies": [{ "name": "engineering-paved-path", "version": "^1.0.0" }]`. A bare name resolves in this marketplace. Claude Code installs and enables dependencies together with the plugin.
- Reference another plugin's components by namespaced name, everywhere: `engineering-paved-path:onion-architecture` in a skill body or in an agent's `skills:` (a bare name in `skills:` silently fails to load), `architecture-review:architecture-reviewer` as an agent type. Never by file path: another plugin's directory is not reachable after installation.
- A dependency published at `1.x` is consumed with `^1.0.0`; `^0.x` would lock consumers to one minor version, so plugins that others depend on start at `1.0.0`.
- Removing or renaming a skill or agent that another plugin uses is a major bump, and the dependent plugin widens its range in the same pull request.
- CI checks that every dependency is listed in `marketplace.json`, that its current version satisfies the range and that there is no cycle.

### Portability

Plugins are used by many projects. Skills, agents, scripts, READMEs and evals must not name a particular project, its packages or repository, or hard-code its paths (`server/src/...`, a fixed list of spec folders). Describe paths by role or take them from the plugin's configuration; reference bundled scripts as `"${CLAUDE_SKILL_DIR}/scripts/x.mjs"`.

### Files and paths

- Components (`skills/`, `agents/`, `hooks/`, `.mcp.json`) live at the **plugin root**, not inside `.claude-plugin/`.
- On install, **only the plugin directory** is copied into the cache. `../` references to files outside it break after installation.
- Use forward slashes in paths. Call scripts as `"${CLAUDE_PLUGIN_ROOT}/scripts/x.sh"` (quoted).
- Put state, caches and `node_modules` in `${CLAUDE_PLUGIN_DATA}`. `${CLAUDE_PLUGIN_ROOT}` changes with every version.
- A `CLAUDE.md` at the plugin root is not loaded; put instructions in a skill.
- npm dependencies need `package.json` plus `package-lock.json` (yarn and pnpm lockfiles are ignored, install scripts never run).

### Skill and agent quality

- Every enabled skill's description sits in context in every session. Keep plugins small and focused.
- Write `description` in the third person: **what** it does and **when** to use it, at most 1024 characters.
- Keep `SKILL.md` under 500 lines; move detail into a `references/` directory next to it.
- Mark skills that should only run when invoked with `/` as `disable-model-invocation: true`.
- Agents need `name` and `description` in their frontmatter; grant the smallest set of `tools`.

### Security

Hooks, MCP servers and scripts run **with the user's privileges, outside the sandbox**. Therefore:

- changes to `hooks/`, `.mcp.json`, `scripts/` and `bin/` require review from the owners in CODEOWNERS;
- no secrets in the repository. Obtain tokens through `userConfig` with `"sensitive": true`;
- MCP servers over `https://` only;
- test hooks on Windows too (they run through Git Bash).

## Checking locally

```bash
# manifests and frontmatter
claude plugin validate . --strict
claude plugin validate plugins/<your-plugin> --strict
node .github/scripts/check-marketplace.mjs

# start a session with the plugin without installing it
claude --plugin-dir ./plugins/<your-plugin>

# full install from the local marketplace checkout
claude plugin marketplace add ./
claude plugin install <your-plugin>@dev-team-ai-engineering-marketplace
claude plugin details <your-plugin>
```

## Releasing

After merging to `main`, create a version tag:

```bash
claude plugin tag plugins/<your-plugin> --push
```

It validates the plugin and creates a `<your-plugin>--v<version>` tag. Dependency ranges are resolved against these tags, so tag dependencies before the plugins that use them: `engineering-paved-path` and `research-tools`, then `architecture-review`, then `sdd-engineering`.
