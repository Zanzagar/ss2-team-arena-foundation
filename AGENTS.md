# AGENTS.md — Swords & Sandals II multiplayer foundation

Rules every agent working in this repository must follow, whichever tool it is
running under. **Claude Code loads this through the one-line `CLAUDE.md`; Codex
loads it directly.** Keep it SELF-CONTAINED: Codex has no `@import` mechanism, so
a reference here is a pointer a human follows, never an include.

**Keep this file short.** It is loaded into every session of every agent, so
every line is paid for on every turn. Anything that only some sessions need
belongs behind a pointer, not in here.

## What this project is

It reverse-engineers a licensed Flash game to build **runtime-verified** test
fixtures. The entire value of the corpus is that its numbers were measured, not
asserted. Almost every rule below exists to stop an agent quietly converting
measured evidence into self-confirming data.

## Start here

**Read the newest file in `docs/handoffs/` before doing anything else**, then
**`HANDOFF.md`'s LIVING HEAD** for accumulated state — everything above the
`## THE ARCHIVE LINE` heading. Below that line is frozen evidence and history:
read it to check a claim, never to learn what is current, and never append there.

`HANDOFF.md` is long and is deliberately NOT imported here — open it, do not
expect it in context.

**The living head is the ONLY place a wrong instruction may be corrected**, and
corrections go AT the instruction, not only in a block above it. A handoff under
`docs/handoffs/` freezes when its session ends, so a correction that lives only
there never reaches the next reader.

## Non-negotiable

- **Never hand-write a golden, an observation or a manifest.** A candidate
  becomes golden ONLY via >=2 matching observations from >=2 independent capture
  sessions, through the pipeline.
- **Derive candidates from the battle map, never from a capture.** When a fixture
  disagrees with the runtime, re-derive it from the map. Do NOT edit the fixture
  to the observed value. This is the single most tempting wrong move here.
- **Licensed SWFs are read-only** and hash-verified before and after every
  capture. Never copy, export or commit game assets or extracted scripts.
- **Never shortcut the game's own frames.** Skipping the prologue tripped the
  game's own character-tampering screen.
- `validate-vehicle.ps1` must PASS after ANY wrapper edit — but read what it does
  not prove. It caught 0 of the 6 defects found live on this route.
- **Snapshot before every save-mutating run.** `run-arena.ps1` does it for you.
- **Do not push to `main`.** Work happens on feature branches. Ask before pushing
  anything.

## If you are a subagent

Claude Code loads this file into subagents too (all except the built-in Explore
and Plan agents), so these rules bind you as well:

- **No agent launches Ruffle**, touches the installation, the save or the
  snapshots, or runs a state-mutating git command. Those are the main session's,
  serial and supervised.
- **Adversarial verifiers write nothing at all.** They have been the
  highest-value agents on this project; run more of them than feels necessary.
- **Treat every fact in your brief as a hypothesis** — tables, counts and quoted
  file contents included. Re-derive anything you rely on. A premise that turns
  out to be wrong is a finding that outranks the task, and must be reported
  prominently rather than worked around.
- **Never relay a number, table or quotation you have not re-derived yourself.**
  Hand over the source (file, offsets, command), not the conclusion.

## Multi-agent runs

Standing rules to paste into every agent prompt are in
`docs/overnight-agent-plan.md`; the runnable form is in `.claude/workflows/`.

- **Fan out on QUESTIONS, not replicas.** Measured here 2026-08-31: two
  independent implementations agreed on every number and were both incomplete in
  the same way, because they shared one brief that carried one wrong fact. The
  agent that overturned the result was the one aimed at a different question.
  Agreement between agents given the same brief is weak evidence — the brief is
  the correlated failure mode. Ask "what were they all told?"
- **Verifiers write nothing and get ONE named claim each.**
- **Assert `started == briefs`.** A wave that silently spawns nothing returns
  fast, which otherwise reads as success.
- **A wave with dead verifiers is UNVERIFIED, not complete.** Never report
  confident unverified findings; check per-agent state, not the run's status.

## Code review (Codex)

- **Codex adversarial review is FLAG-ONLY and on demand**
  (`/codex:adversarial-review`), for high-stakes diffs: auth, data loss,
  concurrency, save/persistence, protocol changes. Its findings are CLAIMS TO
  VERIFY — never auto-apply them.
- **The stop-time review gate stays DISABLED by design.** `reviewGateEnabled:
  false` is CORRECT — do not "fix" it. Arming it creates Claude/Codex loops that
  drain both subscriptions, and the only controlled study of Codex reviewing
  Claude found harm precisely when reviewer output was auto-adopted (audit
  2026-08-31).
- Codex is worth having here because it is INDEPENDENT: it deliberately does not
  share Claude's `code-review` skill, so the two do not correlate as reviewers.

## Skills

Installed skills are invoked on judgment; there is no forced-invocation rule.
Provenance for the shared rules and workflows is the `claude-harness` repo.

## Running the tests

`npm` is NOT on PATH. From the repo root:

```
& 'C:\Users\corey\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test --test-concurrency=1
```

**A skipped test is a real finding, not noise.** Expect the exact count the
newest handoff states; if you measure a different number, say so rather than
carrying the old one forward.

## Conventions

- Use `git commit -F <file>` for any message containing quotes — PowerShell
  mangles them otherwise.
- `gh` is NOT installed. Check PR state with
  `git ls-remote github "refs/pull/*/head"`.
- **Flag your own mistakes prominently in the repo's own record** rather than
  quietly fixing them. Commit messages here name which errors were whose.
- End a working session by writing a date-stamped brief to `docs/handoffs/`
  carrying its `sessionId`, so the next session starts from one sentence.
