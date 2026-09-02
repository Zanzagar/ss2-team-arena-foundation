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

**Derive this path, do not copy it — it is a function of the working directory,
and the working directory has moved twice.** Claude Code names the project
directory after the absolute path of the tree it was launched in, with the
separators flattened. So:

```
# WSL, measured 2026-09-01 — this is where the runs of the 2026-08-31 sessions are
~/.claude/projects/-home-corey-projects-swords-and-sandals-2-multiplayer/
  <sessionId>/subagents/workflows/<runId>/

# Windows: same rule, derived from whichever tree was used at the time.
%USERPROFILE%\.claude\projects\<flattened absolute path>\<sessionId>\subagents\workflows\<runId>\
```

The literal path this file used to give —
`C--Users-corey-OneDrive-Documents-ChatGPT-SS2-Multiplayer-Mod` — names the
RETIRED OneDrive tree. It was already stale when the Windows tree moved to
`C:\ss2-capture` on 2026-08-31, and it never described WSL at all. A path
written out literally in a document that calls it load-bearing is exactly the
thing that rots; the rule survives a relocation and a literal does not.

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
| [2026-09-02 01:30 — the corpus got a consumer, and the wave broke ten of twelve claims](2026-09-02-0130--ss2-rules-and-the-wave-that-broke-it.md) | `16532b60` | **`src/team/ss2-rules.js` exists**: SS2's own attack arithmetic runs inside the shared resolver, all 22 goldens replay through `createTeamBattle`/`applyAction`, and hot-seat plays it by default. Ranked items 1 and 2 of the previous brief, done. A 12-agent write-nothing wave broke **10 of 12** claims: the `rest` branch has its own `hitpoints += 3 + ceil(stamina)` at `+0x51d5` and this session had OVERRULED the map to say otherwise; and `death()` removes the phase transition, so a killing blow costs the attacker nothing — the replay test had been asserting nineteen times that the engine must disagree with the fixtures. Both fixed, both pinned, and two errors corrected in the battle map itself |
| [2026-09-01 21:12 — the project became playable](2026-09-01-2112--the-project-became-playable.md) | `6c06a03b` | **`node tools/hotseat.mjs` plays a fight** — the first playable thing here, after the owner asked whether the approach would let the project survive. Answer: the verification machinery had become the project; 22 goldens fed nothing. Adds the `map-derived` tier whose absence (not effort) blocked wiring SS2's real arithmetic in; retracts 2026-09-01-1550's ranked items 1 and 3 by measurement; makes the raw archive verifiable and mirrored. Three waves VERIFIED, 28 of 48 verdicts BROKEN |
| [2026-09-01 15:50 — Codex independence, and what the corpus actually proves](2026-09-01-1550--codex-independence-and-the-corpus-archetype.md) | `515e2223` | Supersedes 2026-09-01-1250. Both waves VERIFIED (209/209, 230/230); an outside Codex review found 67 wrongly committed traces that 758 agents missed; all 22 goldens fight ONE zero-stat opponent and 0 of 82 fixtures pin `speed`; the armoured fix is an arming-gate change already proven on another route |
| [2026-09-01 12:50 — WSL capture pipeline, and the armoured fixture defect](2026-09-01-1250--wsl-capture-pipeline-and-armoured-fixture-defect.md) | `515e2223` | Capture pipeline driven from WSL for the first time since the relocation; the armoured/tournament families are blocked by their own fixtures, a 110 derivation raised and retracted the same day (neither value is scenario-determined); both agent waves UNVERIFIED-PARTIAL with 109 dead verifiers |
| [2026-08-31 22:44 — the four self-citing goldens are re-promoted](2026-08-31-2244--self-citing-goldens-repromoted.md) | `18794878` | All four re-promoted pipeline-only from independent records; five verifier BROKENs exposed settle writing manifests before the gate, no manifest→golden guard, and a test whose prescribed deletion rewarded a self-citing golden |
| [2026-09-01 00:21 — corpus repair and doc-integrity guards](2026-09-01-0021--corpus-repair-and-doc-integrity-guards.md) | `18794878` | Supersedes 2026-08-31-2244. Four self-citing goldens re-promoted; settle no longer writes attestations before the gate; a test that rewarded the defect it named; three contradicting instructions in the head corrected; doc-pointer guards added |
| [2026-09-01 00:30 — migration close-out, and what is untested](2026-09-01-0030--migration-closeout-and-what-is-untested.md) | `a87c4347` | WSL is primary and Windows is episodic; an honest list of what was configured but never exercised, incl. the capture pipeline since relocation; save+snapshots backed up; the pinned build auto-updates |
| [2026-08-31 18:20 — the pairwise gate, measured](2026-08-31-1820--pairwise-gate-measured.md) | `a87c4347` | The gate HAS teeth (407 leaves at callSite) and on committed evidence refuses nothing, because the nonce check fires forty lines earlier; "162" reproduces exactly; the fresh-nonce hole also unlocks the authored-from gate |
| [2026-08-31 14:43 — nonce gate, stat arithmetic, toolchain](2026-08-31-1443--nonce-gate-stat-arithmetic-toolchain.md) | `e386f047` | A record’s own copy stopped counting as the second session; the stat-vector arithmetic settled the 22 written-off fixtures; one shared AGENTS.md for both agents |
| [2026-08-31 12:38 — corpus audit and provenance repair](2026-08-31-1238--corpus-audit-provenance-repair.md) | `4a79fa7f` | 5 transcriptions found (not 23), provenance made honest, pairwise gate decoupled from the matcher; levelling reopens 22 fixtures |
