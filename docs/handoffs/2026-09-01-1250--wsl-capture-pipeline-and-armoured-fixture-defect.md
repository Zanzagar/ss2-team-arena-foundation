---
handoff:      2026-09-01-1250--wsl-capture-pipeline-and-armoured-fixture-defect
written:      2026-09-01 12:50 -0400
sessionStart: 2026-09-01 00:30 -0400
sessionId:    515e2223-2bd5-49c7-9246-554a40e00772
agentRuns:    wf_8d57104d-417 (nonce recovery) — COMPLETED **VERIFIED**: 6/6 questions, 209/209 verifiers, 0 errors
              wf_e72fa4b5-b31 (armoured/tournament) — COMPLETED **VERIFIED**: 6/6 questions, 230/230 verifiers, 0 errors
              Digests of every returned agent: .audit-harvest/ (gitignored, 2.1 MB)
branch:       arena/champion-capture
commits:      194587f..<tip>   # run `git log --oneline -1`; unpushed with `git log --oneline @{u}..HEAD`
suite:        629 tests / 628 passed / 0 failed / 1 skipped (WSL, fresh-clone profile)
environment:  WSL2, node v26.3.1, ~/projects/swords-and-sandals-2-multiplayer
supersedes:   none
---
# Handoff — the capture pipeline runs from WSL, and the armoured family is blocked by its own fixtures

**BOTH WAVES COMPLETED VERIFIED** — wave 1 at 209/209 verifiers and wave 2 at
230/230, zero errors in either, after several rounds of usage-limit deaths were
re-run to completion. **Nothing below rests on an unreplicated agent report** —
every load-bearing number was re-derived by the main session directly, and an
independent Codex review re-derived the load-bearing ones a third time.

**AN INDEPENDENT CODEX REVIEW FOUND WHAT 758 AGENTS DID NOT**: 67 raw traces
committed and pushed by a `git add -A` after a subagent script wrote them into
`test/observations/ss2-1v1/undefined/arch/`. Removed, with a `.gitignore` rule and
a mutation-tested guard in `ss2-capture-attestation.test.js` that now fails by
name on any tracked trace. **They remain in pushed history at `4610132`; whether
to rewrite the branch is the owner's call.** That review also caught the retracted
"110" still standing at three other sites, and four defects of mine. Its findings
were treated as claims and re-derived before any was acted on.

**Every returned agent is digested in `.audit-harvest/` (gitignored).** Read that
before re-running anything; it holds 545 verdicts and 12 investigator reports across 758 agent transcripts.

## Where things stand

- Branch `arena/champion-capture`, clean, **629 / 628 / 0 / 1**.
- **NOTHING IS PUSHED.** The owner was asked and the week ended first. `github/arena/champion-capture` is at `98482b6`; this branch is ahead of it.
- Steam moved the build to `25046632` and **the corpus survived**: only the AVM2
  launcher changed; the AVM1 SS2 SWF is byte-identical. Merged here as `5aac794`.

## Read first, in order

1. `HANDOFF.md` § "Driving the capture pipeline FROM WSL" — NEW, and it is the
   difference between a working capture and three failures that all look like a
   broken wrapper.
2. `HANDOFF.md` § "Found 2026-09-01: the armoured and tournament families are
   blocked by the FIXTURES" — the derivation is closed; the value is 110.
3. This file's Traps.

## Highest-value work, ranked, with the reason

1. **RUN THE ARMOURED FAMILY UNDER THE ARMING GATE INSTEAD OF `-ArenaCapture
   always`. The fix already exists in the wrapper and is proven on another
   route.** `captureAllowedNow()`'s champion branch refuses to arm unless the
   live state matches what the scenario requires, emitting
   `capture-refused-unstaged`; `arena-champ-1` and `arena-champ-2` fired it 382
   and 460 times and correctly produced no trace. Three lines above it sits
   `if (arenaCaptureMode == "always") return true;` — and **all 38 armed `adc`
   rounds ran `always`, with ZERO refusals logged.** Generalise that branch to
   check the target fixture's scenario, then re-run the family under it.
   `validate-vehicle.ps1` must PASS after the wrapper edit. Expect a LOW success
   rate — the joint precondition held 0 of 38 times historically — which is the
   trade the wrapper's own comment already argues for: a session that cannot be
   evidence should produce no trace rather than an unreproducible one.

   **The scenario block is a PRECONDITION, not a staged input.** `-StageVillain`
   is only the mechanism that tries to make it true, and it cannot hold
   `staminaleft` because the villain's own turns mutate it between staging and
   arming. That is the distinction the family got wrong.

