# Transfer handoff — Swords & Sandals II Multiplayer Foundation

## State at the end of the 2026-08-31 session

22 promoted goldens and **no runtime evidence yet for the champion, armoured or
tournament families**. **586 tests, all passing, 0 skipped** in a capture-bearing
worktree.

The 2026-08-30 session landed 38 commits (`1d829c7..2d70738`); the previous
handoff said 36. PR #1 has since merged — `github/main` is `e3f14aa`, whose
history includes `ecf4510` — and the 2026-08-31 session added the commits on
`arena/champion-capture`.

### Expected test profiles

- A capture-bearing operator worktree with the complete ignored raw-trace
  archive runs all **586 tests: 586 passed, 0 skipped, 0 failed**.
- A fresh clone or worktree with none of those ignored traces runs **586 tests:
  585 passed, 1 skipped, 0 failed**. The skipped test is the raw-trace archive
  existence check; the committed observation and divergence integrity checks
  still run.
- A partial raw-trace archive does **not** skip: it fails and names every
  missing expected trace.

**The skip is now anchored, and this is the part that changed.** It used to skip
whenever zero expected traces resolved, and a count of successful lookups cannot
tell "fresh clone" from "the path derivation is broken" — three one-character
edits each made it skip silently on a machine holding the complete archive, and
the resulting run was byte-identical to the fresh-clone profile documented
above. It now requires a POSITIVE anchor: `captures/README.md` is the one path
`git ls-files captures` returns, so it exists in a fresh clone AND on an
operator machine. If it does not resolve, the derivation is wrong and the test
FAILS naming it, instead of skipping.

So a skip no longer needs a human to check which kind of machine they are on.

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
4. **The champion's numbers were derived with no free parameter, from formulas
   committed a day before the champion was ever met.** `unleash_hell`'s
   hard-coded DNA, read through `initcharacter` and `battlevalues`, gives
   `hitpointsmax` 110 and `armourclass` 86, and thirteen live draws recorded
   exactly those. Five `candidate-champion-*` fixtures exist.

   **The previous version of this file said the champion was "decoded from the
   map before it was ever seen" and that the reading "PREDICTED" those numbers.
   That is not what the record shows, and the overstatement was mine.** It is
   corrected here rather than quietly fixed because it was load-bearing: it was
   the stated reason to trust the champion family, in the document a new session
   reads first, on a project whose whole discipline is that a candidate fitted
   to a known answer makes its own confirmation meaningless.

   The chronology, established by an auditor and then checked independently:

   - `6dc750e` (2026-08-29 23:57) already carried every term needed —
     `hitpointsmax = herolevel * 10 + vitality * 20`, the per-piece armour
     multipliers, and decisively the `helmet > 25` branch — at
     `docs/integration/ss2-battle-map.md:131-134`, in a file that contains no
     champion.
   - The thirteen draws ran 2026-08-30 21:31 to 22:06.
   - `ss2-champion-dna.md`'s only commit before today, `5d3d777`, is
     2026-08-30 22:48 — **42 minutes after the last draw.**

   So the FORMULAS were effectively pre-registered, some 21 hours before the
   opponent existed in this project. The DNA INDEX MAP was written afterwards.
   That map has no fitting freedom to exploit — 50 strictly sequential
   `characterDNA[n]` assignments, re-derived mechanically from the opcode stream
   and matching the published table offset for offset — but "written afterwards"
   and "predicted" are different claims, and only the first one is true.

   The pre-registration is the stronger argument anyway, and the old wording
   omitted it entirely. Without the `helmet > 25` branch the same arithmetic
   gives `armourclass` 1081 rather than 86, so that branch is exactly the
   constant a back-fit would have had to invent — and it was in the repository a
   day early. [`ss2-champion-dna.md`](docs/integration/ss2-champion-dna.md) now
   states this as a postdiction in its own text, and says it must not be
   restated as a forward prediction.

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

1. **Capture the champion bout. The tooling blocker is gone; a NEW and better
   understood one replaced it.** `run-arena.ps1` now exposes `-WatchFields`, so
   the family finally has a vehicle that carries the eleven extra fields, the
   `-Stage*` flags AND a snapshot guard. Three attempts ran on 2026-08-31 and
   **captured nothing**, for reasons now backed by a trace rather than by
   reasoning. Read
   [`ss2-staging-runbook.md` §2A.5](docs/integration/ss2-staging-runbook.md)
   before touching the staging string; the short version:

   - The route WORKS. It beat the ladder and reached John the Butcher at
     110/86 — the fifteenth sighting of exactly the decoded numbers — and
     staging applied at every bout including that one.
   - `captureAllowedNow` refused all bout long on BOTH conditions.
     `hero.herolevel` was WRITTEN as 5 and READ as 4 at arming time (staging
     `herolevel:5` and `experience:0` together looks self-cancelling, but that
     is **not yet verified from the bytes — verify it before editing the
     string**). And `staminaleft` peaked at 107 of 110, never full, because it
     carries across bouts and `battlevalues` refills it only at `<= 0`.
   - The two configurations tried produce each other's wanted value: unstaged,
     the hero levels to 5 and the gate wants 4; staged with `experience:0`, it
     stays at 4 and the gate wants 5.

   Only the two direction-5 members can go through `run-arena.ps1` at all — the
   quick and power band members need `-Autopilot`, which it does not forward.
   Winning is still not required: the wrapper arms on the first
   `checkattackroll` and closes on that call's return.

