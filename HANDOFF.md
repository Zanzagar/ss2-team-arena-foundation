# Transfer handoff — SS2 Team Arena Foundation

## Capture campaign state (2026-08-30, end of session)

Read this whole section before touching anything. 22 goldens, 429 tests, a
capture round takes ~14 seconds, and the next action on the critical path is
the first one this project has ever taken that can change the licensed save.

### What is promoted

| Family | Coverage | How the candidates were authored |
| --- | --- | --- |
| `golden-prisoner-quick-kill-dir1..4` | complete | from the map, before any quick session |
| `golden-prisoner-normal-kill`, `-dir5/6/8` | complete | **from captures** — weakest evidence, see below |
| `golden-prisoner-power-kill-dir9..12` | complete | from the map, before any power session |
| `golden-probe-*` (10, five pairs) | complete | from the map; these **measure** |

All twelve melee attack directions are runtime-verified, from one staged
fight: a level-1 gladiator against the tutorial prisoner, both unarmoured,
`fight_mode` `misc`.

**Prefer the power and quick bands as the model.** Their candidates were
derived from the battle map by an author with no access to any capture and
committed before a single session of that band ran; the build then matched
them exactly. The normal band's candidates were authored *from* captures, so
each one's first observation confirmed nothing — it is what the candidate was
fitted to. Never author a candidate from a capture.

### What the probes measured (the important part)

A probe pair differs in exactly one injected value and is predicted to differ
in a channel the capture genuinely observes. Twenty sessions produced:

- **`rollneeded` bracketed to a single integer per band** — quick misses at 26
  and hits at 27, normal 43/44, power 62/63, all matching
  `round(ratio * 100 * K)`. Because 44 hits while 43 misses, the comparison is
  `diceroll >= rollneeded`, not `>`. An audit strengthened this: a strict
  reading is impossible under *every* rounding convention and *every* ratio,
  and the same six observations independently confirm both the
  `(attack+9)/(defence+9)` ratio and `Math.round` over `ceil`. One unstated
  premise remains — it assumes `rollneeded = 100 - chance`, which only the
  map's byte reading settles.
- **The critical-deflection threshold is 100, inclusive.** Both arms ran at
  hit-roll 50, direction 5; deflection roll 99 dispatches `critical`, 100
  dispatches `normal`, everything else byte-identical. Note this measures the
  constant term and the boundary only — with helmet and greaves at 0 the
  formula yields 100 for any coefficients. The armoured fixtures attack the
  operand mix.
- **The armour-selection sample is consumed before the equipped test** —
  removal roll 66 gives 7 draws, 67 gives 8. Weakest of the three: it confirms
  something the map already asserted flatly, and the extra draw's label and
  position are echoed, so what is measured is "one extra draw, no state
  change".

Unplanned findings: a miss consumes only pre-dispatch draws (3 normal, 2
power/quick), so the runtime does not short-circuit on the roll; and the quick
band draws no knockback roll while normal and power do, independently
confirming the directions 5–12 knockback gate.

### What a capture actually proves — read before trusting a golden

Full account in `docs/integration/ss2-runtime-capture.md` under *What a match
actually establishes*. Short version:

- **Observed:** the ordered mutation trace, the semantic events (including
  hit/miss and the dispatched method), the final state, `attack_direction`,
  `fight_mode`, and the **number** of draws.
- **Echoed from the candidate, not observed:** every roll line's label,
  bounds, value and call site. The wrapper serves its tape from a tap on
  `Math.random`, which takes no arguments.
- **Never compared:** `expected.calculation` and `expected.mutation`.
- The simulated-evidence rejection is one editable string in the trace meta
  line, and session independence is two operator-supplied strings.

### Non-negotiable rules (each learned the hard way)

- Licensed SWFs are read-only and hash-verified before and after every
  capture. Never copy, export or commit game assets or extracted scripts.
- **Never shortcut the game's own frames.** Jumping past the prologue tripped
  the game's character-tampering screen. The prologue is construction — it
  skins the hero and builds the villain. Locking the frame rate is fine; every
  frame still runs.
- A candidate becomes golden ONLY via >=2 matching observations from >=2
  sessions. Never hand-write a golden, observation or manifest.
