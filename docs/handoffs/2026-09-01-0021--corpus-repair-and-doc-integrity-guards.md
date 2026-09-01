---
handoff:      2026-09-01-0021--corpus-repair-and-doc-integrity-guards
written:      2026-09-01 00:21 -0400
sessionStart: 2026-08-31 21:45 -0400
sessionId:    18794878-3f14-4d59-a445-3cffadb515e9
agentRuns:    wf_b8db5d79-98f (6 question-diverse investigators + 6 write-nothing verifiers; 12 briefed, 12 returned)
branch:       arena/champion-capture
commits:      9d8103e..<tip>   # run `git log --oneline -1`; pushed state with `git log --oneline @{u}..HEAD`
suite:        628 tests / 627 passed / 0 failed / 1 skipped (WSL, fresh-clone profile)
environment:  WSL2 Ubuntu 24.04, node v26.3.1, ~/projects/swords-and-sandals-2-multiplayer
supersedes:   2026-08-31-2244--self-citing-goldens-repromoted
---
# Handoff — 2026-09-01 00:21, corpus repair and doc-integrity guards

**Supersedes `2026-08-31-2244`, which was written mid-session and is stale in
both its numbers** (it says 624/623/1 and `..4bda5fc`). Read this one; that one
is a record of what was believed at 22:44.

**A second handoff closes the same night**, from the parallel Windows session:
`2026-09-01-0030--migration-closeout-and-what-is-untested.md`. It sorts AFTER
this one, so "the latest handoff" lands there first. That is correct and its
stamp is honest; this file was simply finished a few minutes earlier. **It is
the migration brief, not the corpus brief** — it covers the WSL/Windows split
and what has never been exercised on this machine. For the goldens, the
promotion driver and the ranked work, this is the file.

## Where things stand

- Branch `arena/champion-capture`, tree clean, **628 / 627 / 0 / 1** — measured,
  not derived. The skip is the raw-trace archive check and is correct here.
- `github/main` is **`362859a`**, and this branch is **61 commits ahead of it
  with no PR**. Re-derive both; do not trust these.
- **You are probably alone in this repo now.** The parallel Windows session went
  quiet at 2026-09-01 00:1x. If you start a second writer, read
  `HANDOFF.md` § "Sequential, never parallel" first.

## Read first, in order

1. `HANDOFF.md` § "What to read, and what you may skip" — NEW this session. It
   is a map of what you may skip, keyed on what you are about to do. Use it;
   the head is ~880 lines and you do not need most of it.
2. `HANDOFF.md` § "READ THIS FIRST — corrections from the 2026-08-31 audit pass".
3. This file's "Traps" below.

Do not read `2026-09-01-0030--migration-closeout-and-what-is-untested.md` for
corpus state — it is the other session's brief and is about the WSL migration.
It is worth reading for what is UNTESTED on this machine.

## Highest-value work, ranked, with the reason

1. **The fresh-nonce residual.** Now the largest known hole, and this session
   sharpened why: the corpus cannot distinguish an honest repeat from a copy at
   all — every matching record for a candidate collapses to one content group
   once ids and timestamps are stripped. So the residual is not ceremony; there
   is no mechanism that could tell a minted-nonce copy from a capture. The one
   artifact that can is the raw trace, which is Windows-side.
2. **`obs-fr1`'s unpropagated nonce — cheapest win available, needs Windows.**
   Reported to carry a `launchNonce` in its RAW trace that ingest never put on
   the record. If it holds, re-ingesting strengthens the weakest of the four
   goldens with no new capture, AND it means ingest can silently drop the one
   identity the operator does not choose. **Unverified here — confirm against
   the archive before acting.**
3. **Make `settle` deterministic.** `captureManifestSha256` is a fact about when
   settle ran, not about the evidence. Do it for all 22 manifests at once or not
   at all; doing it for four gives them different semantics from the rest.
4. **`provenance.observedAt` should be a span, not a max** — it gets less
   informative as evidence grows.
5. **Contradicted scalars in non-promoted fixtures**, and the stub rewrite.

Ranked on value. **Reachability is NOT established for any of these** — which
is the correction this session earned the hard way: last session's #1 was
blocked by an undocumented driver defect and cost a driver change plus eleven
test repairs before it could start. A rank that silently implies actionability
is the defect.

## Traps from this session

- **A test can pre-register its own deletion and be wrong.** One said in its own
  comment "this test fails and should be deleted rather than adjusted."
  Following that literally left a silent filter that measurably REWARDED the
  defect it named: planting a self-citing golden back removed a failure — nine
  with the plant, ten without. **An instruction a previous session left in a
  comment is a hypothesis like any other.**
- **Every obvious repair to a failing guard was a weakening, and each had a
  fourth option.** Splitting a comparison beat relaxing it, and came out
  stronger than what it replaced. Look for the fourth option.
- **A doc pointer nobody checks rots, and a map that dead-ends is worse than no
  map.** The new reading map failed its own guard on three dead references on
  the first run. Three doc-integrity guards now exist in
  `test/handoff-navigation.test.js`; they are cheap and they have all fired.
- **The living head carried mutually exclusive CURRENT instructions** — three
  topics, found by an external audit, all confirmed by re-derivation. One was a
  retraction that reached one of the two copies of the instruction it was
  retracting, while itself teaching "retract AT THE INSTRUCTION". A test can
  prove a heading exists; nothing can see semantic conflict. **When you correct
  an instruction, grep the topic and correct EVERY site.**
- **My own, and the pattern is the finding:** I relayed a paraphrase as a
  quotation in a subagent brief, and a verifier caught it. Separately, the one
  time each session generalised from a single caller without checking — a
  node/PATH diagnosis, and my "genuinely independent evidence" claim — both went
  wrong the same way. Re-derive; do not generalise from one caller.
- **Remit drift, both sessions, unnoticed at the time.** Recorded in the head
  because it bears on how far to trust what we wrote in one night.

## Hard rules

Verbatim from `HANDOFF.md` § "Non-negotiable rules":

- Licensed SWFs are read-only and hash-verified before and after every capture.
- **Never shortcut the game's own frames.**
- A candidate becomes golden ONLY via >=2 matching observations from >=2
  sessions. **Never hand-write a golden, observation or manifest.**
- **Derive candidates from the battle map, never from a capture.**
- `validate-vehicle.ps1` must PASS after ANY wrapper edit — and read what it
  does not prove.
- Snapshot before every save-mutating run.
- **Do not push to `main`. Ask before pushing anything.**
- Adversarial verifiers write nothing at all.
