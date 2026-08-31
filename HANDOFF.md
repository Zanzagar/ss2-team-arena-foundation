# Transfer handoff — Swords & Sandals II Multiplayer Foundation

## State at the end of the 2026-08-30 session

22 promoted goldens. 584 tests, all passing. 36 commits this session, across a
day of parallel work and one overnight run of twelve agents.

### Expected test profiles after PR #1

- A capture-bearing operator worktree with the complete ignored raw-trace
  archive runs all **584 tests: 584 passed, 0 skipped, 0 failed**.
- A fresh clone or worktree with none of those ignored traces runs **584 tests:
  583 passed, 1 skipped, 0 failed**. The skipped test is the raw-trace archive
  existence check; the committed observation and divergence integrity checks
  still run.
- A partial raw-trace archive does **not** skip: it fails and names every
  missing expected trace. This keeps the clean-clone accommodation from
  weakening evidence retention on an operator machine.

Read this section, then [`docs/overnight-agent-plan.md`](docs/overnight-agent-plan.md)
for how the parallel work is organised.

### What changed at the level of what this project can do

1. **Parallel capture works.** `-SaveDirectory` was never broken. Three
   concurrent sessions complete in 22s against ~45s serial, all matching
   promoted goldens, master save byte-identical.
2. **The leveled-gladiator arena route runs end to end.** A gladiator was taken
   1 → 4 and fought the tournament ladder to rank 2 in five of six attempts.
3. **The wrapper can stage a scenario and buy equipment**, both owner-approved,
   both declared in the evidence.
4. **The champion was decoded from the map before it was ever seen.** Reading
   `unleash_hell`'s hard-coded DNA through `initcharacter` and `battlevalues`
   PREDICTED `hitpointsmax` 110 and `armourclass` 86; twelve independent live
   draws recorded exactly those. Five `candidate-champion-*` fixtures exist.

### The single most important correction

**Five separate adversarial passes each found the same defect class — a test
whose assertion cannot fail — and each one had been hiding a real bug.** That is
now the project's most reliable signal, and the reason to keep running
write-nothing auditors against named claims.

Two forgeries against the promotion gate worked *by the documented pipeline*
and are now closed:

- **The launch-nonce gate was opt-out.** Copy a raw trace, change the ids,
  delete the nonce key: both ingest, both promote, and you get a golden claiming
  two independent sessions from one capture. Now mandatory for
  `injected-tape-runtime` on the same terms as `overdraw`.
- **An observation could carry unlimited invisible draws.** Cosmetic opcode
  rolls are excluded from matching by label regex on *both* sides, so a record
  with 120 fabricated debris rolls matched a 7-sample fixture. Records now
  refuse opcode samples outright — the doc's own reasoning (no instrumentation
  can observe the opcode stream) is exactly why no record should hold one.

**The 22 goldens are sound.** Independent re-derivation reproduced every one
byte-for-byte; manifests, digests and cited observations all resolve.

---

## What is running, and how to run it

| Script | Purpose | Guards |
| --- | --- | --- |
| `run-campaign.ps1 -Concurrency N` | capture families in parallel | refuses `N>1` for any navigator but `prisoner` |
| `run-arena.ps1` | the save-mutating arena route | refuses to start without a fresh snapshot, takes it itself, hashes before/after |
| `launch-capture.ps1` | one session; the ONLY script with both `-WatchFields` and `-Stage*` | **no snapshot guard** — see Open items |
| `validate-vehicle.ps1` | wrapper gate after any edit | prints the source hash it compiled, and what it does not prove |
| `save-state.ps1` | snapshot/restore | refuses an empty tree, and refuses to restore a WIPED save |

Snapshots: **`level4-vitality-tournament-gate`** (vitality 13, 5723 gold,
`current_tournament` 1 — `hitpointsmax` reads 220 in the level-up log because
`battlevalues` last ran pre-spend; the formula gives 300) and
**`level4-armed-weapon39`** (the same gladiator after a shop trip: weapon 39,
843,130 gold, strength and speed 60). `verified-good-1701` and `pre-arena-path`
are the original level-1 gladiator.

**`zainger-repaired` is a WIPED save under a reassuring name.** `save-state.ps1`
now refuses to restore it without `-Force`.

---

## Non-negotiable rules (each learned the hard way)

- Licensed SWFs are read-only and hash-verified before and after every capture.
  Never copy, export or commit game assets or extracted scripts.
- **Never shortcut the game's own frames.** Jumping past the prologue tripped
  the game's own validation screen.
- A candidate becomes golden ONLY via >=2 matching observations from >=2
  sessions. Never hand-write a golden, observation or manifest.
- **Derive candidates from the battle map, never from a capture.**
- `validate-vehicle.ps1` must PASS after ANY wrapper edit — but see below for
  what that does and does not mean.
- Snapshot before every save-mutating run. `run-arena.ps1` does it for you.
- Use `git commit -F <file>` for any message containing quotes.

### AVM1 has ONE comparison opcode

`>` is `<` with operands swapped; `>=` and `<=` are `<` negated. Every
comparison with NaN is false, so **both negated forms return TRUE for NaN**, and
every field the wrapper reads is undefined until the frame that initialises it.
This caused **three separate live defects in one day**, including one that
rewrote the gladiator's gold. The only safe shape is un-negated `<`, twice:
`(n < 1) || (0 < n)`. Use `isNum()`.

