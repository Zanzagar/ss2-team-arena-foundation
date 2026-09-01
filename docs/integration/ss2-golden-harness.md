# SS2 1v1 golden-harness checkpoint

Status: asset-free candidate harness for the licensed SS2 build in
[`ss2-build-fingerprint.json`](ss2-build-fingerprint.json), with its **first
four runtime-verified goldens promoted 2026-08-30**. Everything else it holds
is still a static candidate and does not claim runtime parity.

## Purpose and boundary

The harness converts the read-only AVM1 map into executable hypotheses without
changing `classicStyleRules` or the existing multiplayer engine. A candidate
only becomes a golden fixture after the same state, ordered random samples, and
outcome are observed repeatedly in the fingerprinted licensed build.

No SWF, extracted script, artwork, audio, screenshot, or install path is stored
in a fixture. The fixtures contain only independently authored numeric state,
structural identifiers, expected mutations, and the public build hash.

## Components

| File | Responsibility |
| --- | --- |
| `src/golden/ordered-rolls.js` | finite strict tape for inclusive `randomBetween` and AVM1 `RandomNumber` samples |
| `src/golden/run-1v1-fixture.js` | schema/build/provenance validation, input cloning, exact outcome comparison (including ordered mutations), and unused-roll rejection |
| `src/golden/ss2-attack-candidate.js` | isolated static reconstruction of physical chance, hit, critical, armour, stamina, enchantment, knockback, and result behavior |
| `src/golden/ss2-spell-candidate.js` | isolated static reconstruction of the spell ingress `magic_damage_character`, importing nothing from the physical module |
| `test/fixtures/ss2-1v1/` | JSON-only static candidates keyed to the exact SS2 fingerprint |
| `test/fixtures/ss2-1v1-golden/` | promoted goldens: `licensed-observation` provenance, cited observations, manifest digest |
| `test/observations/ss2-1v1/` | the observation records those goldens cite |
| `test/fixtures/ss2-1v1-divergences/` | preserved mismatch reports; evidence is never deleted |
| `test/ss2-fixture-files.js` | the two shared fixture lists, plus the on-disk guard that every committed fixture is registered in exactly one of them |
| `test/ss2-golden.test.js` | harness, candidate, edge-case, and result-latch verification |
| `test/ss2-attack-band-fixtures.test.js` | band contract: a campaign family's members may differ only in attack direction |
| `test/ss2-golden-fixtures.test.js` | the promoted goldens replay, validate, and still match their cited observations |
| `test/ss2-spell-candidate.test.js` | spell-ingress resolver, fixtures, and simulator round trip |

The capture, ingest, verification, and promotion modules that feed this
harness are listed in [the runtime-capture workflow](ss2-runtime-capture.md).

## Two candidate families

Both families share the 1v1 fixture schema, the tape, the validator, and the
promotion gate. They differ in which build function they reconstruct, which
resolver replays them, and which action identity their scenario carries.

| Family | Resolver | Registered in | Action identity | Fixtures |
| --- | --- | --- | --- | --- |
| physical attack (`checkattackroll` / `damagecharacter`) | `resolveSs2PhysicalAttackCandidate` (`src/golden/ss2-attack-candidate.js`) | `SS2_FIXTURE_FILES` | `scenario.attackDirection` | 29 |
| spell ingress (`magic_damage_character`) | `resolveSs2SpellDamageCandidate` (`src/golden/ss2-spell-candidate.js`) | `SS2_SPELL_FIXTURE_FILES` | `scenario.spellId` | 8 |

`test/ss2-fixture-files.js` asserts the two lists are disjoint and that their
union is exactly the directory: a new fixture must be registered in one list
and only one. The separation is deliberate — the golden, observation, and
simulator suites are hard-wired to the physical resolver and would reject a
spell fixture, and the two reconstructions must be able to diverge without
either silently rewriting the other. The spell module duplicates its helpers
rather than importing them for that reason.

A scenario carries exactly one action identity. The spell ingress has no
direction chain, so a spell fixture has no attack direction to carry, and a
physical fixture has no spell id.

## Fixture classification

Every fixture uses schema version 1 and the neutral kind `ss2-1v1-fixture`, plus:

- `build.fingerprintSchemaVersion = 1`;
- Steam build `24807725`;
- SS2 SHA-256
  `77CB545C2061AB41246251467A4EDF5926AB6FD1DDD95DC9527D7BA9C45BB8CA`;