- **Derive candidates from the battle map, never from a capture.**
- `tools\runtime-capture\validate-vehicle.ps1` must PASS after ANY wrapper edit.
- Use `git commit -F <file>` for any message containing quotes.
- **Snapshot before every session, not only levelled ones** — see the save
  correction below.

### Two corrections made late, both worth knowing

**The prisoner route is not save-neutral.** An earlier claim (mine) said it
never reaches a flush site. Wrong: `refresh_gladiators` flushes
unconditionally and is called from root frames 35 and 84, which the navigator
passes through at navSteps 0 and 1. Every capture has flushed the store twice.
What is true and was *measured*: the write is a near-identity rewrite, so
`ss2_data.sol` stays byte-identical (679 bytes, `6A06E9E8…`) while its mtime
moves. The data is safe; the route avoiding the flush is not why. The same
function has a **reset branch** that blanks every character slot when the
gladiator count reads `undefined`/`0`/`NaN` — almost certainly the clobbering
the launcher warns about.

**Seven goldens cited a manifest that did not exist.** The campaign driver
named manifests by attack direction, six probe arms share direction 5, and
they overwrote one another in one settle loop. Fixed (named by candidate,
`overwrite: false`), all ten recovered by brute-forcing `createdAt` so the
goldens stayed byte-identical, and the coverage test now walks every golden
instead of one family's four.

---

## Next steps, in order

### 1. Fold four preconditions into the navigator, THEN level a gladiator

This is the critical path and the first save-mutating action. An adversarial
audit of `docs/integration/ss2-arena-route.md` found four things that would
have bitten. Do not start without them:

