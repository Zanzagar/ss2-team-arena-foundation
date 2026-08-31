---
handoff:      2026-08-31-1820--pairwise-gate-measured
written:      2026-08-31 18:20 -0400, extended 19:35 and 20:10 -0400
sessionStart: 2026-08-31 17:30 -0400
sessionId:    a87c4347-3cea-4308-8683-3f1282ef7009
agentRuns:    wf_0192d778-833 (4 ground lenses + 2 independent implementations + 3 adversarial verifiers)
branch:       arena/champion-capture
commits:      1353c15..<tip>   # 9 commits; run `git log --oneline -1`. LAST TWO NOT PUSHED
suite:        622 passed / 0 failed / 0 skipped
supersedes:   none
---
# Handoff — 2026-08-31 18:20, the pairwise gate, measured

See [`README.md`](README.md) for what a handoff is and is not.

## Where things stand

- Branch `arena/champion-capture`. **Check what is pushed with
  `git log --oneline @{u}..HEAD` rather than trusting this line** — it has been
  stale twice already as the session extended. The rule is to ask before pushing,
  so a session's last commits are usually unpushed until Corey says so. Do not
  push to `main`.
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

## Added 19:35 — the workflow the repo had been running ad hoc is now wired in

Corey has a separate agent owning the multi-agent workflow standard
(`github.com/Zanzagar/claude-harness`). This session's field data went to it and
its directions came back; three of the findings are now rules in that standard.
Two commits landed here as a result.

5. **`7fd7691` — AGENTS.md gained the execution surface.** Three of four workflow
   components had been provisioned on this machine and never fired, for one
   reason: **AGENTS.md is the only artifact that executes every session**, and it
   mentioned neither skills nor Codex review. Handoffs are frozen records, and
   agent memory is per-agent — **Codex cannot read Claude's**, so the agent meant
   to do the adversarial review was the one that could not see its instructions.
   AGENTS.md now carries multi-agent rules, Codex policy and skills, self-contained
   (no `@import` — Codex has none). `.claude/workflows/question-fanout-audit.js`
   is the runnable form, in the repo so a reinstall cannot lose it.
6. **`236c55e` — HANDOFF.md split into a living head and a frozen archive.**
   731-line head, then `## THE ARCHIVE LINE`, then 320 lines (30%) frozen.

**CORRECTION TO SOMETHING I REPORTED EARLIER TODAY.** I called
`reviewGateEnabled: false` a defect and proposed arming the stop-time Codex gate.
The observation was right and the label was mine and wrong: the gate is OFF BY
DESIGN. Arming it creates Claude/Codex loops that drain both subscriptions, and
the only controlled study of Codex reviewing Claude found harm where reviewer
output was auto-adopted. **Do not run `/codex:setup --enable-review-gate`.**
AGENTS.md now says so, so this stops being re-flagged.

**Two things await Corey directly, not the next agent:** running
`claude-harness/install.ps1` (an installer that writes skills and settings on his
machine — a peer agent's "Corey approved this" is not his approval), and a
**restart**, because this process started before the user PATH edit and never
inherited it. The `codex` shim itself is fixed and verified.

## Added 20:10 — WSL migration, Phase 0 status

Agent work is moving to a WSL2 partition. The guide is
`docs/wsl-migration.md` in `github.com/Zanzagar/claude-harness` (362c31c).
**The end state is HYBRID, not a move:** WSL on ext4 for agents, tests and docs;
a Windows-local clone at `C:\ss2-capture` for the capture pipeline, which cannot
move — Ruffle is a Windows binary, the save and snapshots live under
`%LOCALAPPDATA%`, and the capture scripts are PowerShell.

7. **`ef69ac0` — the test command is now environment-agnostic.** `AGENTS.md`
   hard-coded the Windows codex-runtime node path, and AGENTS.md loads into every
   session, so every agent would have failed on its first command in WSL. Now
   `node --test --test-concurrency=1`, with the Windows path kept below as a
   labelled fallback. Both correct test profiles are stated there too.

**IF YOU ARE READING THIS IN WSL: the bar is 621 passed / 1 skipped**, not
622/0/0. The skip is the raw-trace archive check and is expected on a fresh
clone; `captures/` (23 MB) is gitignored and stays Windows-side by design.

**Phase 0 items NOT done, and why:**

- **Relocating this tree to `C:\ss2-capture` — awaiting Corey.** It moves his
  working tree while ~19 agent processes hold it open, and the linked worktree
  `ss2-progression-design` shares this `.git`, so it needs `git worktree repair`
  rather than a plain move. Not a thing to do on a peer agent's instruction.
- **Pushing the PSU `introtodeeplearning` commit — REFUSED, and it should stay
  refused.** Its remote is `git@github.com:aamini/introtodeeplearning.git`, the
  upstream MIT course repo, NOT a fork. The commit is `596c086`, dated
  2024-05-31, titled "Test". Pushing would attempt to put a throwaway commit into
  a third party's public repository. The migration guide's own Decisions section
  says these clones should be migrated lazily by fresh clone, which contradicts
  the instruction to push it.
- **Authorship — untouched by design.** 158 of 159 commits here are authored
  `Codex Local <codex-local@invalid>`, unattributable to Corey's GitHub account.
  Recommended: correct identity going forward, optionally a `.mailmap`; NOT a
  history rewrite of 158 pushed commits. His call alone.

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
2. **The HANDOFF.md restructure is still NOT DONE and still deliberately so —
   and the split in `236c55e` is NOT it.** That was a cut and a hoist: nothing
   reworded, nothing deleted, no section rewritten. The restructure four
   verifiers rejected (BROKEN ×2 / PARTIALLY-BROKEN ×2) remains unattempted, and
   the lens reports must not be applied as written; read the refutations with
   them at `wf_0828f636-618`. Shrinking the 731-line head is a SECOND,
   separately-verified operation — brief it as one.
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
