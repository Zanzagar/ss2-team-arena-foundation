---
handoff:      2026-08-31-1820--pairwise-gate-measured
written:      2026-08-31 18:20 -0400
sessionStart: 2026-08-31 17:30 -0400
sessionId:    a87c4347-3cea-4308-8683-3f1282ef7009
agentRuns:    wf_0192d778-833 (4 ground lenses + 2 independent implementations + 3 adversarial verifiers)
branch:       arena/champion-capture
commits:      1353c15..<tip>   # 5 commits; run `git log --oneline -1`. NOT PUSHED — see below
suite:        622 passed / 0 failed / 0 skipped
supersedes:   none
---
# Handoff — 2026-08-31 18:20, the pairwise gate, measured

See [`README.md`](README.md) for what a handoff is and is not.

## Where things stand

- Branch `arena/champion-capture`. **The five commits from this session are NOT
  pushed** — I did not ask, and the rule is to ask. Everything before them is in
  sync with the remote. Do not push to `main`.
- **622 / 0 / 0** capture-bearing, **622 tests / 621 passed / 1 skipped** in a
  detached worktree. Both re-measured, not derived. Confirm the tip with
  `git log --oneline -1`.
- `gh` is still not installed. `git ls-remote github "refs/pull/*/head"`.

## What landed

The previous handoff's ranked item 2 — "re-measure the pairwise gate's dormancy"
— is **done and closed**, and the answer is two facts that point opposite ways.

1. **`4c5d3e2` — `tools/pairwise-gate-dormancy.mjs`.** The claim had never had a
   script behind it. It does now. **The gate HAS TEETH**: 751 of 11,121
   single-leaf perturbations are free, and 407 of them — every one at
   `/samples/*/callSite` — this gate alone refuses. The free count is **exact**,
   not a lower bound, and the reason is structural.
2. **`6c851ba` — and on committed evidence the gate refuses NOTHING.** Zero of
   the observation ids the 22 goldens cite carries a `launchNonce`, all are
   waived only by digest, and every forgery re-digests — so the **nonce check**
   refuses all 18 eligible goldens' forgeries about forty lines earlier. Excising
   the pairwise loop changes zero verdicts. Both halves are now tests, and both
   were shown to fail when broken.
3. **`ce5699f` — the record corrected at the instruction, not only above it**,
   which is the failure the last handoff named. Six sites carried directives
   built on the dormancy claim; a grep for "dormant" finds four and misses every
   one of them, because they are phrased "precondition" and "Land no exclusion".
4. **`1353c15`** — the 14:43 handoff was never added to the index table in
   `docs/handoffs/README.md`, so the index's newest row was the second-newest
   handoff.

## Read this before you touch the staminaleft exclusion

**"The pairwise gate covers it" is not an argument you have.** The old comment
promised the gate was a dormant precondition that would start protecting the
corpus once an exclusion landed. It will not. On nonce-free evidence — which is
all the goldens cite — the gate is unreachable behind the nonce check, so an
exclusion landed today is backstopped there by nothing. The directive to land no
exclusion before the gate still stands; its stated reason is dead.

**And do not read "HAS TEETH" as "a hole closed".** Two things narrow it, both
now in the file and in the gate's own comment:

- All 407 committed samples carry ONE `callSite` literal, because the wrapper has
  one roll emitter stamping one compile-time constant. These teeth cannot bite
  two honest captures. This is the same fact that makes a fixture-derived
  `callSite` comparison something `HANDOFF.md` already refuses to add.
- **The gate catches disagreement, never falsehood.** Two records carrying the
  SAME fabricated `callSite` agree, match, and promote. The hook-attribution hole
  is exactly where it was.

## Highest-value work, ranked

1. **Re-promote the four self-citing goldens — and read the new finding first.**
   The fresh-nonce residual is worse than recorded: it also unlocks the
   authored-from gate, which compares `observationId` as a *string* while that
   field is invisible to the matcher and excluded from the pairwise projection.
   Rename the authored-from record, mint a fresh nonce, and **all four
   re-promote from the very records they were transcribed from — 4 of 4**,
   reproduced twice. The rename alone is refused, so this is a *composition* with
   the known nonce hole rather than a new one. `capture-campaign.test.js` asserts
   those four cannot be re-promoted from their own source record: true of the
   honest pipeline, bypassable by a forger. Different guarantees.
2. **The HANDOFF.md restructure, still NOT DONE and still deliberately so.**
   Unchanged from the last handoff: four verifiers returned BROKEN ×2 /
   PARTIALLY-BROKEN ×2, and the lens reports must not be applied as written. Read
   the refutations with them, at `wf_0828f636-618`.
3. **The fresh-nonce residual itself**, now that item 1 shows it reaches further
   than "a copy counting as a second session".
4. **Contradicted scalars in non-promoted fixtures**, and the stub rewrite.

## Traps from this session

- **A workflow's ground phase can hand every downstream agent the same wrong
  premise.** My brief asserted `/capture/installHashVerifiedBefore` was a free
  leaf; it is pinned by a strict `!== true`. One implementation caught it and
  said so prominently, which is the behaviour AGENTS.md asks for — but if both
  implementations had inherited it, three agreeing agents would have been three
  agents wrong together. Agreement between agents given a shared brief is weaker
  evidence than it looks; ask what they were all told.
- **The one experiment that mattered was the one nobody was asked for.** Two
  implementations and one verifier measured functions. The verifier told to drive
  the *real promotion entry point* found that the headline does not survive
  contact with it. Measuring the unit and measuring the path are different
  questions, and the second is the one a gate's value depends on.
- **A retraction can be wrong in the opposite direction to the thing it
  retracts.** "162 does not reproduce" was itself false — 162 is full-record
  leaves minus the digest, exactly, for eleven records. It measured two surfaces
  the original claim never used. When retracting a number, reproduce the
  original's method before concluding it was unreproducible.
- **My own error, and it is the one to watch for:** I wrote early on that the
  gate having teeth on `callSite` would mean the projection split closed
  something. It does not, for a reason the project had already written down about
  a different gate — agreement is what a pairwise check tests, so anything two
  forgeries can agree on is outside its reach by construction. I caught it before
  it reached the record, but only because I had flagged the question in advance.

## Hard rules

Unchanged; see `HANDOFF.md` § "Non-negotiable rules". The ones this session
leaned on: never hand-write a golden, observation or manifest; derive candidates
from the battle map, never from a capture; no agent runs a state-mutating git
command; adversarial verifiers write nothing; ask before pushing.
