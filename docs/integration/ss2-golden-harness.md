# SS2 1v1 golden-harness checkpoint

Status: asset-free static candidate harness for the licensed SS2 build in
[`ss2-build-fingerprint.json`](ss2-build-fingerprint.json). It does not yet
claim runtime parity.

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
| `test/fixtures/ss2-1v1/` | JSON-only static candidates keyed to the exact SS2 fingerprint |
| `test/ss2-golden.test.js` | harness, candidate, edge-case, and result-latch verification |

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

## Current candidate coverage

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

The candidate module also preserves the mapped ranged attacker-shield chance
adjustment, critical-deflection threshold, native cosmetic debris rolls when a
piece is removed, the defender-facing knockback sign, the secondary-enchantment
type/primary-potency quirk, and the direction-23 stale `criticalhit`
requirement. The breastplate stamina block is an unconditional join
(byte-verified 2026-08-30): fully armour-absorbed damage still grants
`ceil(breastplate * fullDamage / 100)` stamina, corrected from the earlier
static reading that gated it on hitpoint-applicable damage.

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

A lethal action emits a pending result with a non-empty completion token. The
one-shot bridge calls campaign settlement only after the UI supplies a matching
`battle-result-animation-complete` acknowledgement; duplicate acknowledgements
are ignored.

## Promotion procedure

Steps 4–6 below are fully tooled, and the whole procedure becomes executable
end to end once a raw capture trace exists; producing that trace (steps 2–3)
is still blocked on an approved local AVM1 player and the instrumentation
wrapper. See [the runtime-capture workflow](ss2-runtime-capture.md) for the
session protocol, trace grammar, and CLI.

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

The next implementation stage is running the first controlled captures for the
boundary, overflow, critical, status, and result candidates, followed by the
team-aware SS2 adapter described in the [roadmap](../roadmap.md).
