---
handoff:      2026-08-31-2244--self-citing-goldens-repromoted
written:      2026-08-31 22:44 -0400
sessionStart: 2026-08-31 21:45 -0400
sessionId:    18794878-3f14-4d59-a445-3cffadb515e9
agentRuns:    wf_b8db5d79-98f (6 question-diverse investigators + 6 write-nothing verifiers; 12 briefed, 12 returned)
branch:       arena/champion-capture
commits:      9d8103e..4bda5fc   # check pushed state with `git log --oneline @{u}..HEAD`
suite:        624 tests / 623 passed / 0 failed / 1 skipped (WSL, fresh-clone profile)
environment:  WSL2 Ubuntu 24.04, node v26.3.1, ~/projects/swords-and-sandals-2-multiplayer
supersedes:   none
---
# Handoff — 2026-08-31 22:44, the four self-citing goldens are re-promoted

See [`README.md`](README.md) for what a handoff is and is not.
State lives in `HANDOFF.md`'s living head; this is one session's brief.

## Where things stand

- Branch `arena/champion-capture`, tip **`4bda5fc`**, working tree clean.
  **NOT PUSHED** — the rule is to ask Corey first and I did not.
- **624 tests / 623 passed / 0 failed / 1 skipped**, measured, not derived. The
  skip is the raw-trace archive check and is the correct WSL profile.
  Was 622/621/1; net +2 tests, one removed.
- The previous handoff's **ranked item 1 is DONE and CLOSED.**

## What landed — `4bda5fc`

All four self-citing normal-band goldens are re-promoted through
`campaign.mjs settle`, from every other committed record that matches them.
No rename, no minted nonce, no hand edit — **not** the fresh-nonce composition
the last handoff described. `scenario`, `samples` and `expected` are
byte-identical to what they were, checked against HEAD: this changed
provenance, not measurement. Evidence went 2 -> 3, 2 -> 5, 2 -> 9, 2 -> 4.

**The re-promotion was not the hard part.** Six write-nothing verifiers on one
named claim each returned FIVE BROKEN and one PARTIALLY-BROKEN. None refuted
the re-promotion; all proved the simple version of it would have left the tree
worse. Three driver defects fell out and are fixed in the same commit:

1. **`settle` wrote the capture manifest BEFORE asking the gate**, and never
   rolled it back. A refused run deposited a session-independence attestation
   for evidence just refused — and `git checkout -- .` does not remove an
   untracked file, so the wreckage survived the obvious cleanup with the suite
   fully green over it. Promotes first, writes second now.
2. **Nothing walked manifest -> golden.** 26 manifests against 22 goldens
   passed everything. There is now a guard, proved red by planting the retired
   `[obs-diag, obs-gold3]` attestation.
3. **`computeCoverage` counted the record the gate refuses**, so `settle`
   could not have done this at all. One exported predicate,
   `ss2ObservationIsCandidatesOwnSource`, is now called by both gate and driver.

## Read this before you quote the result

**The corpus cannot distinguish an honest repeat from a copy, and this change
does not alter that.** Every matching record for these candidates collapses to
ONE content group once ids, digests and timestamps are stripped. The raw trace
could separate them; `captures/` is Windows-side. Full statement, with the
per-golden strength differences, is in `HANDOFF.md` § "What the re-promotion
did and did not establish". `golden-prisoner-normal-kill-dir6` is strong;
`golden-prisoner-normal-kill` is weak — 3 records, ONE nonce, zero comparable
nonce pairs.

**The pairwise gate is now REACHABLE from committed evidence for the first
time** — 9 nonce-bearing cited records where there were 0. "ZERO of the
observation ids the goldens cite carries a launchNonce" is now FALSE and is
corrected in the gate's own comment, in `pairwise-gate-dormancy.mjs`,
`docs/roadmap.md` and `ss2-runtime-capture.md`. Reachable is not protecting:
what reaches it are forgeries the tests construct.

## Traps from this session

- **A test can pre-register its own deletion and be wrong.** "a golden that
  cites its own candidate's source record is not re-promotable" said in its own
  comment "this test fails and should be deleted rather than adjusted."
  Following that literally leaves `goldenPartition.eligible` a silent filter:
  measured, planting a self-citing golden back REMOVED a failure — nine with
  the plant, ten without, none naming it. A self-citing golden was cheaper to
  hold than an honest one. **An instruction a previous session left in a
  comment is a hypothesis like any other.**
- **Every obvious repair to a failing guard here was a weakening**, and each had
  a fourth option. `repetitions 2 !== 9` could be greened by projecting
  `repetitions` out (deletes the only check a promotion counts its evidence) or
  by widening the pair (forces deleting the nonce-free assertion). Splitting the
  comparison — body deep-equal, provenance derived in full from the evidence —
  came out stronger than what it replaced.
- **The task ranked #1 was blocked by an unrecorded driver defect.** Nothing
  said `settle` could not do it. Rank an item and you imply it is actionable.
- **A verifier caught me quoting a commit message as if it were the handoff.**
  "pipeline only, never by hand" is in `HANDOFF.md`'s head and `7856e2b`; the
  handoff item leads with the forgery finding instead. The substance held.

## Highest-value work, ranked

1. **The fresh-nonce residual** (was item 3). Unchanged by this session and now
   the largest known hole: a forger who mints a nonce for a copy is refused by
   nothing. Note what this session measured about it — the honest records are
   indistinguishable from copies too, so the residual is not merely theoretical
   ceremony; the pipeline has no mechanism that could tell them apart.
2. **Make `settle` deterministic.** `captureManifestSha256` is a fact about
   when settle ran: `buildSs2CaptureManifest` defaults `createdAt` to the wall
   clock and the driver passes nothing. Deliberately NOT changed here, because
   it would give four manifests different semantics from the other eighteen.
   Do it as its own change, for all of them.
3. **`provenance.observedAt` should be a span, not a max.** It gets less
   informative as evidence grows; dir6's now summarises 3h49m in one scalar.
4. **The HANDOFF.md restructure** — still not done, still deliberately.
5. **Contradicted scalars in non-promoted fixtures**, and the stub rewrite.

## Cross-session note

A Windows session (`session_01RSx5D6hQyKGacFLf44bExo`) has commit `cd77854`
awaiting Corey's approval to push, fixing three AGENTS.md/HANDOFF.md defects.
I reported back to it; delivery was accepted but not confirmed. **Its claim
that node is missing under `bash -c` in WSL is wrong for agent sessions** —
this harness initialises its shell from the profile, so PATH is inherited and
node resolved in every call. It is right only where PATH is scrubbed (`env -i`,
cron, hooks), and its remedy works there. **Pull `cd77854` before editing
AGENTS.md or the living head** — otherwise two sessions edit the one file that
must not be merged carelessly.

## Hard rules

Unchanged; `HANDOFF.md` § "Non-negotiable rules". The ones this session leaned
on: never hand-write a golden, observation or manifest; adversarial verifiers
write nothing; ask before pushing.