- **Bound the session by wall clock.** `time_of_day` advances via
  `setInterval(day_night_cycle, 1500)` — 1.5s wall clock — during everything
  except the battle itself. At `>= 200` (about 4m24s of non-battle time from
  24) the game enters a **special event** that permanently mutates charisma,
  magicka or gold and then saves it through town square. Re-assert
  `_global.time_of_day = 24` at each town-square rest (an in-vocabulary write
  the game's own buttons make), and log it.
- **Hard-abort on root frames 160–169.** Never let a generic advance step
  press `special_button1`/`special_button2`.
- **Gate the level-up press on `_root.statpoints`, not
  `game.hero.statpoints`.** Button 2283 reads the *display mirror*, maintained
  by an `enterFrame` clip action. Pressing it in the same execution slot as
  the four decrements takes the refusal arm and parks forever. Allow >=1 frame.
- **The frame-113 timeout must abort and log, never re-issue
  `gotoAndPlay("daybreak")`.** Re-entering the span mid-way retains the
  existing `day_night` clip and can flip its parity to a permanent hang.

Spend all four level-up points into **vitality** every time. An audit traced
all 34 `vitality` references: its only derivation is
`hitpointsmax = herolevel*10 + vitality*20`. It touches no input to
`attack_chances`, the damage roll, the deflection threshold or the controller
selector — so a levelled gladiator stays comparable with the 22 goldens.

Level 4 is the tournament gate (`tournament_level_required` 4 for a fresh
gladiator).

### 2. Capture the tournament rank-1 bout, not a duel and not a generated rank

Two agents converged on this independently, and it corrects an earlier plan.

- **Duels are not a capture target at all.** `randomise_gladiator` generates
  the opponent per entry using `RandomNumber` **opcode** draws for appearance,
  stat distribution and a matched armour suit. Opcode draws can be neither
  injected nor recorded, so a duel opponent cannot be reproduced even with a
  full tape.
- **Tournament ranks 2..N are regenerated on every fresh launch**
  (`tournament_in_progress != true`), and matching compares the full final-state
  projection of **both** sides — so a generated opponent can never clear the
  two-session gate.
- **Rank 1 is built by `unleash_hell(tournament_number)` from hard-coded DNA
  literals — zero villain-side RNG.** That is the one reproducible armoured
  opponent, at the cost of winning the prior bouts in the same launch.

### 3. Capture the families already authored and waiting

- `candidate-tournament-*` (3) — the defeat gate's first-blood term, never
  exercised. Outside tournament mode any hit reaching hitpoints ends the fight.
- `candidate-armoured-*` (5) — armour absorption, the equality quirk, strict
  overflow, a **real** deflection threshold (helmet 6 / greaves 2 → 93, and
  the 92/93 bracket excludes every rival operand reading), and `remove_armour`
  destroying a specific piece.
- Pass `-WatchFields` with the per-piece `_defence` names. The wrapper's
  default list omits them and ingest refuses a trace missing a field the
  fixture stages. `watchFields` is now additive; leaving it empty reproduces
  every existing golden exactly.
- The ~5 legacy candidates needing a non-lethal hit need tournament *staging*,
  not new fixtures.

### 4. The spell family has never been captured

The wrapper emits `spell_id` and the pipeline projects it, but no spell
session has run. Before one can: the wrapper's `magic_damage_character` hook
is registered with the `damagecharacter` label and emits no `magic-damage`
event (`ss2-capture-wrapper.as`, the `registerSlot` for it). It needs the
right hook label and an event carrying the `damage_method` argument.

---

## Known defects and open items

**Evidence chain**
- `overdraw` and `launchNonce` are validated at ingest then **discarded** —
  neither reaches the observation record, so a reviewer holding only the repo
  cannot verify the over-draw guard was satisfied. `overdraw` is also optional
  at ingest; a trace without it silently carries no assurance. No test covers
  either. Fix: make it mandatory for `injected-tape-runtime`, carry both into
  `capture.*`, assert nonce uniqueness in the promotion gate.
- **69 divergence reports were deleted as direction-lottery noise, and that
  was a misjudgement.** An audit re-read all 89 raw probe traces and found
  every measurement replicates across all twelve directions with zero
  exceptions — far stronger than the two-session gate. The raw traces survive
  under ignored `captures/` (155 sessions). Regenerate and commit them, and
  state per-measurement replication counts.
- Ingest drops no-op writes, so a candidate omitting the unconditional
  breastplate-stamina write would still match. Observed evidence discarded.

**Tooling**
- `-SaveDirectory` is **not usable**. Its protective half is verified (a
  session with its own store provably cannot touch the real save), but Ruffle
  writes a fresh empty store instead of reading the seeded copy — confirmed the
  seed lands at exactly the right path, byte-identical. Parallel capture is
  blocked on understanding that.
- `campaign.mjs loadFamily` matches `fixtureId.startsWith("candidate-" + f)`,
  so `--family armour` also sweeps `candidate-armoured-*`. Should require a
  `-`-delimited segment boundary.
- `campaign.mjs` indexes families by `scenario.attackDirection`, so a spell
  family would collide all members on `undefined`.
- The ~7s fixed setup per round (hash verify, FFDec compile, Ruffle start) is
  now ~half a round. Hoisting the wrapper compile out of the campaign loop is
  the easy win.

**Adapter follow-ups from the seam widening**
- `toCanonicalCombatantSource` should emit `resources` from `armourclass`,
  `staminaleft`, `ammo_left`, `charisma`, the armour piece ratings and the
  enchantment fields, **on both sides** — the resolver refuses a write to an
  undeclared resource by design.
- `vanillaWritesForResolvedAction` needs a `RESOURCE` branch so writes reach
  `armourclass`.
- `createEffectRecordingRuleSet` is now redundant; use `lastResolvedAction`.
- **A drawn battle cannot settle through the bridge.** The resolver produces
  and settles draws; vanilla dispatches only `combatwon`/`combatlost`, so a
  draw has no arena label and `reportArenaLabel` is the only thing that arms
  the final gate. A draw's acknowledgement should be the completed death
  animations with no arena transition. The resolver side is pinned as a
  contract to code against.

**Docs**
- `docs/ss2-adapter-contract.md` "canonical-shape gaps" is partly stale.
- `docs/roadmap.md` has stale rows (Stage 4 arena layout, campaign save).
- `ss2-runtime-capture.md`: the trace grammar's `end` row does not document
  `overdraw`/`launchNonce`; the `var` row omits `spell_id`; the `event` row
  omits `magic-damage`; §Reading divergent traces still says an over-draw is
  invisible.
- An unresolved tension worth settling: `ss2-runtime-capture.md` says
  `getphase` accepts only the current controller's labels, while the battle map
  reads the phase machine as never consulting the controller frame. If the map
  is right, the autopilot's gate is stricter than the build — safe, but
  untested. One round issuing a label to a controller that does not offer it
  settles it.

---

## Working agreement for parallel agents

Nine ran concurrently this session and it worked, on these rules: exclusive
file ownership per agent, no agent runs a state-mutating git command (one
owner commits), no agent launches Ruffle or touches the installation or the
save, and adversarial verifiers write nothing at all. The two adversarial
passes were the highest-value agents of the session — both found real defects
in committed work, including two of mine.

A separate design track is researching endless progression in
`docs/design/endless-progression-brief.md`. It is deliberately disjoint:
design must never flow into candidate authoring, or a capture confirms a fit
rather than a prediction.

## On the PC with Swords & Sandals II installed

1. Preferred: copy `ss2-team-arena-foundation.bundle` to the new PC and run
   `git clone ss2-team-arena-foundation.bundle ss2-team-arena-foundation`.
   This preserves the complete commit history.
2. Alternative: extract the transfer ZIP into a new local Codex project folder.
3. Open that folder as the project, then continue this Codex task and say that
   the licensed game is installed.
4. Give Codex permission to read the game's installation directory when asked.
   Do not copy, upload, or redistribute the original SWF or assets.
5. Run `npm test` from this folder to confirm the transferred foundation.

## What Codex should inspect first

Locate the licensed Swords & Sandals Classic Collection installation and identify
the S&S II SWF and any S&S II mod folders. The adapter work starts by mapping
the vanilla battle entry point, player/opponent state objects, random-number
generation, combat formulas, result callback, and battle movie clips.

## Scope already completed

**The combat core is `src/team/`, not `src/engine.js`.** One shared resolver
serves 1v1, 2v2 and 3v3 — there is no second code path for 1v1 — with team
elimination, AI fill, controller identity independent of combatant identity,
and a campaign settlement that fires exactly once, after a whole team is down
*and* the final animation is acknowledged. `src/engine.js` is now a
compatibility facade over it, preserving the historical deterministic replay,
wire snapshots and state hashes; that equivalence was checked across 200
blueprints against the pre-refactor engine, not assumed.

Formulas are injected through the rule-set seam (`src/team/rule-set.js`), and
the seam is gated: a rule set may only claim `runtime-verified` if it pins the
build SHA-256 *and* cites a promoted golden. `classicStyleRules` is unchanged,
byte-identical to its original formulas, and still the only rule set —
explicitly a placeholder. **Nothing measured has been dropped into the seam
yet.** Eight goldens satisfy the gate's form, not its substance.

`src/adapter/` is the SS2 seam: it converts vanilla combatant state to
canonical state and back, dispatches presentation, and produces the result
acknowledgement — and it decides no combat, which is enforced by shape rather
than convention (every vanilla write mirrors the resolver's post-action
projection, never `before - effect`). It reconciles 3v3 with a two-sided
vanilla surface by treating hero/villain as a *binding* rebound per action
rather than a roster.

There are two isolated candidate families: the physical attack ingress
(`src/golden/ss2-attack-candidate.js`) and the spell ingress
(`src/golden/ss2-spell-candidate.js`, byte-verified from
`magic_damage_character`), registered separately and asserted disjoint. The
whole capture pipeline — digested observation records, raw-trace ingestion,
the two-independent-session promotion gate, preserved divergence reports, a
never-promotable reference simulator, and the campaign driver — is in place
and covered by tests. The delivery target remains 2v2 and 3v3 cooperative
campaign support; see `docs/roadmap.md`.

A separate design track is researching endless progression in
`docs/design/endless-progression-brief.md`. It is deliberately disjoint from
this work: design must never flow into candidate authoring, or a capture
confirms a fit rather than a prediction.

## Keep the project lawful and reversible

Use only a licensed local copy for inspection. Keep originals untouched, work in
a separate mod folder, and distribute patches or independently authored files
rather than the original game files or assets.
