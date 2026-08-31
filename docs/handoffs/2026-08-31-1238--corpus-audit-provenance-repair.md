---
handoff:      2026-08-31-1238--corpus-audit-provenance-repair
written:      2026-08-31 12:38 -0400
sessionStart: 2026-08-31 09:39 -0400   # first commit; the session opened somewhat earlier
sessionId:    4a79fa7f-176b-455c-aa91-372038a141af
agentRuns:    wf_bc86037b-0f9 (13 auditors), wf_7a46fd0f-ac4 (2 docs writers), wf_d2aa6793-7cb (1 writer + 3 verifiers)
branch:       arena/champion-capture
commits:      73f7fba..2585952   # 6 commits, all pushed
suite:        617 passed / 0 failed / 0 skipped
supersedes:   none
---
# Handoff — 2026-08-31 12:38, corpus audit and provenance repair

Written at the end of the corpus-integrity audit and provenance repair session.
See [`docs/handoffs/README.md`](README.md) for what a handoff is and is not.

## Where things stand

- Branch `arena/champion-capture`, ahead of `github/main` (`4409ec7`), pushed
  and in sync with its remote branch. This session's commits are the
  `commits:` range in the frontmatter above; confirm the tip yourself with
  `git log --oneline -1` rather than trusting a hash written before the last
  commit landed.
- PRs #1 and #2 are both merged design-track work. **No PR is open for this
  branch.** `gh` is NOT installed — use `git ls-remote github "refs/pull/*/head"`.
- **617 passed, 0 failed, 0 skipped**, tree clean.
- Do not push to `main`.

## Read first, in this order

1. **`HANDOFF.md`** — it now OPENS with "READ THIS FIRST — corrections from the
   2026-08-31 audit pass". **Four load-bearing claims below that block are wrong
   and are corrected in it.** Read the corrections before anything under them, or
   you will act on retracted facts. The rest of the file is reverse-chronological
   detail.
2. **`docs/overnight-agent-plan.md`** — how parallel work is organised. Its
   section on writing briefs is the most valuable part of it.
3. Confirm the tree is clean, then run:
   ```
   & 'C:\Users\corey\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test --test-concurrency=1
   ```
   Expect **617 / 0 / 0** in a capture-bearing worktree. **A skip is a real
   finding.** npm is not on PATH. Use `git commit -F <file>` for messages
   containing quotes.

## Highest-value work, ranked

1. **Session independence — "attack (e)".** Two fabricated observations that are
   copies of EACH OTHER still promote a golden. A pairwise comparison can never
   catch this, because copies agree; it needs the launch-nonce / session path.
   **Ranked first because it is the largest open integrity gap and it predates
   everything this session touched** — the transcription repair did not narrow it.
2. **The stat-vector arithmetic.** Which exact `attack` / `defence` / `stamina` /
   `vitality` targets are reachable under "four points per level, all four must be
   spent" (GATE C will not release the level-up screen until `statpoints` reads
   0)? Ranked second because it is the highest-value *forward* work available: it
   converts 22 fixtures written off as unbuildable into an actual capture plan.
   Do the arithmetic first; do not spend a supervised window guessing.
3. **Re-promote the four self-citing goldens** from eligible records. The
   material is committed and named in `7856e2b`. **Pipeline only — never
   hand-write a golden.**
4. **Contradicted scalars in non-promoted fixtures.** 7 of 9 misc-a carry a
   (strength, min_damage, max_damage) triple no weapon row in the build produces;
   two pin an enchantment potency of 5 against a cap of 3; the spell resolver's
   `damageMethod: null` for ids 31/32/35 is contradicted by the bytes, which pass
   `"burning"` and `"lightning"`; villain blocks omit `<piece>_defence` fields
   that `battlevalues` rewrites every phase.
5. **Stub rewrite.** Only **4 of 15** hook slots can change the vehicle gate's
   PASS/FAIL, and every `dbg` line — including every `wrapped:`,
   `capture-refused-*` and `attacker-resolved-*` — is stripped before the match.
   Needs the supervised Ruffle window, so it is the operator's to schedule.

## Hard rules

- Licensed SWFs are read-only and hash-verified before and after every capture.
  Never copy, export or commit game assets or extracted scripts.
- **Never shortcut the game's own frames.** Skipping the prologue tripped the
  game's own character-tampering screen.
- **Derive candidates from the battle map, never from a capture** and never from
  the design track, which is quarantined.
- A candidate becomes golden ONLY via ≥2 matching observations from ≥2 sessions.
  **Never hand-write a golden, an observation or a manifest.**
- `validate-vehicle.ps1` must PASS after ANY wrapper edit — but read what it does
  not prove. It catches 0 of the 6 defects found live on this route.
- Only one Ruffle window unless every session has its own `-SaveDirectory`.
- **No agent** launches Ruffle, touches the save / installation / snapshots, or
  runs a state-mutating git command. Those are the main session's, serial and
  supervised. Don't run captures while a fan-out is active — `time_of_day`
  advances on a 1.5s wall clock and a loaded machine eats GATE A's margin.

## Parallelisation

Writers are capped by the file graph, and it is tighter than it looks:
`src/golden/run-1v1-fixture.js` is imported by **9** test files and
`src/golden/observation.js` by **10**, so those are **chokepoints that must land
alone**. Measure the graph before slicing.

Adversarial verifiers have no cap and were again the highest-value agents. Three
against one writer returned HOLDS, PARTIALLY-BROKEN and BROKEN — and the BROKEN
one found that the guard just landed **refused truthful declarations**. Run more
than feels necessary.

## Traps from this session — all three cost real time

- **`pipeline([null], stage1, stage2)` silently skips every stage.** A null item
  is treated as already-dropped. My main writer and its three verifiers never
  spawned, and I did not notice until the result returned `agent_count: 2`. Use
  `await agent(...)` then `parallel(...)` for a writer → verifier shape.
- **Check every path against `git ls-files` before launching — including your own
  filters.** I ran `git ls-files test | grep -v fixtures`, which ate
  `test/ss2-post-tutorial-fixtures.test.js` and two siblings, and nearly briefed a
  writer against files I had concluded did not exist.
- **Never relay a table you have not verified.** I passed an auditor's 15-row
  `staminacost` table into a brief; **5 rows were wrong**, and the `rest` row
  contradicted the very document the agent was being asked to extend. It
  re-derived instead of transcribing only because the brief said its premises were
  hypotheses. **Put that sentence in every brief.**

## Standing preference

Be willing to say no. Flag your own mistakes prominently in the repo's own record
rather than quietly fixing them — the corrections block in `HANDOFF.md` and the
commit messages from this session deliberately name which errors were mine.
