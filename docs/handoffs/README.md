# Session handoffs

A handoff is the **brief for one session**: what to do next, in what order, and
what not to do. Starting a session should cost one sentence —

> read the latest handoff in `docs/handoffs/` and proceed

— rather than a pasted wall of context that goes stale the moment it is sent.

## Naming

```
docs/handoffs/YYYY-MM-DD-HHMM--short-slug.md
              2026-08-31-1238--corpus-audit-provenance-repair.md
```

Local date and time **when the handoff was written** (which is the end of its
session), then a slug naming what the session was about. Local rather than UTC
because a human reads it; the offset is recorded in the frontmatter, so nothing
is ambiguous. No colons — Windows forbids them in filenames.

The names sort chronologically, so `ls docs/handoffs/` puts the newest last and
"the latest handoff" is unambiguous without an index to consult.

Sequential `H-NNN` numbering was tried first and dropped: a number tells you
nothing about when it was written or whether it is still current, and a stale
brief that looks authoritative is worse than no brief.

## Frontmatter

Every handoff opens with it. This is the part that makes a handoff traceable
back to the work rather than just readable:

```yaml
---
handoff:      2026-08-31-1238--corpus-audit-provenance-repair
written:      2026-08-31 12:38 -0400
sessionStart: 2026-08-31 09:39 -0400
sessionId:    4a79fa7f-176b-455c-aa91-372038a141af
agentRuns:    wf_bc86037b-0f9 (13 auditors), wf_d2aa6793-7cb (1 writer + 3 verifiers)
branch:       arena/champion-capture
commits:      73f7fba..2585952
suite:        617 passed / 0 failed / 0 skipped
supersedes:   none
---
```

`sessionId` and `agentRuns` are the load-bearing ones. Every subagent's full
transcript, its brief included, is recoverable at:

```
%USERPROFILE%\.claude\projects\C--Users-corey-OneDrive-Documents-ChatGPT-SS2-Multiplayer-Mod\
  <sessionId>\subagents\workflows\<runId>\
```

So a later session can read exactly what an auditor was asked and what it
answered, instead of trusting a summary of it. `docs/overnight-agent-plan.md`
already depends on that path, and every number in it was derived that way.

`suite` must state the exact count. A session that measures a different number on
its first minute has found something — and that only works if the number was
written down. A **skip** in particular means a path derivation broke.

Record hashes as a `commits:` RANGE, not a tip. The tip is written before the
last commit of the session exists, so a tip hash in the body is wrong by
construction; tell the reader to run `git log --oneline -1` instead.

## The two documents are not the same thing, and must not drift

| | `HANDOFF.md` (repo root) | `docs/handoffs/<stamp>--<slug>.md` |
| --- | --- | --- |
| What it is | the accumulated **state** of the project | the **brief** for one session |
| Answers | "what is true, and what was found" | "what should I do now" |
| Grows | yes, and it is ~800 lines | no — one screen, ideally |
| Lifetime | permanent, corrected in place | frozen when the session ends |

**`HANDOFF.md` is itself split (2026-08-31).** Above its `## THE ARCHIVE LINE`
heading is the LIVING HEAD — state, rules, next steps, open items — which is
appended to and corrected in place; below it is frozen evidence. So the
correction path is: the living head, plus the next handoff. That split exists
because a handoff freezes when its session ends, and a correction with nowhere
live to land never reaches the next reader.

A handoff **points at** `HANDOFF.md` for state. It must not restate it. The
moment a handoff starts explaining findings it has become a second state
document, and the two will disagree — which is worse than having one. If they
ever do disagree, `HANDOFF.md` is right and the handoff was frozen earlier.

If a fact belongs to the project, it goes in `HANDOFF.md`. If it belongs to "what
the next person should do about it", it goes in a handoff.

## Writing one

**Never edit a handoff after its session ends.** It is a record of what was
believed at that moment, and later sessions cite it. Corrections go in the next
handoff (name it in `supersedes:`) and in `HANDOFF.md`.

Keep this shape; it is what worked:

1. **Where things stand** — branch, remote, test count. Two or three lines.
2. **Read first, in order** — usually `HANDOFF.md`'s corrections block, then this.
3. **Highest-value work**, ranked, *with the reason each is ranked there*. The
   ranking is the actual deliverable; a flat list makes the next session
   re-derive the priorities.
4. **Hard rules** — the non-negotiables, verbatim. They are short, and assuming
   them instead of repeating them has cost whole tracks.
5. **Traps from this session** — concrete, specific, ideally the author's own
   mistakes. This section has consistently been the most valuable one.

## Index — newest first

| Handoff | Session | One line |
| --- | --- | --- |
| [2026-08-31 18:20 — the pairwise gate, measured](2026-08-31-1820--pairwise-gate-measured.md) | `a87c4347` | The gate HAS teeth (407 leaves at callSite) and on committed evidence refuses nothing, because the nonce check fires forty lines earlier; "162" reproduces exactly; the fresh-nonce hole also unlocks the authored-from gate |
| [2026-08-31 14:43 — nonce gate, stat arithmetic, toolchain](2026-08-31-1443--nonce-gate-stat-arithmetic-toolchain.md) | `e386f047` | A record’s own copy stopped counting as the second session; the stat-vector arithmetic settled the 22 written-off fixtures; one shared AGENTS.md for both agents |
| [2026-08-31 12:38 — corpus audit and provenance repair](2026-08-31-1238--corpus-audit-provenance-repair.md) | `4a79fa7f` | 5 transcriptions found (not 23), provenance made honest, pairwise gate decoupled from the matcher; levelling reopens 22 fixtures |