- a JSON-safe 1v1 scenario containing `hero` and `villain`;
- a strict ordered sample list shaped as
  `{ label, source, min, max, value }`;
- one exact expected outcome projection.

`classification: "candidate"` requires `synthetic-static-map` provenance and
`runtimeVerified: false`. `classification: "golden"` requires
`licensed-observation` provenance and `runtimeVerified: true`. It must also carry
at least two unique observation IDs and digests plus a capture-manifest digest.
Static candidates never count as vanilla parity.

The tape rejects the wrong label, source, bounds, value range, missing sample,
or extra sample. `randomBetween(a,b)` is inclusive; `RandomNumber(n)` is
recorded as integer range 0 through `n - 1`.

## What "runtime-verified" means here

Four fixtures carry it, and only four. It is not a judgement — it is what
`src/golden/promote-1v1-golden.js` enforces before it will write into
`test/fixtures/ss2-1v1-golden/`:

| Requirement | Concretely |
| --- | --- |
| Same build | the installed SWF's SHA-256 rechecked before and after every session, both attestations recorded |
| Repeated | at least two observations whose ordered samples, mutation trace, events, result, and final state all match the candidate exactly |
| Independent | those observations come from at least two distinct capture sessions, with unique ids and unique digests |
| Attested | a capture manifest listing every session and observation, cited by its own SHA-256 |
| Replayable | the candidate resolver is re-run against the fixture at promotion time and on every test run |

The promoted set:

| Golden | Direction | Observations |
| --- | --- | --- |
| `golden-prisoner-normal-kill` | 7 | `obs-camp3`, `obs-fr1`, `obs-pq3` |
| `golden-prisoner-normal-kill-dir5` | 5 | `obs-cachecold`, `obs-cachewarm`, `obs-camp1`, `obs-fps480`, `obs-wfctl` |
| `golden-prisoner-normal-kill-dir6` | 6 | `obs-gold3`, `obs-camp2`, `obs-fps240`, `obs-fps960`, `obs-fr2`, `obs-par2`, `obs-par3`, `obs-pq1`, `obs-pq2` |
| `golden-prisoner-normal-kill-dir8` | 8 | `obs-camp4`, `obs-fr3`, `obs-iso2`, `obs-par1` |

**These four were re-promoted.** Each previously cited, as one of its two
"independent" observations, the record its own candidate had been transcribed
from — `obs-20260830-t1`, `obs-nav6`, `obs-diag` and `obs-20260830-u1`
respectively. A copy cannot fail to match its original, so those citations were
never evidence. The four now rest on every OTHER committed record that matches
them, which is why their evidence counts differ. Their scenario, samples and
expected blocks are byte-identical to what they were: this changed provenance,
not measurement.

All four are the same staged scenario — the tutorial prisoner fight in
`misc` mode, a lethal `normal_attack` — differing only in the attack direction
the game drew. What they verify is that whole path: the `attack_chances`
normal formula, the physical roll order, armour-free damage application, the
defeat gate's direction dispatch, and the pending result event with its
completion token. They do not verify armour, status flags, non-lethal
outcomes, tournament mode, or any other direction band. `candidateFlags` do
not carry over on promotion, so nothing flagged has been confirmed yet.

Staging requirements for everything still unverified are catalogued in
[the capture staging guide](ss2-capture-staging.md).

## Current candidate coverage

Physical candidates authored from the static map:

