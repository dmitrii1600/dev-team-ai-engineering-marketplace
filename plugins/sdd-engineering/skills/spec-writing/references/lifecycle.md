# Spec lifecycle

A spec describes a feature **before** it is built: the problem, the user, the intended
behaviour as checkable criteria, and what is deliberately out. It is the input to a plan
(`sdd-engineering:implementation-planner`, saved under `plansDir`) and the yardstick for
the finished tree (`sdd-engineering:plan-verifier`). It is not a plan (that is
`<plansDir>/<same-stem>.md`), not a description written afterwards (that is a README) and
not a record of lessons learned.

Specs are written by `sdd-engineering:spec-creator`, in English, and approved by a person.
The agent writes only inside `specsDir` and never changes a `Status`.

## Naming

One file per feature: `<specsDir>/YYYY-MM-DD-short-name.md` — the date the spec was
started and a two-to-four-word feature name (`specs/2026-10-15-export-invoice-pdf.md`).
There are no ticket numbers; the **Spec ID** is the filename stem with a `SPEC-` prefix
(`SPEC-2026-10-15-export-invoice-pdf`), so an ID is readable on its own, sorts by date,
and finds its file with one glob. A stem is never reused; a superseding spec carries its
own date.

The plan for a spec takes the **same stem** in `plansDir`
(`plans/2026-10-15-export-invoice-pdf.md`), and the run reports of `/run-plan` live under
`<runsDir>/<stem>/`. One stem ties the three together.

## Status

`Status` replaces moving files between folders:

| Status | Set by | Meaning |
|---|---|---|
| `draft` | `spec-creator` | written by the agent; the agent may still extend it on a second round |
| `approved` | a person, after reading the draft | the plan may be written against it; `/run-plan` refuses a spec that is still `draft` |
| `implemented` | a person, once the feature ships and `plan-verifier` reports `CONFORMS` | the spec is a record of what was built |

An agent never writes `approved` or `implemented`.

## Supersedes

Once building has started, an approved spec is not edited. A changed decision is a
**new** spec, dated the day it is written, with
`Supersedes: SPEC-<yyyy-mm-dd>-<other-name>`. The planner plans against the newest spec
in a `Supersedes` chain. `Supersedes: none` is written explicitly when nothing is
superseded.

## Amending in place — before building starts

A decision that changes an approved spec **before any code is built against it** is an
in-place amendment, not a new spec. The typical case is a contradiction the planner finds
in its *Requirements review*. All three conditions must hold:

- the person asked for the change;
- `<runsDir>/<stem>/` holds no `1x-build*` report (nothing has been built from the plan);
- no commit after the plan's own touches code.

The amendment leaves the `Status` line untouched. It adds one dated line under
*Resolved decisions* in *Open questions*, saying what changed and who decided it, plus an
`answers` row in *Inputs and provenance*. Stem and Spec ID stay, so the plan's path
still points at it. A superseding spec in this situation only costs an extra file and an
extra round with the person.

## Designs

Designs live in `<specsDir>/designs/<slug>/` as PNG screenshots or markdown mockups and
are passed to `spec-creator` by path. A link to a design tool is recorded under *Inputs
and provenance* as a reference only; the agent cannot open it and needs a PNG export
next to it. The agent never edits anything under `designs/`.

## Older documents

Documents in `specsDir` that predate the template (no `Spec ID:` line) are read as
context. They are not migrated and not edited by the agent. `spec-lint` skips them when
called as a library and reports a missing `Spec ID:` when one is passed on the command
line.

## Deleting

Delete a spec only when the feature is abandoned; otherwise leave it, so the superseding
chain stays readable. Do not leave a `draft` that no longer reflects intent where an
agent will read it as current.
