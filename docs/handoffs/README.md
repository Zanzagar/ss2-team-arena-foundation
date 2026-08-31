# Session handoffs

A numbered handoff is the **brief for one session**: what to do next, in what
order, and what not to do. Starting a session should cost one sentence —

> read `docs/handoffs/H-003.md` and proceed

— rather than a pasted wall of context that goes stale the moment it is sent.

## The two documents are not the same thing, and must not drift into each other

| | `HANDOFF.md` (repo root) | `docs/handoffs/H-NNN.md` |
| --- | --- | --- |
| What it is | the accumulated **state** of the project | the **brief** for one session |
| Answers | "what is true, and what was found" | "what should I do now" |
| Grows | yes, and it is ~700 lines | no — one screen, ideally |
| Lifetime | permanent, corrected in place | frozen once the session ends |

A handoff **points at** `HANDOFF.md` for state. It must not restate it. The
moment a handoff starts explaining findings, it has become a second copy of the
state document, and the two will disagree — which is worse than having only one.

If a fact belongs to the project, it goes in `HANDOFF.md`. If it belongs to
"what the next person should do about it", it goes in a handoff.

## Writing one

Number sequentially, zero-padded: `H-001.md`, `H-002.md`. Never renumber and
never edit a handoff after its session ends — a closed handoff is a record of
what was believed at that moment, and later sessions cite it. Corrections belong
in the NEXT handoff and in `HANDOFF.md`.

Keep this shape; it is what worked:

1. **Where things stand** — branch, commit, remote, test count. Two or three lines.
2. **Read first, in order** — usually `HANDOFF.md`'s corrections block, then this.
3. **Highest-value work**, ranked, with the reason each is ranked there.
4. **Hard rules** — the non-negotiables, verbatim. They are short and repeating
   them costs nothing; assuming them has cost whole tracks.
5. **Traps from last session** — concrete, specific, ideally the author's own
   mistakes. This section has consistently been the most valuable one.

State the test count and the exact command. A session that starts by measuring a
different number than the handoff promised has found something on its first
minute, and that only works if the number was written down.

## Index

| ID | Date | Session that wrote it | One line |
| --- | --- | --- | --- |
| [H-001](H-001.md) | 2026-08-31 | corpus integrity audit + provenance repair | 5 transcriptions found, provenance made honest, pairwise gate decoupled; levelling reopens 22 fixtures |
