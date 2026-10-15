---
description: Writes a Conventional Commits message for the currently staged changes. Use when the user asks to write, suggest or improve a commit message, or before committing staged work.
argument-hint: "[optional scope or extra context]"
allowed-tools: Bash(git diff *), Bash(git status *), Bash(git log *)
---

# Commit message

Write a commit message for the staged changes that follows the team convention below.

## Steps

1. Run `git diff --cached --stat` and `git diff --cached` to see what is staged. If nothing is staged, say so and stop.
2. Run `git log --oneline -10` to match the tone and scopes already used in this repository.
3. Pick the type and scope, then write the message.
4. Show the message in a fenced block. Do not run `git commit` unless the user explicitly asks.

## Format

```
<type>(<scope>): <summary>

<body>
```

- **type**: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`.
- **scope**: the module or package touched; omit if the change is cross-cutting. Use `$ARGUMENTS` as the scope or as extra context when provided.
- **summary**: imperative mood, lowercase, no trailing period, at most 72 characters.
- **body**: optional; explain *why* the change was made, wrapped at 72 characters.
- Breaking changes: add `!` after the type/scope and a `BREAKING CHANGE:` footer.

## Example

```
fix(auth): refresh token before it expires

Requests made in the last minute of the token lifetime failed with 401
because the refresh only ran after expiry.
```
