# Transfer handoff — SS2 Team Arena Foundation

## State at the end of the 2026-08-30 arena session

Read this section before touching anything.

22 promoted goldens. 517+ tests. Three things changed the shape of the project
this session, and each of them corrected a claim the previous handoff made:

1. **Parallel capture works.** `-SaveDirectory` was never broken.
2. **The leveled-gladiator arena route works** against the real build, end to
   end, and a gladiator has been levelled 1 → 4 and fought the tournament
   ladder to rank 2.
3. **The wrapper can now stage combatant state**, with the owner's approval.
   This is the first time it authors game state rather than only observing.

### The correction that matters most to trust

The previous handoff said "an audit re-read all 89 raw probe traces and found
every measurement replicates across all twelve directions with zero
exceptions." **That is false, and no campaign can make it true.** Each melee
band only ever draws its own four directions, so 4-of-4 is the ceiling. The
earlier audit measured the *union* across all ten probe arms (1–12) and
reported it as per-measurement coverage. The real figures, now committed as 69
regenerated divergence reports plus
[`ss2-probe-replication.md`](docs/integration/ss2-probe-replication.md):

| Measurement | Sessions | Directions |
| --- | ---: | --- |
| `rollneeded` 27, quick | 26 | 3 of 4 |
| `rollneeded` 44, normal | 14 | 3 of 4 |
| `rollneeded` 63, power | 25 | 4 of 4 |
| Critical-deflection threshold 100 | 10 | 2 of 4 |
| Armour-selection sample | 14 | **1 of 4** |

The armour-selection measurement produced **zero** divergence reports — both
its above-the-gate runs were direction 5 — so regeneration left the weakest of
the three planned measurements exactly where it was.

---

## What runs now

### Parallel capture (`-Concurrency`)

`tools/runtime-capture/run-campaign.ps1 -Concurrency 3` runs three sessions at
once, each with its own SharedObject store seeded from the real save. Measured:
three rounds in **35 s** with a cold wrapper compile, three matches, zero
divergences, master save byte-identical.

**`-SaveDirectory` was never broken.** `tools/ffdec.ps1` redirects
`LOCALAPPDATA` to `.tools/ffdec-profile` for the whole PROCESS, and
`launch-capture.ps1` called it for the wrapper compile — so the seed copy then
read a master-store path inside `.tools/` that does not exist, skipped the copy
behind a `Test-Path`, and handed Ruffle an empty directory. Ruffle did the only
thing it could. The log lines that would have said so immediately were
suppressed by `RUST_LOG=avm_trace=info`, which sets Ruffle's *global* level to
off. Both causes are fixed and the seed is now asserted byte-identical rather
than attempted.

**Scope limit:** per-session stores FORK the save. Right for the capture
campaign, wrong for the arena route, which must ACCUMULATE across bouts.
`-Concurrency > 1` is refused for any navigator but `prisoner`.

### The arena route (`-Navigate arena`, `run-arena.ps1`)

A looping state machine over the screen the game rests on. Every action
replicates a named `DefineButton2` body statement for statement. Verified live:

- level 1 → 2 through the game's own prisoner fight (~7 s);
- level 2 → 4 through duels;
- the tournament ladder from rank 4 to rank 2 in **five of six** attempts.

`run-arena.ps1` refuses to start without a fresh snapshot name, takes the
snapshot itself, and hashes `ss2_data.sol` before and after. `-Attempts N`
relaunches after the two aborts that are ordinary rather than defects (a lost
duel; the 2 % special-event draw). Retries deliberately do **not** restore the
snapshot — the save already holds every completed bout.

Snapshot **`level4-vitality-tournament-gate`** holds the level-4 gladiator:
vitality 13, 220 hitpoints, 5723 gold, `current_tournament` 1.

### Scenario staging (`-StageHero`, `-StageVillain`)

`stepStaging` in the wrapper writes `field:value` pairs once `battle_started`
is true — past the frame-214 full heal, past frame 221's forced
`equipped_weapon = 1`, past `initbattle` — repeated for 20 frames because the
game re-derives values during battle construction. It stops before the action
arms, so no staged write can ever appear in the mutation trace. Every field is
reported on the trace's `end` line, read back from the game rather than echoed.

**Verified live:** eleven fields including `herolevel`, `min_damage 300` and
`hitpoints 999` all stuck.

