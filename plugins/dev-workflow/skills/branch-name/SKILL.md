---
description: Suggests a git branch name that follows the team convention for the work at hand. Use when the user asks for a branch name, or before creating a branch for a new task.
argument-hint: "[task description or ticket id]"
allowed-tools: Bash(git status *), Bash(git branch *), Bash(git diff *)
---

# Branch name

Suggest a branch name for the task that follows the team convention below.

## Steps

1. Take the task from `$ARGUMENTS`. If it is empty, run `git status --short` and `git diff --stat` to infer the task from the current changes; if that is not enough, ask the user what the branch is for.
2. Run `git branch --list` to avoid a name that already exists.
3. Show the name in a fenced block, with the `git switch -c` command. Do not create the branch unless the user explicitly asks.

## Format

```
<type>/<ticket>-<short-summary>
```

- **type**: the same types as commit messages: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`.
- **ticket**: the ticket id in upper case, such as `DEV-123`; omit it and its dash when there is none.
- **short-summary**: kebab-case, lowercase, 2 to 5 words, no articles.
- The whole name is at most 50 characters and uses only `a-z`, `0-9`, `-`, `/` and the ticket id.

## Example

```bash
git switch -c fix/DEV-482-refresh-token-expiry
```
