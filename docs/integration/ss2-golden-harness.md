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

The candidate module also preserves the mapped ranged attacker-shield chance
adjustment, critical-deflection threshold, native cosmetic debris rolls when a
piece is removed, the defender-facing knockback sign, the secondary-enchantment
type/primary-potency quirk, and the direction-23 stale `criticalhit`
requirement. Fully armour-absorbed damage does not enter the stamina-gain path.

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

1. Keep the installed SWF read-only and recheck its hash.
2. Prepare a controlled 1v1 state and an explicit sample tape without saving
   original assets or extracted code.
3. Record only numeric inputs, ordered call-site metadata, mutations, and
   semantic events.
4. Repeat the observation and compare it with the candidate.
5. If exact, copy the independently authored JSON to a future runtime-goldens
   directory, change its classification/provenance, and record observation date,
   capture-tool version, per-run observation IDs and digests, repetition count,
   and the capture-manifest SHA-256.
6. If it differs, retain both traces, correct the isolated candidate, and add a
   regression before touching team rules.

The next implementation stage is runtime promotion of the boundary, overflow,
critical, status, and result candidates, followed by the team-aware SS2 adapter
described in the [roadmap](../roadmap.md).
