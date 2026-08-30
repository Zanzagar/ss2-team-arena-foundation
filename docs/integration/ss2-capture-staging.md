# SS2 capture staging guide

How to stage each committed candidate's scenario in the licensed build for a
controlled capture session (protocol in
[the runtime-capture workflow](ss2-runtime-capture.md)). Every staged value
must be reached through normal play or supported game state — the installed
build is never modified, and `battlevalues` rederives derived stats every
phase, so only derivable states are stageable.

## Derivation constraints (from the verified `battlevalues` map)

| Staged field | Constraint |
| --- | --- |
| `min_damage` / `max_damage` | `round(strength * 2) + weapon_min/max` |
| `hitpointsmax` | `herolevel * 10 + vitality * 20` |
| `staminamax` | `100 + stamina * 10` |
| `armourclass_max` | sum of `round(piece * multiplier)` over equipped pieces (breastplate 16, helmet 10, shinguard 6, greaves 3, shoulderguard 8, gauntlet 5, boot 2, shield 12; shield counts 0 while `using_bow`) |
| `armourclass < armourclass_max` | reachable only mid-battle (take armour damage first; refills happen while `battle_started` is false) |

Common implied builds in the committed fixtures:

- strength 5 with `min 12 / max 20`, or strength 9 with `min 20 / max 28`:
  a 2/10-damage weapon in both cases.
- `staminamax 100`: stamina stat 0.
- `hitpointsmax 40` = level 2 / vitality 1; `50` = level 3 / vitality 1 (or
  level 1 / vitality 2); `60` = level 2 / vitality 2 (or level 4 / vitality 1).

## Villain-side staging

The operator cannot freely set opponent stats. Two supported routes:

1. Find an opponent whose stats match a committed candidate's villain block
   exactly (attack/defence/vitality/pieces).
2. Capture against whatever opponent is available and author a **new**
   candidate from the observed staged state: ingest records the observed
   values, the mismatch with the intended fixture surfaces as an explicit
   scenario divergence, and a candidate with the observed scenario can be
   generated through the resolver and verified on the next session. The
   pipeline is built for this direction too — evidence first, fixture second.

## Per-fixture staging notes

| Fixture | Direction/action | Staging notes | Open questions |
| --- | --- | --- | --- |
| `candidate-normal-threshold-hit` | 5–8 (normal attack) | no armour either side; villain 40 hp | which of 5–8 fires is an opcode roll — repeat until the staged direction appears |
| `candidate-normal-miss-roll-order` | 5–8 | same staging; requires a missing diceroll | passive capture only for the miss roll unless injected |
| `candidate-armour-overflow-burning` | 5–8 | hero: enchanted weapon type 2 potency 5; villain: breastplate 1, then take 4 armour damage first (12 of 16 remaining) | staging mid-battle armour costs one extra uncontrolled exchange |
| `candidate-armour-equality-quirk` | 5–8 | villain boot 6 (armour 12), damage roll must equal 12 | equality needs the injected tape |
| `candidate-lethal-result` | 5–8 | villain at 12 hp before the action | reduce hp with prior exchanges |
| `candidate-quick-threshold-profile` | 1–4 (quick attack) | no armour; threshold diceroll 34 | quick sub-direction is an opcode roll |
| `candidate-power-critical-armour-bypass` | 9–12 (power attack) | villain breastplate 1 (armour 16); critical sample must survive at 20 | power sub-direction is an opcode roll |
| `candidate-taunt-charisma-floor` | 20 (taunt) | hero charisma 5 vs villain charisma 30 | finding a charisma-30 opponent; floor roll needs the tape |
| `candidate-armour-removal-debris` | 5–8 | villain helmet 1 + shield 2 (armour 34) | debris opcode rolls are unobservable (excluded from matching) |
| `candidate-grievous-knockback` | 30 (grievous) | hero strength 9, 2/10 weapon; villain breastplate 1, 50 hp | which player action produces direction 30 is not yet mapped — identify it before staging |
| `candidate-snipe-shield-boost` | 22 (snipe) | hero bow drawn with shield 10 equipped (shield contributes no armour while `using_bow`) | ammunition and range staging; confirm shield stays equipped while sniping |
| `candidate-deflection-threshold-discriminator` | 5–8 | villain helmet 10 + greaves 2 (armour 106); needs injected critical 20 and deflection 85 | the roll between rival thresholds (83 < 85 < 87) is the whole point — inject exactly |
| `candidate-frozen-enchantment-proc` | 5–8 | hero weapon enchantment type 3 potency 5 | none |
| `candidate-bash-inherited-critical` | 23 (shove/bash) | a prior action must leave `criticalhit` at 20 (e.g. an immediately preceding power attack) | confirm which UI action maps to direction 23 and that the transient survives to it |
| `candidate-bombard-threshold` | 21 (bombard) | hero bow drawn; no armour either side | bombard left/right selection and range staging |

## Wrapper launch values

`node tools/capture-session.mjs tape --fixture <candidate.json>` prints the
`tape` FlashVars string for the wrapper (randomBetween samples only — opcode
debris rolls are neither injectable nor recordable). The other launch values
(ids, timestamps, `hashBefore`) come from the session protocol; the
post-session hash attestation is stamped by `ingest`, never at launch.
