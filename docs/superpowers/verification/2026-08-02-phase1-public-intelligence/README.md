# Phase 1 Public Intelligence — task reviews and reports

Durable archive of the review records and worker reports for the
`phase1-public-intelligence` Pact feature.

## Why these live here

`.superpowers/` is gitignored by project convention, so worker reports and reviewer records
existed only as local files. On 2026-08-03 the `/private/tmp` worktree these were written in
was partially deleted by macOS temp cleanup. Committed code was safe on `origin`; these
records were not, and survived only by luck.

Pact evidence links each task to `.superpowers/sdd/<plan>/task-N-report.md`. Those paths
remain the working location that agents write to during a task. This directory is the
committed copy, so the audit trail survives a lost worktree.

Both copies are kept in sync at acceptance time. The gitignore arrangement will be
consolidated before release; until then, treat this directory as authoritative if the two
ever disagree.

## Contents

| File | What it is |
|---|---|
| `sdd-progress-ledger.md` | The running SDD ledger: decisions, plan corrections, environment history, and every ruling made during execution |
| `task-2-report.md` / `task-2-review.md` | Public IA design gate (T3 shell) — worker report, reviewer record |
| `task-3-report.md` / `task-3-review.md` | Readiness-gated hubs — worker report, reviewer record |
| `task-4-report.md` / `task-4-review.md` | Canonical changes experience — worker report, reviewer record |

Task 1 (`public-content-schema`) predates this arrangement; its report is referenced from
Pact evidence and lives only in `.superpowers/`.

## Reading the reviews

Each review separates what the reviewer **reproduced independently** from what the worker
claimed. Findings are graded blocking vs. recorded debt, and reviewer mistakes are recorded
alongside worker ones — including one criticism that was raised and then formally withdrawn
when the worker turned out to be right.

Debt carried forward is stated in each review rather than assumed remembered. Two items bind
later tasks:

- **Task 8** must run a site-wide internal-link integrity crawl that fails on any internal
  link returning non-200 — not merely a sitemap crawl.
- **Task 9** must not proceed while any internal link on a public page returns 404.

A third rule came out of Task 3 and applies to every remaining task: a `loading.tsx` must
never sit above a readiness-gated route, because a route-group loading boundary flushes the
shell before `notFound()` runs and turns a real 404 into a soft 200. It is locked by
`test/e2e/public-hubs.spec.ts`.