### `validate-vehicle.ps1` proves less than its name suggests

Audited: it catches **0 of the 6 defects found live on this route**, `isNum` has
**zero reachable call sites** in a stub run, and a one-line revert of `isNum`'s
body leaves the gate green while restoring the demonstrated save-corruption bug
verbatim. Save corruption is outside its observable universe by construction —
it compares a trace to a fixture, never a save. It now says so in its own PASS
output and names the wrapper source hash it compiled.

---

## Next steps, in order

1. **Capture the champion bout.** Everything is in place except one thing:
   **it cannot go through `run-arena.ps1`.** All five champion fixtures need
   eleven extra `-WatchFields`, and only `launch-capture.ps1` exposes both that
   and `-Stage*` — and it has no snapshot guard. Snapshot by hand first, or add
   the guard. Winning is not required: the wrapper arms on the first
   `checkattackroll` and the trace closes on that call's return.
2. **Capture `candidate-armoured-*` (5) and `candidate-tournament-*` (3).**
   Both reachable with the tooling as it stands. `campaign.mjs watch-fields
   --family <f>` prints what each needs. Staged armour IS honoured
   (`damagecharacter` reads the live reference at roll time); staged `hitpoints`
   is NOT (`check_stats` clamps it every phase transition).
3. **The spell family (8) is still blocked** — the hook fix was necessary but
   not sufficient. See below.

`campaign.mjs plan --family <f>` names blocking reasons derived from the
repository, and [`ss2-staging-runbook.md`](docs/integration/ss2-staging-runbook.md)
has per-fixture commands.

---

## Open items

**Evidence chain**
- Two-session independence still rests on operator strings for every promoted
  golden: 9 of 67 records carry a nonce and **none of the 9 is cited by a
  golden**.
- **Hook attribution is never verified anywhere.** `reason` is stripped from
  both sides before comparison, so hook labels, `callSite` and `injected` are
  unfalsifiable in all 22 committed observations.

**Fifteen fixtures assert a hero the build cannot produce.** Groups C–F stage
`strength 5` with `min_damage 12 / max_damage 20`, which under the verified
`round(strength*2) + weapon_min_damage` implies a weapon row `[3]=2 [4]=10`. All
90 rows were dumped; no such row exists. The closest is `weapon41` (4/12), which
works at strength **4** or **8** — one point off each fixture. **Deliberately not
fixed**: candidates are derived from the map, never edited to fit, so these
should be re-derived properly rather than patched.

**The spell ingress cannot arm.** The hook label and `magic-damage` event are
fixed, but all 13 `checkattackroll` sites were enumerated and none falls inside a
spell arm; `attack_chances` is not reachable on a hero cast turn. And **`spell_id`
does not exist anywhere in the build** — both branches of that code are dead. The
byte-backed candidate for an arming point is `cast_spell_icon`, which carries the
inventory id as a literal argument; wiring it changes the capture window's
boundary (a cast's impact lands many frames later) and needs the gate re-run.

**GATE A freezes a game mechanic, deliberately.** The route writes
`time_of_day = 24` on every town-square entry; no button does that. It suppresses
the day counter, the lighting and the 200-point special event, and frame 150
persists the frozen value. Kept — the event it prevents permanently mutates
charisma, magicka or gold and saves *that* — but it is an alteration,
owner-approved, and must not be described as a button replication.

**Save-safety items not yet closed**
- `run-arena.ps1` still kills every Ruffle process rather than its own pid,
  which sabotages any concurrent isolated session.
- `validate-vehicle.ps1` launches Ruffle at the REAL save with no
  `--save-directory` and no process guard, while this file mandates running it
  after every wrapper edit.
- Two unguarded arithmetic writes to DNA fields: `experience = experienceneeded
  + 1` and `vitality++`. Neither operand was shown to be undefined, so this is
  argued rather than demonstrated — but it breaks the file's own isNum rule.
- `-StageGold` re-stages on every `-Attempts` retry, discarding gold the
  previous attempt earned.

**Adapter**
- No per-action animation acknowledgement, so nothing sequences action N+1's
  rebind against action N's running timeline. Documented as a gap, not designed.
- `roster.js` now supports per-slot AI fill; `battle-host.js` can drop its
  `aiFillWithResources` workaround and retire `diagnostics.aiFillResourceGaps`.

**Docs known stale** (flagged by agents, not yet reconciled): the staging
runbook's `parseStageList` mechanism (it guards with `isNum`; it does not write
NaN) and its "weapon table unmapped" premise (it is decoded);
`ss2-arena-route.md` §12 on `armourclass` being re-derived mid-battle (it is
not — that is the whole basis of the armoured family); `ss2-champion-dna.md` §7
on `fightMode` (the fixtures carry it now).

---

## Working agreement for parallel agents

Exclusive file ownership stated in every prompt; no agent runs a state-mutating
git command; no agent launches Ruffle or touches the installation, the save or
the snapshots; adversarial verifiers write nothing at all.

**The limit is the file graph, not the budget.** Writers are capped at ten to
twelve coherent slices. Auditors have no cap, because they write nothing and
cannot conflict — and several independent auditors on the same target is a
quality technique, not duplication. Give each one ONE named claim to break.

## Keep the project lawful and reversible

Use only a licensed local copy for inspection. Keep originals untouched, work in
a separate mod folder, and distribute patches or independently authored files
rather than the original game files or assets.