| Candidate | Static behavior exercised |
| --- | --- |
| `candidate-normal-threshold-hit` | equality at `diceroll == 100 - chance` is a hit |
| `candidate-normal-miss-roll-order` | a miss still consumes direction-specific damage and critical rolls, then stops |
| `candidate-armour-overflow-burning` | armour overflow, breastplate stamina gain, 66 removal boundary, and burning proc below potency threshold |
| `candidate-lethal-result` | death-state cleanup, hero win labels, pending result event, and matching animation-completion token |
| `candidate-armour-equality-quirk` | possible vanilla bug where exact armour equality also applies full original damage to hitpoints |
| `candidate-quick-threshold-profile` | quick direction (1–4) fixed `min_damage` profile, -20..20 critical sample, and no knockback roll |
| `candidate-power-critical-armour-bypass` | a surviving critical (sample 20) bypasses the armour-class branch: full damage to hitpoints while armour class is untouched |
| `candidate-taunt-charisma-floor` | taunt (direction 20) charisma damage below 1 floors to a 1–3 roll; dispatch taunt, damage path normal |
| `candidate-armour-removal-debris` | removal roll above 66 removes a selected piece before damage; the native cosmetic debris `RandomNumber` stream stays documented in the samples but is excluded from runtime matching (flagged for the deflection-threshold operand mix) |
| `candidate-grievous-knockback` | direction 30: `ceil(max_damage * 1.5)`, undeflectable grievous dispatch, no-op equipment removal (flagged), forced knockback with the above-80 animation threshold |
| `candidate-snipe-shield-boost` | the flagged attacker-shield ranged-chance adjustment, clamped at 99, with a threshold hit at diceroll 1 |
| `candidate-deflection-threshold-discriminator` | deflection roll 85 against mapped threshold 87 (helmet 10, greaves 2): the surviving critical discriminates the flagged operand mix from its rival readings at runtime |
| `candidate-frozen-enchantment-proc` | enchantment type 3 applies frozen below the potency threshold |
| `candidate-bash-inherited-critical` | bash (23) at its chance threshold inheriting the transient criticalhit register — first fixture exercising `scenario.transient` end to end |
| `candidate-bombard-threshold` | bombard (21) threshold hit with its critical-before-damage roll order and no knockback roll |
| `candidate-duel-absorbed-normal-hit` | authored from the first live capture (2026-08-30): the operator's real gladiator's fully armour-absorbed normal attack in a first-blood duel; the resolver reproduces the observed trace exactly |
| `candidate-duel-firstblood-normal-kill` | authored from the third live capture: a first-blood duel kill (every tape entry injected); backed by the first committed runtime observation (`test/observations/ss2-1v1/obs-20260830-e1.json`), which matches it formally |

Prisoner-kill bands — one staged scenario per band, one candidate per
direction the dispatcher can draw. A band is a campaign *family*: its members
differ only in `scenario.attackDirection`, which
`test/ss2-attack-band-fixtures.test.js` holds them to, because the campaign
injects one tape per family and only learns the direction after reading the
trace.

| Band | Fixtures | Roll order the band pins |
| --- | --- | --- |
| `candidate-prisoner-quick-kill-dir1..4` | 4 | `min_damage`, a −20..20 critical sample, no knockback roll |
| `candidate-prisoner-normal-kill{,-dir5,-dir6,-dir8}` | 4 | `randomBetween(min, max)` damage then a 1–20 critical sample — **all four promoted** |
| `candidate-prisoner-power-kill-dir9..12` | 4 | `max_damage`, a 5–20 critical sample |

Spell-ingress candidates, all replayed through
`resolveSs2SpellDamageCandidate`:

| Candidate | Static behavior exercised |
| --- | --- |
| `candidate-spell-fireball-armour-absorbed` | fireball's caller roll, armour fully absorbing the hit, and a duel-mode absorbed hit *not* opening the defeat gate |
| `candidate-spell-breastplate-stamina-absorbed` | the unconditional breastplate stamina join on a fully absorbed spell hit, villain casting |
| `candidate-spell-armour-equality-quirk` | the same exact-armour-equality quirk as the physical path: equality skips the overflow rewrite, so full damage also reaches hitpoints |
| `candidate-spell-armour-overflow-remainder` | strict overflow by exactly 1, with `armourclass` left negative until `check_stats` clamps it |
| `candidate-spell-armour-depleted-full-damage` | already-depleted armour: the whole rolled damage reaches hitpoints |
| `candidate-spell-raw-fractional-damage` | the ingress applies the raw `damage` argument with **no** `Math.ceil` — the ceil is display-only (flagged, and its fractional staged armour is flagged synthetic) |
| `candidate-spell-first-blood-duel` | the first-blood duel gate reached through the spell ingress: `yield`, not `slain` |
| `candidate-spell-lethal-slain` | the ingress has no direction chain, so a non-duel kill always dispatches `slain` |

Scenarios may carry an optional `fightMode` (`tournament`, `duel`, `misc`;
absent means tournament), and result events carry the byte-verified
`reason` (`elimination` or `first-blood`) and `howDied` (`slain`, `yield`,
`taunt`, `arrow`, `grievous`) fields derived from the mapped defeat gate.

