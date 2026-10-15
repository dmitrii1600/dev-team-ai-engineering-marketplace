# dev-workflow

The team's shared development workflow.

## Components

| Type | Name | How to use |
|---|---|---|
| Skill | `commit-message` | `/dev-workflow:commit-message [scope]` or ask "write a commit message" |
| Agent | `code-reviewer` | "review my changes with the code-reviewer agent" or `@dev-workflow:code-reviewer` |

- **commit-message** reads the staged changes and suggests a [Conventional Commits](https://www.conventionalcommits.org/) message. It never commits on its own.
- **code-reviewer** is a read-only agent: it looks for bugs, security issues and missing tests, and reports findings ranked by severity.

## Installation

```bash
claude plugin install dev-workflow@dev-team-ai-engineering-marketplace
```

## Changes

See [CHANGELOG.md](CHANGELOG.md).
