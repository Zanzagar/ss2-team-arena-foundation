---
handoff:      2026-09-02-1745--codex-progression-workflow-adapted
written:      2026-09-02 17:45 -0400
sessionId:    01a063fa-2180-7500-b6ff-4e417d9f5f7d
agentRuns:    3 progression claim verifiers, 1 local harness audit, 1 AI Hero primary-source research lane; all write-nothing except the noted temporary-file mistake
branch:       design/endless-progression-owner-packet
baseCommit:   a9f9aad
commits:      4ebadd4, 20c9694, plus this handoff update
suite:        584 tests; 583 pass, 0 fail, 1 expected raw-trace-archive skip
supersedes:   2026-08-31-2200--design-track-entry-point
---
# Handoff — Codex progression workflow adapted; resume the owner frontier

## Resume in one sentence

Read
[`docs/design/codex-progression-workflow-assessment.md`](../design/codex-progression-workflow-assessment.md),
then use `$ss2-progression-design` to discuss
[`docs/design/ep-d01-vertical-power-matrix.md`](../design/ep-d01-vertical-power-matrix.md)
with the owner one decision at a time; EP-D01 and every other decision remain
pending until the owner explicitly approves a direction.

## User request completed in this turn

The owner asked whether Matt Pocock's AI Hero workflow should govern dedicated
Codex progression-system work, while preserving the separate Claude-to-Codex
FLAG-only adversarial-review role.

The researched verdict is **ADAPT, not wholesale adoption**:

- use the design-tree/frontier, recommendation, domain-language, and checkable
  completion disciplines;
- keep SS2's owner packet, authoritative decision record, readiness index,
  evidence quarantine, and dated handoffs;
- do not migrate this live effort to Wayfinder tickets;
- keep Pocock `code-review` out of this lane so indirect Codex review remains
  independent;
- defer to-spec/to-tickets/TDD until owner decisions close and implementation
  is separately authorized;
- leave any global `~/.agents/skills` migration to a separate change in the
  `claude-harness` repository.

## Committed implementation

- Added `.agents/skills/ss2-progression-design/SKILL.md` plus
  `agents/openai.yaml`. It is model-discoverable and drives one owner-guided
  frontier with concrete exploit/fault/migration checks and exact replay.
- Added `docs/design/codex-progression-workflow-assessment.md`, with first-party
  AI Hero, GitHub, and OpenAI citations and explicit evidence limits.
- Corrected `AGENTS.md` where it falsely claimed `.claude/settings.json`
  enforced Git policy on Codex and humans, where it implied every branch had a
  `.claude/workflows/` runnable form, and where it encouraged more verifiers
  despite the newer last-resort cap.
- Added `docs/design/ep-d01-vertical-power-matrix.md`, a non-authoritative
  comparison of ten vertical-power philosophies, opportunity-cost behavior,
  progression consequences, failure modes, cap placement, and opponent
  symmetry. Linked it from the owner packet without changing EP-D01's pending
  disposition.

Validation already run:

```text
skill quick_validate: PASS
local Markdown links: PASS
git diff --check: PASS
node --test --test-concurrency=1: 584 tests, 583 pass, 1 expected skip
```

Commits `4ebadd4` and `20c9694`, plus this handoff update, form the publication
unit the owner explicitly authorized for the existing feature branch. No merge
or push to `main` is authorized.

## Findings that overturned premises

1. The harness is installed for Claude but was not evidenced as its actual SS2
   working spine. A recursive parse of retained local Claude JSONL found zero
   explicit Pocock-skill calls and 28 `Workflow` calls. This is limited to
   explicit tool calls, but installation alone cannot be presented as use.
2. Direct Codex had only two harness-derived user skills, not the full Pocock
   spine. The harness installer still targets `~/.claude/skills`.
3. This design branch has no `.claude/` directory. The arena branch's Claude
   settings cannot mediate Codex or a human shell.
4. The harness ADR says Pocock has no fan-out, but upstream grilling, research,
   Wayfinder, and design-it-twice all use subagents in some form.
5. Pocock publishes a coherent method, not a controlled end-to-end validation
   for Codex game-economy design. The new adapter asserts fit and must earn
   retention through real sessions.

## Progression frontier exposed before the research detour

The packet remains non-authoritative and every decision remains pending.
Targeted write-nothing verifiers found these named counterexamples:

- **EP-A01:** “at most one level per set” is only an upper bound, so zero or
  every-other-set advancement satisfies it; the post-50 projection language
  can also conflict with frontier catch-up. A normative outcome table and exact
  cadence are still missing.
- **EP-A02:** F1/R1 do not yet define the paid root, creation/visibility timing,
  exact forecast UI schema, or complete Recovery restart semantics. Persisted
  future recipes and Assistance timing need reconciliation.
- **EP-A03:** M1 creates completion-timed access despite the no-spike wording;
  four tray units may not reproduce four active effects plus a Pivot reserve;
  L2 permits deliberate near-completion farming; retirement, host matching,
  coverage, and definition migration are not total.

Treat these as claims to resolve, not accepted conclusions. The owner has since
chosen a slower discussion cadence: expand and resolve one decision at a time,
starting with EP-D01. Do not ask the whole currently unblocked frontier in one
round.

## Process mistakes to keep visible

**Main-session mistake:** three progression verifiers were launched before the
newer synced `AGENTS.md` precedence was discovered. Under that rule, progression
design is a single human-in-the-loop lane, not a reason for a verifier wave.
Their counterexamples are useful, but this run is not precedent for repeating
the method.

**Subagent mistake:** the local harness auditor briefly wrote two sorted lists
under `/tmp` despite a write-nothing brief, removed both exact paths
immediately, and verified they no longer exist. It changed no repository,
configuration, installation, save, snapshot, or Git state.