The physical candidate module also preserves the mapped ranged attacker-shield
chance adjustment, critical-deflection threshold, native cosmetic debris rolls
when a piece is removed, the defender-facing knockback sign, the
secondary-enchantment type/primary-potency quirk, and the direction-23 stale
`criticalhit` requirement. The breastplate stamina block is an unconditional
join (byte-verified 2026-08-30): fully armour-absorbed damage still grants
`ceil(breastplate * fullDamage / 100)` stamina, corrected from the earlier
static reading that gated it on hitpoint-applicable damage. The spell module
carries the same join independently, plus the unconditional
`psyche_up = 1` at its own armour/hitpoint join.

## Statically reconstructed physical RNG order

1. Hit diceroll.
2. Direction-specific damage and/or critical samples, in bytecode order.
3. On hit only, critical-deflection roll.
4. Armour-removal chance; if removal succeeds, piece selection followed by the
   debris `RandomNumber` calls that share vanilla's stream.
5. Direction-dependent knockback (`randosmash`) roll.
6. Weapon-enchantment potency roll.

Death/result mutation occurs before the final knockback and enchantment calls
in the mapped function. A miss consumes steps 1–2 only. Expected outcomes also
carry a numbered JSON-pointer mutation trace, so a fixture cannot pass with the
right final values in the wrong mutation order.

The spell ingress has no RNG order of its own: `magic_damage_character`
contains no `randomBetween` call and no `RandomNumber` opcode, so a spell
fixture's single sample is the *caller's* damage roll and the ingress consumes
no tape at all.

A lethal action emits a pending result with a non-empty completion token. The
one-shot bridge calls campaign settlement only after the UI supplies a matching
`battle-result-animation-complete` acknowledgement; duplicate acknowledgements
are ignored.

## Promotion procedure

The whole procedure is tooled and has been executed end to end: the four
`golden-prisoner-normal-kill*` fixtures came through it, and
`run-campaign.ps1` now runs the loop unattended. See
[the runtime-capture workflow](ss2-runtime-capture.md) for the session
protocol, trace grammar, campaign automation, and CLI.

1. Keep the installed SWF read-only and recheck its hash
   (`tools/capture-session.mjs verify-install`) before and after every
   session; both attestations are required record fields.
2. Prepare a controlled 1v1 state and an explicit sample tape without saving
   original assets or extracted code.
3. Record only numeric inputs, ordered call-site metadata, mutations, and
   semantic events (the raw JSONL trace stays in ignored `captures/`).
4. Normalize with `capture-session.mjs ingest`, then compare with the
   candidate via `capture-session.mjs verify`; repeat in an independent
   session.
5. If exact at least twice across at least two sessions,
   `capture-session.mjs promote` writes the golden into
   `test/fixtures/ss2-1v1-golden/` with `licensed-observation` provenance,
   observation date, capture-tool version, per-run observation IDs and
   digests, repetition count, and the capture-manifest SHA-256 — all enforced
   by `src/golden/promote-1v1-golden.js`.
6. If it differs, the divergence report is preserved under
   `test/fixtures/ss2-1v1-divergences/`; correct the isolated candidate and
   add a regression before touching team rules.

Step 2 is the part that is no longer uniform in cost. The attack direction is
observed rather than forced, so a whole family is covered by looping step 1–5
until every direction appears; but a scenario the staged fight cannot produce
at all — different armour, a bow, a tournament — is a staging problem before
it is a capture problem.

## Where a promoted rule set is headed

The destination is the shared team resolver's rule-set seam,
[`src/team/rule-set.js`](../../src/team/rule-set.js). That seam exists now and
is enforced: `assertTeamRuleSet` is the only place that decides whether a rule
set may call itself `runtime-verified`, and it refuses the claim unless the
rule set declares `runtimeVerified: true`, pins the licensed build's SHA-256,
and cites at least one promoted golden fixture id in
`provenance.goldenFixtureIds`. A placeholder must declare
`runtimeVerified: false` and may not cite goldens at all.

**Nothing measured has been dropped into that seam.** `classicStyleRules`
remains the only rule set and is still the documented placeholder, with its
formulas untouched. Four promoted goldens cover one direction band of one
staged scenario — enough to satisfy the gate's *form*, nowhere near enough to
be a rule set. A `describeTeamRuleSet` summary is what UI, logs, and save
records should carry so placeholder behaviour is never mistaken for measured
behaviour.

The next implementation stage is breadth of evidence rather than feasibility:
run the power and quick bands through the campaign, then the scenarios that
need real staging (armour, statuses, non-lethal outcomes, tournament mode),
and only then assemble a measured rule set for the seam and the team-aware SS2
adapter described in the [roadmap](../roadmap.md).