2. **THEN decide whether the scenario schema needs to change at all.** Measured across all 82 fixtures: 82 of 82 pin the
   villain's `staminaleft`, **0 of 82 pin `speed`**, and all 22 promoted goldens
   share ONE identical villain block whose attack/defence/strength/charisma/magicka
   are zero. For that opponent the
   `movement_speed` clamp floor of 4 makes the missing `speed` pin harmless — which
   is the entire reason prisoner and probe promoted and nothing else has. Against a
   `randomise_gladiator` draw the pin is live, and `speed` is not even observable
   (absent from `DEFAULT_WATCH_FIELDS`). **Do NOT widen that default** — the
   wrapper's own comment explains why, and it is right; `-WatchFields` extends it
   per session instead. Ranked first because authoring 38 more fixtures to the
   current shape would multiply the defect.

   *Superseded during this session: I wrote "the derived value is 110, not 105"
   into the head and RETRACTED it before any fixture was edited. 110 assumes the
   villain took zero phases while the hero took five walks; five villain walks give
   exactly 105. Both are under-determined. See the head.*
3. **Then capture the armoured family.** 27 archived armed traces were never even
   delogged; the family has spent far more rounds than the repository can see.
4. **The nonce recovery (40 records, waiver 58 -> 18).** Mechanically sound and
   re-derived twice, BUT see Trap 4 before acting: nothing in the repository can
   distinguish a recovered nonce from an invented one.
5. **DONE this session: fixed `.claude/workflows/question-fanout-audit.js`** so verifiers receive the
   environment facts. See Trap 1 — this defect cost ~8 wasted verifiers and
   several 240-second `find` timeouts in this session alone.
6. **Inject the 22 goldens into the resolver.** `defineTeamRuleSet` is still
   called exactly once outside tests, from `placeholder-rules.js`. The corpus is
   an asset nothing consumes; breadth is buying less than use would.

## Traps from this session

- **A shared brief poisons every agent that reads it, and the verifier prompt is
  built from `topic` ALONE — not `groundBrief`.** My wave-1 topic said "WSL clone,
  no local captures/ archive". The archive IS readable at `/mnt/c/ss2-capture/captures`,
  the ground brief said so, and verifiers never saw the ground brief. Six-plus of
  them concluded the archive did not exist and returned BROKEN. **Ask what they
  were all told** — AGENTS.md says exactly this and I did it anyway.
- **My over-correction was worse than the defect.** On finding that flaw I rewrote
  the brief, which changed `args`, which invalidates the resume cache — queueing
  ~180 already-successful agents to re-run in order to repair ~8 bad verdicts. The
  owner caught it. **Check what a fix costs before running it**; a resume is only
  free while the args are byte-identical.
- **A perfect correlation is worth checking for a shared source before explaining
  it.** I measured `observed villain staminaleft == end.staged value` in 11 of 11
  rounds and concluded the operator had staged the wrong number. Both halves were
  wrong: `beginAction` computes `stagedAtArming` and the state dump as consecutive
  statements over the same objects, so the agreement was a tautology. The wrapper
  says so in its own comment. Reading the instrument beat measuring harder.
- **Nothing in the repository can check a recovered nonce.** A verifier resealed
  `obs-par1`'s digest with its true nonce, a FABRICATED nonce, a nonce STOLEN from
  `obs-pq1`, and no nonce at all: all four matched with zero differences and passed
  validation, because `SS2_PAIRWISE_EXCLUDED_KEYS` excludes `capture` wholesale. So
  the recovery must be reproducible-from-archive by construction, not merely correct.
- **The archive was written to DURING the audit** — by my own capture runs, which
  took it 218 -> 221 files mid-sweep and made three agents' counts disagree for
  reasons that were not error. Re-derive counts at the moment you use them.
- **Three archive copies exist and disagree**: live `/mnt/c/ss2-capture/captures`,
  `/mnt/d/ss2-backups/captures-2026-08-31`, and a RETIRED OneDrive tree carrying
  `_RETIRED-DO-NOT-WORK-HERE.txt`. A count that does not name its copy is unsourced.
- **The living head contradicted itself for a third time**, and an adversarial
  verifier aimed at an unrelated claim found it: line ~856 said no golden cites a
  `launchNonce` while line ~715 of the same file said 9 records are cited across 4
  goldens. The correction had been written into four other files and not this one.
  **Grep the topic and correct EVERY site.**

## Hard rules

- Licensed SWFs are read-only and hash-verified before and after every capture.
- Never shortcut the game's own frames.
- A candidate becomes golden ONLY via >=2 matching observations from >=2 sessions.
  **Never hand-write a golden, observation or manifest.**
- **Derive candidates from the battle map, never from a capture.**
- `validate-vehicle.ps1` must PASS after ANY wrapper edit — it does, from WSL, as of this session.
- Snapshot before every save-mutating run, AND before every restore.
- **Do not push to `main`. Ask before pushing anything.**
- Adversarial verifiers write nothing at all.
