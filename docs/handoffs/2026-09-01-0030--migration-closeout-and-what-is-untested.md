---
handoff:      2026-09-01-0030--migration-closeout-and-what-is-untested
written:      2026-09-01 00:30 -0400
sessionStart: 2026-08-31 17:30 -0400
sessionId:    a87c4347-3cea-4308-8683-3f1282ef7009
agentRuns:    wf_0192d778-833 (pairwise gate: 4 ground + 2 impls + 3 verifiers)
              wf_4565c512-541 (migration audit: 5 probes + 4 verifiers)
              wf_ec9fafa3-17d (raw-trace independence: 4 probes + 2 verifiers)
              plus one Codex adversarial audit via `codex exec` (gpt-5.6-sol, ultra, read-only)
branch:       arena/champion-capture
commits:      1353c15..b653a00 from this session; tip is now e6a1484 (WSL session's work merged)
suite:        622 passed / 0 skipped (Windows, capture-bearing) | 626 tests, 625 passed, 1 skipped (WSL)
supersedes:   none
---
# Handoff — migration close-out, and an honest list of what was never exercised

**This session's remit was SETUP, not project work.** It built the Windows→WSL
migration and verified it. It drifted once — the raw-trace independence
investigation is adversarial work on the corpus and should have been a
purpose-built session. Recorded because the drift is instructive: "only this
machine holds the data" is not the same as "this session should run it".

## Where things stand

- **WSL is the primary environment.** `~/projects/swords-and-sandals-2-multiplayer`
  (arena) and `~/projects/ss2-progression-design` (design). Launch with `opus5`.
- **Windows is EPISODIC** — `C:\ss2-capture` exists for the capture pipeline and
  the raw-trace archive. Start a Windows session when you need a capture, not to
  keep one warm.
- All four working trees clean, current, and authoring as
  `Zanzagar <coreyhoydic@gmail.com>`.

## WHAT IS ACTUALLY TESTED, AND WHAT ONLY LOOKS TESTED

The distinction matters more than the list. **Configured is not exercised.**

**Exercised end to end:**

- The `@AGENTS.md` / self-contained-`AGENTS.md` pattern — and it FAILED TWICE
  under real use before it worked. Both failures were in the same section.
- `opus5` — two live `claude -p` sessions with the exact launcher flags.
- Codex adversarial review — produced real defects AND one wrong finding (it
  generalised from its own sandbox artifact, the same error two Claude passes
  made). Independence is worth having; infallibility is not on offer.
- The test suite in both environments.
- "Read the latest handoff and proceed" — the first WSL session oriented in two
  tool calls.

**NEVER EXERCISED — if you are the first to use one of these, you are the test:**

- **`/codex:adversarial-review`**, the documented command. The audit that ran used
  `codex exec` with a hand-written prompt. Different path; the documented one has
  never been invoked.
- **`.claude/workflows/question-fanout-audit.js`**. Every workflow this session ran
  was a bespoke inline script. The committed runnable artifact has never run.
- **The 12 harness skills** in `~/.claude/skills`. Installed, none invoked.
- **`fable5` and `sol`.** Verified as shell functions; no session ever launched.
- **THE CAPTURE PIPELINE SINCE THE RELOCATION.** Verified statically only — every
  launcher derives its root from `$PSScriptRoot`, and the whole repo contains two
  OneDrive references. Nothing was run. No Ruffle launch, no `validate-vehicle.ps1`.
  Deliberate: a capture mutates the save, and that is the one irreversible act
  available tonight. **The next capture run is the real test. Treat it as one.**

## Two risks found by audit, one closed tonight

- **CLOSED: the save universe was single-copy and unbacked.** The live save
  (`%LOCALAPPDATA%\ruffle\SharedObjects`) and all 74 restore points / 222 files in
  `%LOCALAPPDATA%\ss2-capture-snapshots` existed on one volume, in no repo, on no
  remote. Now on `D:\ss2-backups\`, verified byte-identical by MD5, alongside
  `captures/`. **D: is an external drive and is usually unplugged — that makes it a
  good offline backup and a stale one. Re-run after any capture session.**
- **OPEN: the pinned game build is set to auto-update.** The install is currently
  hash-exact against `docs/integration/ss2-build-fingerprint.json`. A Steam update
  invalidates the provenance of every golden, divergence and observation at once.
  Nothing guards this. Consider pinning the build in Steam.

## Traps from this session

- **`git worktree repair` does not sever the old directory.** Relocating a
  worktree by copy leaves BOTH directories' `.git` files pointing at the same
  admin dir; both are live, they share HEAD and the index, and `git worktree list`
  does not show the collision. Sever by renaming the old `.git`, and verify
  `git status` there reports "not a git repository".
- **A retirement marker can be confidently wrong.** Two were: one claimed the old
  copy was already severed (it was not), one claimed deleting it lost nothing (it
  held the only second copy of `captures/`). Verify a marker's claims before
  writing them; they get believed.
- **`AGENTS.md` and `HANDOFF.md` are BRANCH CONTENT, not project rules.**
  Quarantining the design track also quarantined every correction from it. The
  design branch still carries the pre-correction `AGENTS.md`. The likely fix is to
  split VOLATILE environment facts (paths, `gh`, counts — all rotted within hours)
  from DURABLE invariants (never hand-write a golden — none rotted), so a branch
  carrying slightly old invariants is harmless. NOT done; think before copying
  `AGENTS.md` around again, since that is what caused this.
- **My relocation destroyed forensic evidence.** `c85b2ac` rewrote 2,362 files and
  reset NTFS ChangeTime — the one timestamp field `SetFileTime` cannot forge — on
  every one. It carried capture-time information that now exists nowhere. Consider
  what a move erases, not only what it moves.
- **Incremental self-verification validates steps, not their composition.** Every
  defect the audits found came from work I had checked as I went. Each step was
  right; the composition was not.
- **Relay is lossy.** Five findings passed between sessions tonight; every one
  needed a correction afterwards. Prefer the session that will act on a finding
  discovering it.

## What is open, and whose it is

**The WSL session's** (it owns the living head and the re-promotion):
the base golden still rests on 1 nonce-bearing record and 0 comparable pairs;
`obs-fr1` carries an unpropagated nonce in its raw trace — if confirmed against
the Windows archive that is both the cheapest strengthening available AND an
ingest defect, since ingest silently drops the one identity the operator does not
choose.

**Structural, and larger than any fix here:** the promotion gate counts SESSIONS
and cannot see that two sessions differ in the STRENGTH of their evidence. Eight
records carrying no launch token satisfy it exactly as well as eight carrying one.

**Latent, needs a deliberate act to become real:** running git from WSL against
the *Windows* repo reports valid Windows worktrees as prunable. A dubious-ownership
refusal gates it — which means it only becomes live when someone adds the
`safe.directory` exception the error message helpfully suggests. Do not add it.
