# Measured, not asserted — weekly progress update

**1 September 2026 · branch `arena/champion-capture`**

A session spent proving that a modern combat engine matches a 2005 Flash game —
and the four times the evidence turned around and corrected me.

---

## The premise: a test suite that isn't allowed to lie

*Swords & Sandals II* is a gladiator game from 2005, written in Flash. This
project is building a multiplayer version of its combat, which means a modern
engine has to reproduce the original's maths exactly: every damage roll, every
armour deflection, every point of stamina.

You could read the old code and write down what it appears to do. This project
refuses to, because a number you *assert* and a number you *measured* look
identical once written down, and only one of them is true.

So instead: predict an outcome by reading the game's compiled bytecode, then run
the real game under an emulator with instruments attached and see what happens.
When two independent runs agree with the prediction, that becomes a **golden** —
a fixture that has earned its place. Everything else is a candidate, and
candidates do not count.

> The entire value of the corpus is that its numbers were measured, not asserted.
> Almost every rule exists to stop someone quietly turning evidence into
> self-confirming data.

That discipline is the whole story of the session. It is also what made it
interesting, because it kept catching *me*.

---

## 01 · Four invisible walls  — RESOLVED

The machine had recently moved from Windows to Linux and nobody had run a capture
since. The pipeline was documented as working. It was not, and it failed in a way
that pointed at the wrong culprit: the emulator launched, loaded the game, and
produced nothing, while the tooling reported *"no capture-trace lines found"* —
which reads exactly like a broken instrument.

Four separate discoveries were needed to get one clean run:

1. The Windows scripts were blocked by an execution policy.
2. The game's entire save universe — including 74 restore points — lives inside a
   sandboxed app container, not where the docs said.
3. **The emulator ignores the environment variable everything else uses.** It
   resolves its own profile through a different Windows API, so it was starting
   from an empty profile and silently stalling on a missing video decoder.
4. The container's real path is 47 characters longer than the scripts expect,
   which blew past Windows' maximum path length and left a **half-written backup
   that could not even be deleted** — a corrupt snapshot sitting in the list
   looking exactly like a real one.

All four are now written down, and the first capture in days ran clean.

## 02 · The save had moved on — PREMISE WRONG

Two test captures came back empty. The owner mentioned in passing that his
gladiator had progressed past the dungeon prisoner fight.

That one sentence explained it. The prisoner is an *early-game* opponent — and
**all 22 verified fixtures are prisoner-family fights.** The save had walked past
the only door they can be reproduced through.

It also reframed the snapshots: they are not a safety net, they are the only route
back to earlier states, which makes them load-bearing evidence infrastructure —
held in one place, mirrored to an external drive that is usually unplugged. The
live save was snapshotted before anything else was touched.

## 03 · Not bad luck — bad fixtures — DIAGNOSIS REVERSED TWICE

One family of tests had failed 11 times and never passed. The project's own
planning tool said to simply run more attempts: *"the remedy is more rounds, not a
code change."*

All 11 failures came down to one number: how much stamina each fighter had left.

For the player, the bytecode gives a clean answer — stamina drops by exactly one
per step taken — and across **38 recorded battles that held 38 times, no
exceptions.** Genuinely deterministic.

The opponent was another matter, and I got it wrong twice.

**First error.** I found the opponent's stamina matched the operator's staged
value in all 11 runs and concluded someone had typed the wrong number. Then I read
the instrument's source: those two values are *read from the same place, one line
apart*. The agreement was a tautology, not a measurement. Reading the tool beat
measuring harder.

**Second error.** An analysis then derived the "correct" value as 110 rather than
the 105 in the file, with bytecode to back it. I wrote *"the arithmetic is
closed"* into the project's permanent notes. Before editing anything, I checked
how often 110 actually occurs: **2 times in 38.** The derivation had assumed the
opponent took zero turns — in a battle where the player took five steps. Both
numbers were guesses wearing arithmetic. Retracted.

The check that caught it took one script and about a minute, and it ran *before*
the edit rather than after. That is the only reason it is a retraction instead of
a defect sitting in the test suite.

## 04 · One opponent, verified twenty-two ways — VERIFIED

Chasing that thread produced the session's real result. Checking every fixture at
once:

| Across all 82 fixtures | Count |
| --- | ---: |
| Pin the opponent's stamina as a fixed expected value | **82 of 82** |
| Pin `speed` — the stat that *determines* that stamina | **0 of 82** |
| Distinct opponent profiles among the 22 verified fixtures | **1** |

Every verified fixture fights the same opponent: a training-dummy prisoner with
*every stat at zero*. The game clamps movement speed to a floor of 4, so for an
opponent with no speed the missing pin cannot bite — the number comes out right by
accident of who you are fighting.

Every other opponent is randomly generated, with speed and strength redrawn each
battle. There the omission is live. And it is invisible as well as unpinned:
`speed` is not in the instrument's watch list, so no recording has ever captured
it varying.

The roadmap says the remaining work is *"breadth."* It is not. Twenty-two fixtures
against one opponent is one opponent verified twenty-two ways. Reaching a second
one is a design question about what a test must state up front — much cheaper to
answer now than after another 38 fixtures are written in the same shape.

## 05 · Forty missing fingerprints — DECISION PENDING

Every recording carries a token minted inside the emulator at launch: the one
identifier a human does not choose, and therefore the only thing that can prove
two recordings came from two genuinely separate sessions rather than one copied
twice.

Forty recordings have that token sitting in their raw archived logs, and it never
reached the saved record. It is recoverable without re-running anything. But
acting on it changes each record's fingerprint, and **20 of the 22 verified
fixtures cite one**, so the whole set would need re-certifying.

One check makes it genuinely delicate. An adversarial reviewer took a record and
re-sealed it with a *fabricated* token, then a token *stolen* from a different
record, then *no token at all*. All three passed validation with zero differences
flagged — nothing in the project can distinguish a recovered fingerprint from an
invented one.

So the tool built for this (`tools/recover-launch-nonces.mjs`) deliberately has
**no ability to write.** It reports only, and is designed so anyone can re-run it
and get the same forty tokens. Reproducibility is the only assurance available; a
checkbox afterwards would be theatre.

---

## The method: six hundred assistants who do not trust each other

Verification runs as a fan-out. Six investigators each get a *different* question
— never the same brief, because this project measured the alternative: two
independent analyses once agreed on every number and were both wrong in the
identical way, because they shared one briefing containing one wrong fact.

Then every individual claim those investigators make gets its own adversarial
checker whose only job is to *break* that one sentence, working from the real code
rather than anyone's report.

| | |
| --- | ---: |
| Agents run | 671 |
| Verdicts returned | 458 |
| Claims broken or dented | 114 |
| Commits | 17 |

**What that bought.** One checker, pointed at an unrelated claim, noticed the
project's master notes **contradict themselves 140 lines apart** about which
fixtures carry a fingerprint. One found the archive holds **42 recorded battles,
38 of them complete, but only 11 ever filed** — the project had been
under-counting its own evidence by more than three times. One caught a statistic
in two source files that had rotted from "113 of 177" to 153 of 221. And one
noticed the archive was being *written to during the audit* — by this session's
own test captures — which is why three agents' counts disagreed and none of them
was wrong.

**My own worst call.** I discovered my briefing had misled a batch of checkers
into believing a data archive did not exist. Correct diagnosis. Then I rewrote the
briefing, which invalidated the cache and queued about 180 already-successful
agents to re-run in order to repair roughly 8 bad verdicts. The owner caught it
before it got expensive. The lesson is not "verify more" — it is *check what a fix
costs before you run it.*

---

## Where it leaves things

Nothing about the game's combat was proven wrong. The bytecode analysis held under
every check: every formula re-derived from the raw binary matched what was written
down. The game also survived a Steam update mid-project — only the launcher
changed, the game itself is byte-for-byte identical, and no existing evidence was
invalidated.

What changed is the understanding of what has been proven. The corpus is narrower
than its own roadmap describes — deep on one opponent, untested on every other —
and the next real step is a design decision, not more grinding.

| Test suite | Result |
| --- | ---: |
| Passing | 628 |
| Failing | 0 |
| Skipped (expected — archive is off-machine) | 1 |

### Where the detail lives

- `HANDOFF.md` — accumulated project state, corrected in place
- `docs/handoffs/2026-09-01-1250--wsl-capture-pipeline-and-armoured-fixture-defect.md`
  — the brief for whoever picks this up next
- `tools/recover-launch-nonces.mjs` — the report-only fingerprint tool
