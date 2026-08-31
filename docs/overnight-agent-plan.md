# Overnight agent plan

A ready-to-run fan-out for an unattended session. Written 2026-08-30 at the end
of the arena session; read [`HANDOFF.md`](../HANDOFF.md) first, because every
track below assumes its state.

## The constraint that shapes everything

**No agent may launch Ruffle.** Every capture is therefore serial and
supervised, and none of the tracks below produce runtime evidence. What they
produce is everything that makes the next supervised capture session cheap:
fixtures derived from the map, staging plans, audits, and the code the pipeline
needs.

One exception is now defensible and was not before. Isolated-store sessions
(`-SaveDirectory`) provably cannot touch the licensed save — verified live:
three concurrent sessions completed, all matched promoted goldens, and the
master `ss2_data.sol` was byte-identical afterwards. So a *tightly scoped*
capture agent restricted to `-Concurrency` prisoner-family rounds is
justifiable if throughput is wanted. **The arena route must never be in an
unattended run**: it is the only thing that writes the licensed save, and it
has already twice been saved from corrupting a gladiator by a guard rather than
by a plan.

## Standing rules — paste into every agent prompt

- You own ONLY the files listed under YOUR FILES. Touch nothing else. If you
  become convinced another file must change, STOP that part and say so
  prominently in your report.
- NEVER run a state-mutating git command. Read-only git is fine. The main
  session owns git and commits everything.
- NEVER launch Ruffle. Never write to the game installation, the Ruffle save
  (`%LOCALAPPDATA%\ruffle\SharedObjects`) or the snapshots
  (`%LOCALAPPDATA%\ss2-capture-snapshots`).
- READ-ONLY static inspection of the installed SWF is permitted and is how the
  maps were made: `node tools/inspect-swf.mjs "<swf>" --references '<name>'
  --around 90`. You may READ. You may NOT copy, export, patch or write any part
  of the SWF or any decompiled game script anywhere. Only frame labels, symbol
  names, character ids, instruction offsets and derived numbers may enter a
  document.
- Never hand-write a golden fixture, an observation record or a capture
  manifest. Those come from the pipeline only.
- Tests: `'C:\Users\corey\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test --test-concurrency=1`
  (npm is NOT on PATH; concurrency 1 because the machine is memory-starved with
  many agents and parallel spawns intermittently fail with `spawn UNKNOWN`,
  which is not a code failure).
- Leave the suite green and report the exact count.
- Scratch files go in the session scratchpad, never in the repo.

## Tracks, with exclusive file ownership

| # | Track | Owns |
| --- | --- | --- |
| 1 | **Spell ingress hook.** The wrapper registers `magic_damage_character` with the `damagecharacter` label and emits no `magic-damage` event, so no spell capture can ever be evidence. Find the right hook label from the map and emit an event carrying the `damage_method` argument. `validate-vehicle.ps1` must PASS after the edit — but the agent cannot run it (it launches Ruffle), so the agent edits and REPORTS, and the main session validates. | `tools/runtime-capture/ss2-capture-wrapper.as` — **only if no supervised session is running**; otherwise report a patch |
| 2 | **Per-slot AI fill.** `src/team/roster.js` builds AI-filled slots from one `aiFill` template per team, not per slot, so the host reports `diagnostics.aiFillResourceGaps` and declares nothing when two filled slots disagree. Give the roster a per-slot fill source. | `src/team/roster.js`, `test/team-resolver.test.js` |
| 3 | **Adversarial audit of the golden pipeline**, the same way the campaign store and adapter were audited. Target `src/golden/**` and `test/ss2-golden*.test.js`. Attack the promotion gate, the matching rules, the digest, and above all the tests: which of them would still pass against a stub? | writes NOTHING |
| 4 | **Adversarial audit of the capture-attestation work** (`overdraw`, `launchNonce`, `staged`). Its author stopped without a completion record, so nothing has independently checked it. | writes NOTHING |
| 5 | **Test-suite hardening sweep.** Across every test file, find assertions that re-state the implementation, `assert.throws` with no message predicate, and values the test itself supplied. Two such defects have already been found by audit; assume more. | one new file, `test/ss2-assertion-quality.test.js`, plus a report |
| 6 | **`docs/integration/ss2-capture-staging.md` reconciliation.** It predates the staging capability, parallel capture, and the arena route, and its Group F entry was already found wrong once. | that file only |
| 7 | **Battle-map completion.** `docs/integration/ss2-battle-map.md` has open questions the session closed (sprite-862 labels, the win/loss reward formulas). Close them and mark what remains. | that file only |
| 8 | *(optional, throughput)* **Isolated capture campaign.** `run-campaign.ps1 -Concurrency 3` over prisoner families only. Requires launching Ruffle, so grant it only deliberately and never alongside an arena run. | `captures/**` (gitignored) |

## What NOT to give an unattended agent

- Anything using `run-arena.ps1`, `-Navigate arena`, `-StageGold`,
  `-ShopWeapon` or `-StageHero`. That path writes the licensed save.
- `tools/runtime-capture/ss2-capture-wrapper.as` while a supervised capture
  session is in progress — the main session edits it and re-validates the
  vehicle after every change.
- Authoring a candidate fixture from anything other than the map. The
  discipline is absolute: a candidate fitted to an observation makes its own
  confirmation meaningless.

## Sizing

Agents on this project have run 150k–380k tokens each. A twelve-agent fan-out
is roughly 2–4M tokens. Budget accordingly against the weekly allowance, and
prefer fewer agents with sharper briefs over more with vague ones — every
high-value finding so far came from a brief that named the specific claim to
attack.
