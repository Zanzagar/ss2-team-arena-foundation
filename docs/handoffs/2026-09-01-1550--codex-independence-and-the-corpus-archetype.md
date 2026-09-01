---
handoff:      2026-09-01-1550--codex-independence-and-the-corpus-archetype
written:      2026-09-01 15:50 -0400
sessionStart: 2026-09-01 00:30 -0400
sessionId:    515e2223-2bd5-49c7-9246-554a40e00772 (later turns: session_0131JYgqvFrYG5Vpaq8bxbcJ)
agentRuns:    wf_8d57104d-417 (nonce recovery) — VERIFIED: 6/6 questions, 209/209 verifiers, 0 errors
              wf_e72fa4b5-b31 (armoured/tournament) — VERIFIED: 6/6 questions, 230/230 verifiers, 0 errors
              plus one Codex adversarial review via `codex exec` (gpt-5.6-sol, xhigh, read-only)
              758 agent transcripts / 545 verdicts digested in .audit-harvest/ (gitignored, 3.3 MB)
branch:       arena/champion-capture
commits:      194587f..<tip>   # run `git log --oneline -1`; pushed state with `git log --oneline @{u}..HEAD`
suite:        630 tests / 629 passed / 0 failed / 1 skipped (WSL, fresh-clone profile)
environment:  WSL2, node v26.3.1, ~/projects/swords-and-sandals-2-multiplayer
supersedes:   2026-09-01-1250--wsl-capture-pipeline-and-armoured-fixture-defect
---
# Handoff — what the corpus actually proves, and why the outside reviewer mattered

**Supersedes `2026-09-01-1250`, which is stale in its wave status (it called
wave 2 partial), its counts, and its top-ranked item.** ~~Read this one.~~
**SUPERSEDED IN TURN by
[`2026-09-01-1733--armoured-family-measured-and-the-schema-question`](2026-09-01-1733--armoured-family-measured-and-the-schema-question.md),
which RETRACTS this handoff's ranked item 1 by measurement.** Everything else
here stands.

> **RENAMED 2026-09-01 16:37, from `2026-09-01-1950--` to `2026-09-01-1550--`,
> with the owner's approval.** This file was stamped in **UTC** while its
> frontmatter claimed `-0400`; `git log` puts its commit at **15:50:59 -0400**,
> exactly four hours before the name. The harm was not cosmetic: handoff names
> sort lexicographically and `AGENTS.md` tells every session to *"read the newest
> file in `docs/handoffs/`"*, so a `1950` stamp would have kept sending the next
> reader to this superseded brief instead of the one that supersedes it. The
> stamp is **local time when the handoff was written**, as
> [`README.md`](README.md) says; the offset in the frontmatter is what makes it
> unambiguous, and it has to be true.

## Where things stand

- Branch `arena/champion-capture`, clean, **630 / 629 / 0 / 1**. All work is
  PUSHED (the owner authorised it for the progress update and the trace removal).
- **Both agent waves completed VERIFIED.** No dead verifiers remain.
- `github/main` is unchanged; this branch is far ahead of it and still has no PR.

## Read first, in order

1. `HANDOFF.md` § "What to read, and what you may skip".
2. `HANDOFF.md` § "Found 2026-09-01: the armoured and tournament families are
   blocked by the FIXTURES" — including the RETRACTION inside it.
3. `HANDOFF.md` § "Codex: which machine owns which config, and what is actually
   installed" — before running any review.
4. This file's Traps.

## Highest-value work, ranked, with the reason

1. **RUN THE ARMOURED FAMILY UNDER THE ARMING GATE INSTEAD OF `-ArenaCapture
   always`.** The fix already exists in the wrapper and is proven on another
   route: `captureAllowedNow()`'s champion branch refuses to arm unless the live
   state matches the scenario, and fired 382 and 460 times on `arena-champ-1/2`,
   correctly producing no trace. Three lines above it sits
   `if (arenaCaptureMode == "always") return true;` — and **all 38 armed `adc`
   rounds ran `always`, with ZERO refusals logged.** Generalise that branch to
   check the target fixture's scenario, then re-run the family under it.
   `validate-vehicle.ps1` must PASS after the wrapper edit. Expect a LOW success
   rate; that is the trade the wrapper's own comment argues for.
   **Ranked first because it is the only item whose answer is already known.**