Why it exists: `candidate-armoured-*` stages helmet 6 / greaves 2, which
`randomise_gladiator` will never produce by chance; and the champion bout needs
a *reproducible* hero, which the ladder cannot give (below).

---

## The tournament rank-1 bout

**The opponent is reproducible. Confirmed live**, not just from the bytes:
"John the Butcher", 110 `hitpointsmax`, 86 `armourclass`, identical across
**eight independent draws**, matching the hard-coded DNA literal `unleash_hell`
builds him from. `unleash_hell` contains zero RNG of any kind.

**The hero entering that bout is not**, and this was observed rather than
inferred: in eight of nine ladder runs the hero levelled 4 → 5 after the rank-3
bout, because experience per bout is a *generated* opponent's `character_xp`.
`staminaleft` also carries across bouts — `battlevalues` resets it only when it
is already `<= 0`. Both are projected fields, so two sessions differing in
either cannot match.

Hence two things:

- `arenaCapture=champion` **refuses to arm** unless the hero enters at
  `-ArenaStagedLevel` with full stamina. It would have refused all nine
  observed runs, which is the point: a silent non-match becomes a visible
  refusal.
- **Winning the champion bout is not required.** The wrapper arms on the first
  `checkattackroll` and closes the trace on that call's return, so the evidence
  is one action. `run-arena.ps1` treats a closed trace as success. This matters
  because a vitality-only gladiator loses to him **0 for 8**, and staging the
  hero to 100 strength / 300–400 damage / 999 hitpoints **still lost** — see
  the open question below.

---

## Non-negotiable rules (each learned the hard way)

- Licensed SWFs are read-only and hash-verified before and after every capture.
  Never copy, export or commit game assets or extracted scripts.
- **Never shortcut the game's own frames.** Jumping past the prologue tripped
  the game's own validation screen. Locking the frame rate is fine; every frame
  still runs.
- A candidate becomes golden ONLY via >=2 matching observations from >=2
  sessions. Never hand-write a golden, observation or manifest.
- **Derive candidates from the battle map, never from a capture.**
- `tools\runtime-capture\validate-vehicle.ps1` must PASS after ANY wrapper edit.
- Use `git commit -F <file>` for any message containing quotes.
- Snapshot before every session. `run-arena.ps1` does it for you and refuses to
  run otherwise.

### AVM1 has ONE comparison opcode — read this before touching the wrapper

`>` is `<` with the operands swapped; `>=` and `<=` are `<` negated. Every
comparison with NaN is false, so **both negated forms return TRUE for NaN**.
Every value the navigator reads is undefined until the frame that initialises
it.

This bit twice in one run. `tod >= ceiling` aborted the first live arena run at
430 ms with `time_of_day` undefined. The guard written to fix it,
`n > 0 || n <= 0`, did it again — `NaN <= 0` is `!(0 < NaN)` is true — so the
guard passed the exact value it existed to reject. The only safe shape is
un-negated `<`, twice: `(n < 1) || (0 < n)`. Use `isNum()`.

---

## Corrections to the previous handoff and to the static audits

| Claim | Status |
| --- | --- |
| "every measurement replicates across all twelve directions" | **False.** 4-of-4 is the ceiling; see the table above |
| "a levelled gladiator stays comparable with the 22 goldens" | **False.** `hitpointsmax` is a projected field AND an operand of the defeat gate. A level-4 gladiator cannot re-observe any golden. The defensible claim is only that vitality-only spending adds no new operand to a measured formula |
| "a tournament loss ends the character" | **False.** No flush site is reachable from any bout, the ladder, the win chain or the loss path. Eight champion losses cost gold and counters; the gladiator survived every one |
| "pressing button 2283 early parks forever" | **False.** The refusal arm sets a text field and jumps to the end — idempotent and retryable. The gate is still right; the consequence was overstated |
| "every session runs the DEMO build" | **False at runtime.** `game_mode` reads `"full"`. The audit inferred demo from `fizMode` being unset; it would have capped herolevel at 12, tournaments at 3 and ammo at 10, and does not |
| "`-SaveDirectory` is not usable" | **False.** See above |
| level 1 needs 60 experience | **Wrong.** It needs 125 — the near-125 floor the route map could not fully decode is real |

Two hazards the four preconditions **missed**, both now handled:

- Root frame 150 draws `1 + RandomNumber(100)` on EVERY town-square entry and
  jumps to the special event when it is `<= 2` — a flat **2 % per entry**,
  independent of `time_of_day`, through an opcode nothing can intercept. A
  levelling run makes three to six entries, so 6–12 % of healthy runs end this
  way. GATE B catches it; `-Attempts` retries it.
- The tournament loop **never returns to town square**, so the whole ladder
  shares one `time_of_day` budget with no reset anchor.

GATE C was **confirmed live on the first run**: after the fourth point was
spent, `statpointsHero` read 0 while `statpointsRoot` still read 1. The mirror
lagged by exactly one point, so pressing in that slot would have taken the
refusal arm.

---

## Next steps, in order

1. **Capture the champion bout.** Everything is in place: the ladder reaches
   rank 2 reliably, staging makes the hero reproducible, and the trace closes on
   one action. Run `run-arena.ps1 -ArenaTarget tournament -ArenaCapture champion
   -ArenaStagedLevel <n> -StageHero <fields>` twice from the same snapshot and
   ingest both.
2. **Capture `candidate-armoured-*` (5).** These need `-StageVillain` with the
   per-piece `<piece>_defence` names, and `-WatchFields` with the same names —
   the wrapper's default list omits them and ingest refuses a trace missing a
   field the fixture stages.
3. **`candidate-tournament-*` (3)** — the defeat gate's first-blood term, now
   reachable since `fight_mode == "tournament"` is.
4. **The spell family has never been captured.** The wrapper's
   `magic_damage_character` hook is registered with the `damagecharacter` label
   and emits no `magic-damage` event. It needs the right hook label and an event
   carrying the `damage_method` argument.

---

## Open questions and known defects

**Staged combat stats did not change the outcome, and nobody knows why.**
Staging `strength 100 / min_damage 300 / max_damage 400 / hitpoints 999` and
reading all eleven fields back correctly still lost to an opponent with 110
hitpoints and 86 armour, in about the same wall clock as an unstaged run. Either
something recomputes these mid-battle (`battlevalues` and `check_stats` are the
candidates), or the damage path reads different fields than `game.hero.min_damage`.
**This matters for the armoured fixtures**, which stage defender armour and need
it to hold through `damagecharacter`. Settle it with a targeted probe before
trusting a staged capture of that family.

**Evidence chain**
- Two-session independence still rests on operator-supplied strings for every
  promoted golden: `capture.launchNonce` now exists and promotion refuses a
  shared one, but **not one of the 22 goldens cites a nonce-bearing
  observation**.
- Ingest drops no-op writes, so a candidate omitting an unconditional write
  would still match.

**Adapter**
- `src/team/roster.js` builds AI-filled slots from one `aiFill` template per
  team, not per slot; the host reports `diagnostics.aiFillResourceGaps` and
  declares nothing rather than guessing.
- **A4 is open and needs four files one agent did not own.** The completion
  token is `team-arena:<winner>:<losers>:<reason>` and carries no battle
  identity, so two bouts between the same teams share a token and bout 1's
  acknowledgement settles bout 2. Fixing it needs `resolver.js` to pass the
  battle to `CampaignSettlement`, `record.js`'s `assertSettlementBlock` to stop
  recomputing the token, and two test files that hard-code the literal string.
  Record ids change, which is cheap now (no campaign records are committed).
- No per-action animation acknowledgement exists, so nothing sequences action
  N+1's rebind against action N's running timeline. Documented, not invented.

**Campaign persistence**
- `buildCampaignRecord` now refuses a battle where a combatant entered already
  at zero health. Distinguishing "entered down" from "we lost the event" is new
  data and a schema-3 question.

---

## Working agreement for parallel agents

Eleven ran this session on these rules: exclusive file ownership stated in the
prompt, no agent runs a state-mutating git command (one owner commits), no agent
launches Ruffle or touches the installation or the save, and adversarial
verifiers write nothing at all.

**The adversarial passes were again the highest-value agents.** They found: a
demonstrated data-destruction bug in the campaign store (one additive line in
another module silently deleted every stored record); five combat-deciding edits
to the adapter that left the whole suite green; a settlement path where the
adapter satisfied both of its own gates by talking to itself; the four
preconditions' two missing hazards; and a test that deleted the only thing that
changed before asserting nothing had changed — this project's own worst failure
mode, evidence fitted to the design.

## Keep the project lawful and reversible

Use only a licensed local copy for inspection. Keep originals untouched, work in
a separate mod folder, and distribute patches or independently authored files
rather than the original game files or assets.
