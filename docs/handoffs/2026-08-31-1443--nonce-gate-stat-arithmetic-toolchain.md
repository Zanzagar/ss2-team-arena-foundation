---
handoff:      2026-08-31-1443--nonce-gate-stat-arithmetic-toolchain
written:      2026-08-31 14:43 -0400, extended 16:58 -0400
sessionStart: 2026-08-31 13:30 -0400   # approx; first commit 13:44
sessionId:    e386f047-1257-4d23-bf9b-6394e6e8b0f5
agentRuns:    wf_0828f636-618 (4 HANDOFF lenses + 4 verifiers; verifiers re-run after a usage-limit failure)
              wf_4906eb50-a7f (4 CLAUDE.md/AGENTS.md research sweeps + 4 verifiers)
branch:       arena/champion-capture
commits:      2b123b9..3b61e69   # 7 commits, all PUSHED to github/arena/champion-capture
suite:        620 passed / 0 failed / 0 skipped
supersedes:   none
---
# Handoff — 2026-08-31 14:43, nonce gate, stat arithmetic, toolchain

See [`README.md`](README.md) for what a handoff is and is not.

## Where things stand

- Branch `arena/champion-capture`, **pushed and in sync** with its remote.
  Do not push to `main`.
- **620 / 0 / 0**, tree clean. Confirm the tip with `git log --oneline -1`.
- `gh` is still not installed. `git ls-remote github "refs/pull/*/head"` for PR state.

## What landed

1. **`2b123b9` — attack (e) closed.** A copied observation with its `launchNonce`
   deleted could serve as the second "independent" session. Reproduced end to end
   first: a copy of `obs-gold3` promoted `golden-prisoner-normal-kill-dir6` from one
   run offered twice. **No pairwise comparison could ever have caught it** — copies
   agree, and agreement is what that gate checks for — so the previous handoff's
   prescribed route could not have worked. It went through the nonce instead.
   `src/golden/pre-nonce-observations.js` enumerates by digest the 58 records
   predating the field; the list may only shrink; three tests audit it.
   **STILL OPEN: a forger who MINTS A FRESH NONCE is refused by nothing.**
2. **`2385fb3`** — recorded what that overturned; both test profiles re-MEASURED
   (620/0/0 capture-bearing, 620 tests / 619 passed / 1 skipped in a detached
   worktree) rather than derived.
3. **`2d0b077` — the stat-vector arithmetic.** Seven of the 22 written-off fixtures
   are reachable, fifteen are not. `tools/stat-vector-reachability.mjs`.
4. **`f1f3f94` — three retractions**, one of them mine (below).
5. **`45b79a5` — `AGENTS.md` + an 11-byte `CLAUDE.md`.** Until now NEITHER agent
   loaded this project's rules automatically; it worked only because a human typed
   "read the latest handoff", which reached Claude and never reached Codex. The
   pattern is Boris Cherny's own (Threads, 2026-03-21: "You can link your AGENTS.md
   from your CLAUDE.md with: `@AGENTS.md`"), matches the docs, and `getsentry/sentry`
   runs an identical 11-byte CLAUDE.md. **AGENTS.md must stay SELF-CONTAINED** —
   Codex has no `@import`. Claude-only material goes BELOW the import line in
   CLAUDE.md. Keep the COMBINED content under 200 lines (82 today): the import does
   NOT save context, since imported files load in full at launch.
6. **`3b61e69` — three fixes to `docs/overnight-agent-plan.md`**: the
   `git ls-files` rule was one-directional, nothing verified a wave actually
   launched, and "586 is the right number" was 34 tests stale. Read these BEFORE
   briefing the restructure fan-out.

## Read this before you plan a capture

**`2d0b077` said the duel pair was "the cheapest unbuilt family… capture it
first". That was my error and it is retracted in `f1f3f94`.** Reachability
arithmetic ranks what is BUILDABLE and cannot rank what is CHEAP, because it
cannot see the snapshots. The armoured family's hero ALREADY EXISTS —
`level4-vitality-tournament-gate` is a level-4 gladiator with vitality 13, and
`4*10 + 13*20 = 300` is exactly that family's `hitpointsmax`. **Marginal cost
zero.** The duel pair needs a new gladiator, unbudgeted armour, and a wrapper
change (the wrapper spends all four points into `vitality` by policy), and one of
its two fixtures is a transcription that cannot promote from its own source record.

**Cross every "reachable" verdict against the snapshot list in `HANDOFF.md`
before it becomes a capture plan.**