2. **DECIDE WHETHER THE SCENARIO SCHEMA MUST CHANGE.** 82 of 82 fixtures pin the
   villain's `staminaleft`; **0 of 82 pin `speed`**; all 22 goldens share ONE
   villain block whose attack/defence/strength/charisma/magicka are zero. The
   `movement_speed` clamp floor of 4 makes the missing pin harmless for THAT
   opponent and only that one. **Do NOT widen `DEFAULT_WATCH_FIELDS`** — the
   wrapper's comment explains why and is right; `-WatchFields` extends per
   session. This is a design decision for the owner, not a fixture edit.

3. **Capture the armoured family** once 1 lands. **27 archived armed traces were
   never delogged** — the family has spent 3.5x more rounds than the repository
   can see.

4. **The nonce recovery** (40 records, waiver 58 → 18, **20 of 22 goldens need
   re-promotion**). `node tools/recover-launch-nonces.mjs --archive <dir>` is
   REPORT-ONLY by design. Read Trap 3 before acting.

5. **Inject the 22 goldens into the resolver.** `defineTeamRuleSet` is still
   called exactly once outside tests, from `placeholder-rules.js`. The corpus is
   an asset nothing consumes, and breadth is buying less than use would.

## Traps from this session

- **AN OUTSIDE REVIEWER FOUND WHAT 758 AGENTS DID NOT.** A read-only Codex review
  found 67 raw traces committed and pushed — a subagent script with an undefined
  path variable wrote them into `test/observations/ss2-1v1/undefined/arch/` and
  one `git add -A` swept them in. Removed, with `.gitignore` coverage and a
  mutation-tested guard in `ss2-capture-attestation.test.js`. **They remain in
  pushed history at `4610132`; rewriting the branch is the owner's call.**
  **Prefer `git add <paths>` to `git add -A` in a tree where agents write.**
- **USE THE CLI FOR ANY REVIEW YOU WILL ACT ON.** Established twice over: the
  plugin path preserves NO per-command transcript and writes NO rollout record.
  The CLI transcript is what let this session AUDIT the review's seven findings
  rather than trust them — and two were defects in my own work. Corollary, and it
  is a hole I put in this file myself: **"verify by the rollout record" is
  executable on the CLI path ONLY.** For a plugin review, `config.toml` is not
  the default — it is the only record of what ran.
- **NOTHING CAN CHECK A RECOVERED NONCE.** A verifier resealed `obs-par1` with a
  fabricated nonce, a stolen nonce, and no nonce: all three matched with zero
  differences and passed validation, because `SS2_PAIRWISE_EXCLUDED_KEYS`
  excludes `capture` wholesale. Reproducibility from the archive is the only
  assurance available.
- **A PERFECT CORRELATION IS WORTH CHECKING FOR A SHARED SOURCE BEFORE
  EXPLAINING IT.** I measured `observed villain staminaleft == end.staged` in 11
  of 11 rounds and concluded operator error. Both halves were wrong: `beginAction`
  computes both from the same objects, one line apart. Reading the instrument
  beat measuring harder.
- **I RETRACTED MY OWN "THE DERIVED VALUE IS 110" BEFORE IT REACHED A FIXTURE**,
  then found it still asserted at THREE other sites I had not grepped. Retract at
  every site, and grep the topic.
- **CHECK WHAT A FIX COSTS BEFORE RUNNING IT.** On finding my brief had misled
  verifiers I rewrote it, which invalidated the resume cache and queued ~180
  successful agents to re-run to repair ~8 verdicts. The owner caught it.
- **`started - result - failed` IS NOT AN IN-FLIGHT COUNT.** It counts agents
  your own `TaskStop` killed, permanently. Measure live agents by transcript
  mtime instead.
- **A stale ratio rots twice.** "113 of 177" archived traces became 153 of 221 —
  and moved by three more DURING the audit, because this session's own captures
  were writing to the archive. Re-derive counts at the moment you use them.

## Hard rules

- Licensed SWFs are read-only and hash-verified before and after every capture.
- Never shortcut the game's own frames.
- A candidate becomes golden ONLY via >=2 matching observations from >=2 sessions.
  **Never hand-write a golden, observation or manifest.**
- **Derive candidates from the battle map, never from a capture.**
- `validate-vehicle.ps1` must PASS after ANY wrapper edit.
- Snapshot before every save-mutating run, AND before every restore.
- **Do not push to `main`. Ask before pushing anything.**
- Adversarial verifiers write nothing at all.
- **Do NOT run `/codex:setup --enable-review-gate`.** The plugin ships the hook;
  it is dormant by default and must stay so.