2. **Capture `candidate-armoured-*` (5) and `candidate-tournament-*` (3).**
   Both reachable with the tooling as it stands, and neither needs the
   tournament ladder, so neither carries the level/stamina problem above.
   `campaign.mjs watch-fields --family <f>` prints what each needs — note the
   armoured family does NOT agree on one watch list, so it must be run one
   member at a time. Staged armour IS honoured (`damagecharacter` reads the live
   reference at roll time); staged `hitpoints` is NOT (`check_stats` clamps it
   every phase transition). **This is now the cheapest real evidence available
   and should probably come first.**

3. **The spell family (8) is still blocked** — the hook fix was necessary but
   not sufficient. See below.

`campaign.mjs plan --family <f>` names blocking reasons derived from the
repository, and [`ss2-staging-runbook.md`](docs/integration/ss2-staging-runbook.md)
has per-fixture commands.

---

## Open items

### Found 2026-08-31, not yet closed

**A third working forgery against the promotion gate. CRITICAL.** Hook
attribution is not merely unverified — `reason` is stripped from BOTH sides
before comparison (`src/golden/observation.js:753-760` and `:803-808`,
`src/golden/promote-1v1-golden.js:373`), so a record carrying deliberately WRONG
hook labels, `callSite` or `injected` passes ingest, verify AND the promotion
gate, and yields a golden the committed suite accepts. The mutation trace is the
documentation's own "substantive evidence", and its attribution to a game
function is the only thing separating "`damagecharacter` subtracted these
hitpoints" from "some unnamed code did". This is the same class as the two
forgeries closed in `cc42503`, and it is open.

The fix is to translate rather than strip — map each fixture entry's static
reason through the hook table and compare — and it costs no re-capture. **Do
NOT instead add a fixture-derived `callSite` comparison:** `callSite` is a
compile-time constant in the wrapper's single roll emitter, so comparing it
would manufacture the appearance of verification while comparing one hard-coded
constant to another, which is the defect class this project has now found six
times.

**`validate-vehicle.ps1`'s new save tripwire hashes only the FIRST file named
`ss2_data.sol`.** This machine's save root holds three `.sol` files. The gate is
isolated by `--save-directory` regardless, and the tripwire is documented as
currently unarmed, but it is narrower than it reads.

**`src/adapter/battle-host.js:155` returns `{ ...declared, resources: first }`,
and `declared` may legally be an array since `193e54d`.** An array `aiFill`
collapses to a single object — reproduced end to end against the real modules.
Pinned by no test. The workaround retirement this was found under is NOT done:
removing it reddens three assertion sites in `test/ss2-adapter-integration.test.js`,
one of which pins the defect being removed, so the source edit and its test
rewrite have to land together in one owner's hands.

*(My error on that track: I briefed the agent with the path `src/team/battle-host.js`.
The file is `src/adapter/battle-host.js`. The agent correctly stopped and
reported rather than guessing.)*

**`-StageGold` re-staging on retry: the obvious fix is worse than the bug.**
Gold gates WHICH weapon the shop scanner accepts, and `hero.weapon` is a
`battlevalues` input. Making the gold write once-only while leaving the shop
re-entry in place would let attempt 2 buy a DIFFERENT, cheaper weapon and fight
with different damage rolls — a real evidence defect, where the current bug only
fabricates a gold figure no artefact carries. Scope any fix to make the SHOP TRIP
idempotent, not the gold write.

**One `isNum` site survives, at `ss2-capture-wrapper.as:1407`** — two raw hero
reads compared with BOTH negated forms, and one operand is demonstrably NaN in a
committed live trace. Fail-closed (`arenaAbort` only sets flags and logs), so it
is a correctness and diagnosability defect rather than a corruption path, but the
claim that the guard is used everywhere it is needed is false.

**The fifteen impossible-hero fixtures: the contradiction is FORCED, not a failed
search.** The `max_damage - min_damage` spread is strength-free, and exactly one
row in ninety has spread 8 — so the weapon is uniquely determined before strength
is considered, and only then does strength turn out to be wrong. And the escape
hatch is closed: `nextphase` recomputes `battlevalues` for BOTH combatants at
every phase transition (`ss2-capture-wrapper.as:2078`), so `-StageHero
"strength:5,min_damage:12,max_damage:20"` cannot reproduce them live either.
Still deliberately NOT fixed — they must be re-derived from the map, not edited
to fit — but the reasoning is now a proof rather than an absence.


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

## The design track is deliberately quarantined

A separate track researches endless progression, on branch
`design/endless-progression` (PR #1), and it now carries a complete proposed
Arena Circuit progression, loot, inventory, opponent and settlement design.

**Design must never flow into candidate authoring.** A candidate fitted to a
design is a candidate fitted to a hypothesis, and the capture that "confirms" it
confirms a fit rather than a prediction — which is the one failure this whole
pipeline exists to prevent. The rule is not that the two tracks disagree; it is
that the measuring instrument must not be shaped by what anyone hopes to
measure. Read the design if you are working on the design. Do not read it while
authoring a fixture.

This omission is mine: the rule was in the previous handoff and I dropped it
when rewriting this file, at exactly the moment the design track grew from a
brief into a full proposal.

**Repository naming.** The GitHub repo was renamed to
`Zanzagar/swords-and-sandals-2-multiplayer`; the `github` remote already points
at the new URL. The local worktree directories and the `origin` bundle keep the
old `ss2-team-arena-foundation` name **intentionally** — do not rename them or
hand-edit worktree metadata. `package.json` still carries the old identity on
`main`; the migration is part of PR #1 and lands when that merges.

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