## Highest-value work, ranked

1. **The HANDOFF.md restructure, NOT DONE and deliberately so.** Four lenses
   proposed disclosing ~300 lines behind context pointers. Four adversarial
   verifiers returned **BROKEN, BROKEN, PARTIALLY-BROKEN, PARTIALLY-BROKEN**, so
   none of it was applied. The three findings that survived refutation are in
   `f1f3f94`. **Do not apply the lens reports as written** — read the refutations
   with them, at the `agentRuns` path in the frontmatter. The structural
   diagnosis is sound (`## Open items` really is ~52% of the file); the specific
   cuts are not trustworthy yet.
2. **Re-measure the pairwise gate's dormancy.** "162 leaves" does not reproduce
   and neither does the "142" correcting it: over all 67 records, full-record
   leaves are 101-184 and the matcher projection 86-157, and NO record carries
   162 under either. The "0 can differ" conclusion was NOT re-measured — it is
   unconfirmed, not refuted. Settle it before landing any field exclusion.
3. **The fresh-nonce residual** (see `2b123b9`). Smaller than what it replaced.
4. **Re-promote the four self-citing goldens** from eligible records. Pipeline
   only, never by hand.
5. **Contradicted scalars in non-promoted fixtures**, and the stub rewrite.

## Traps from this session

- **`writing-for-agents` is worth reading before you touch any agent-facing doc**
  (`~/.claude/plugins`, `mattpocock-skills`). Its vocabulary — context pointers,
  the two loads, progressive disclosure, completion criteria as clarity vs demand
  — names things this project had been solving ad hoc.
- **A retraction at the top of a file does not reach a reader who starts at the
  section that tells them what to do.** HANDOFF.md's top-ranked next step was
  false in all three arithmetic blocks while the corrections block 270 lines
  above already said so. Retract AT THE INSTRUCTION.
- **A workflow's verify phase can fail on a usage limit while the analysis phase
  succeeds**, leaving confident unverified recommendations. It presents as a
  completed workflow. Check per-agent state, and resume with
  `resumeFromRunId` — completed agents replay from cache for free.
- **Verifiers caught the lenses relaying unchecked claims**: that `campaign.mjs
  plan` is broken (fixed in `ad8c9ae`), that there are 81 divergence reports
  (86), that four "docs known stale" items are outstanding (all reconciled). The
  same failure the last handoff recorded, one layer out.

## Tooling (new this session, all verified)

- **Both plugins installed**, user scope: `mattpocock-skills` v1.2.3 and
  `codex` v1.0.6. Neither marketplace was registered before — the official one
  auto-registers only on first INTERACTIVE launch.
- **Codex has `diagnosing-bugs` and `writing-for-agents` ONLY**, deliberately not
  `code-review`: a shared review methodology would correlate Claude and Codex as
  reviewers, and Codex is worth having here precisely because it is independent.
  Confirmed by asking Codex to list its own skills. They live in
  `~/.agents/skills/`, not `~/.codex/skills/` (which stays empty).
- **Codex reads Claude's `.claude-plugin/marketplace.json` natively.**
  `codex plugin marketplace add mattpocock/skills` works and offers the whole
  bundle, git-backed and upgradeable. Rejected only because `codex plugin add` is
  all-or-nothing and would pull in `code-review`. Re-add it if a full mirror is
  ever wanted.
- `npx` is NOT absent — it is bundled at
  the Codex cua_node runtime bin directory, but its sibling
  `node` must be on PATH or the shim fails. `-s` takes REPEATED flags, not a
  comma list.

## Environment (new this session)

- `claude` and `codex` are installed but NOT on PATH, in directories that move on
  update. A PowerShell profile now resolves both at call time and defines
  `ultracode` / `uc`. **The Claude CLI is not logged in** — one `/login` needed.
- **Ultracode cannot be defaulted** (anthropics/claude-code#64817, #68860);
  per-session only.
- `mattpocock-skills` v1.2.3 installed, user scope. `/setup-matt-pocock-skills`
  was deliberately NOT run: it writes `docs/agents/*` and an `## Agent skills`
  block, and configures an issue tracker this project does not use.

## Hard rules

Unchanged; see `HANDOFF.md` § "Non-negotiable rules". The ones this session
leaned on: never hand-write a golden, observation or manifest; derive candidates
from the battle map, never from a capture; no agent runs a state-mutating git
command; adversarial verifiers write nothing.
