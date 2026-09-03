---
handoff:      2026-08-31-2200--design-track-entry-point
written:      2026-08-31 22:00 -0400
sessionStart: 2026-08-31 17:30 -0400
sessionId:    a87c4347-3cea-4308-8683-3f1282ef7009
agentRuns:    none on this track — this session worked the ARENA track and infrastructure
branch:       design/endless-progression-owner-packet
commits:      9e60820 (rules files), then this
suite:        not run on this branch — see "Do not trust HANDOFF.md here"
supersedes:   none
---
# Handoff — the design track's entry point

**Written by the arena/infrastructure session, NOT by a design session.** It is
navigation only: where things are and what is open. It deliberately contains no
design opinions, because the author did not do the design work and must not
appear to have.

## Why this file exists

`AGENTS.md` tells every agent to read the newest file in `docs/handoffs/` first.
That directory did not exist on this branch, so the instruction pointed at
nothing. This is that file.

## Where you are

- Branch `design/endless-progression-owner-packet`, worktree
  `~/projects/ss2-progression-design` (WSL, ext4).
- It shares ONE `.git` with the arena tree at
  `~/projects/swords-and-sandals-2-multiplayer`. Same repository, same GitHub
  remote (`github`), different branch. Two folders, one project.
- Launch Codex here with `sol` (newest Sol, ultra effort, full access).

## The resumption point, in one line

**`docs/design/endless-progression-owner-packet.md` — three decision clusters
awaiting the owner, each with a prefilled recommendation and a closing "card".**

That is the manual-intervention step the last session stopped at. The packet is
structured so the owner confirms or overrides rather than starting from a blank
page:

- **Cluster 1** — progression ceiling (`EP-A01` proposed replacement)
- **Cluster 2** — Circuits, rewards, maintenance (licence event, tray
  activation, catalog reopen)
- **Cluster 3** — determinism and first proof (`F1`/`F2` forecasting, `R1`
  exact-state Rematch, recovery/assistance/overtime)

## What is already settled — do not reopen without cause

`docs/design/endless-progression-decisions.md` records six decisions, `EP-D01`
through `EP-D06`, each with the reasoning. Read them before proposing anything
that contradicts one.

## What blocks the MVP

`docs/design/endless-mvp-readiness.md` § 3 lists six P0 contradictions and
specification blockers, `R-01` through `R-06`, plus an adversarial rejection
envelope and the required architecture specifications in §§ 4.1–6.

## DO NOT TRUST `HANDOFF.md` ON THIS BRANCH

It is **264 lines and stale**. The arena branch's copy is **1050 lines** and is
the live one. This branch is **49 commits behind** `arena/champion-capture` and
diverged at `e3f14aa`. For anything about the arena track, the capture pipeline,
the test profiles or the environment, read the arena branch — do not read the
copy sitting next to you here.

## The quarantine cuts BOTH ways

`HANDOFF.md` (the live one) states the rule: a candidate fitted to a design is a
candidate fitted to a hypothesis, and the capture that "confirms" it confirms a
fit rather than a prediction. So:

- **Arena agents must not read `docs/design/**` while authoring a fixture.**
- **Design work must not reach into candidate authoring**, and design documents
  must not be cited as evidence for a fixture value.

The two working trees exist to make that structural rather than aspirational.
Keep them separate.

## Environment, if you are the first session here

WSL2 Ubuntu 24.04, node v26.3.1, codex-cli 0.151.0 authenticated, Claude Code
2.1.252. Codex has `diagnosing-bugs` and `writing-for-agents` in
`~/.agents/skills` — deliberately NOT `code-review`, so Claude and Codex do not
correlate as reviewers. Tests run `node --test --test-concurrency=1`; a tree
without the gitignored `captures/` archive correctly reports 1 skipped.

**Agent memory does not cross machines or environments.** Whatever a previous
Codex session on Windows discussed is not available here. This file and the
`docs/design/` documents are the continuity — which is why the last session
wrote the owner packet down instead of leaving it in a conversation.
