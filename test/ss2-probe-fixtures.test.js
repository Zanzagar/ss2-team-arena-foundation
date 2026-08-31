/**
 * Experimental-design contract for the `candidate-probe-*` fixture pairs.
 *
 * Why this file exists
 * --------------------
 * The capture wrapper serves an injected tape from a tap on `Math.random`,
 * which receives no arguments. Every emitted roll line's `label`, `min`, `max`,
 * `value` and `callSite` are therefore copied from the tape, and the tape is
 * generated from the fixture under test: the sample comparison in
 * `matchSs2ObservationToFixture` compares a fixture against a copy of itself
 * and can only fail on the *count* of draws. What a capture genuinely observes
 * is the ordered mutation trace, the semantic events (hit vs miss, and which
 * `defender_hurt` method was dispatched), the result event, the final state,
 * and how many draws were taken.
 *
 * A "probe" is therefore a PAIR of fixtures, staged identically down to the
 * attack direction, that differ in exactly one injected value and that are
 * predicted to differ in one of those genuinely observed channels. A fixture
 * whose arms differ only in echoed sample values measures nothing: repeating
 * its capture adds sessions, not information.
 *
 * This suite is the guard against a later "simplification" that quietly turns
 * a probe back into a non-probe. For every pair it asserts:
 *   - the two arms stage the identical fight and the identical direction;
 *   - their tapes differ in exactly one declared way;
 *   - and the exact set of OBSERVED channels that separates them is the
 *     declared set, with echoed sample labels/bounds/values excluded from the
 *     comparison entirely.
 *
 * Every number asserted below is hand-derived from
 * docs/integration/ss2-battle-map.md and cited at its assertion. None of it was
 * read back out of the resolver, and none of it came from a capture: these are
 * predictions a later licensed capture will confirm or refute.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveExpectedEventsFromSs2Fixture,
  isCosmeticDebrisSample
} from "../src/golden/observation.js";
import { runSs2OneVsOneGoldenFixture } from "../src/golden/run-1v1-fixture.js";
import { resolveSs2PhysicalAttackCandidate } from "../src/golden/ss2-attack-candidate.js";

import { loadSs2Fixtures } from "./ss2-fixture-files.js";

const fixtures = await loadSs2Fixtures();
const byId = new Map(fixtures.map((fixture) => [fixture.fixtureId, fixture]));

const canonical = (value) => JSON.stringify(value, (_key, item) => {
  if (item === null || typeof item !== "object" || Array.isArray(item)) return item;
  return Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]));
});
const sameJson = (left, right) => canonical(left) === canonical(right);

/** The staged fight every probe must reuse verbatim, as the campaign runs it. */
const STAGING = byId.get("candidate-prisoner-normal-kill-dir5");

/**
 * Exactly the channels a runtime capture genuinely observes, with the echoed
 * tape deliberately reduced to its length.
 *
 * `matchSs2ObservationToFixture` compares scenario, samples, mutationTrace
 * (reasons stripped — they are wrapper hook attributions), events, resultEvent
 * and finalState. Of those, `samples` is an echo of the injected tape, so only
 * its length carries information; scenario is staged input, identical across a
 * pair by construction. What remains is what a probe can actually measure.
 */
function observedChannels(fixture) {
  return {
    events: deriveExpectedEventsFromSs2Fixture(fixture),
    mutationTrace: fixture.expected.mutationTrace.map(({ sequence, path, before, after }) => ({
      sequence,
      path,
      before,
      after
    })),
    resultEvent: fixture.expected.resultEvent,
    finalState: fixture.expected.state,
    drawCount: fixture.samples.filter((sample) => !isCosmeticDebrisSample(sample)).length
  };
}

function differingObservedChannels(left, right) {
  const a = observedChannels(left);
  const b = observedChannels(right);
  return Object.keys(a).filter((channel) => !sameJson(a[channel], b[channel]));
}

const sampleByLabel = (fixture, label) => fixture.samples.find((sample) => sample.label === label) ?? null;
const labels = (fixture) => fixture.samples.map((sample) => sample.label);

/**
 * The probe catalogue.
 *
 * `injected` names the single tape slot whose value differs between the arms;
 * `values` are its two settings; `channels` is the exact set of observed
 * channels the pair is predicted to separate. A pair with an empty `channels`
 * set would not be a probe at all, and the table forbids one.
 */
const PROBES = [
  {
    name: "normal-band rollneeded bracket",
    arms: ["candidate-probe-normal-rollneeded-miss", "candidate-probe-normal-rollneeded-hit"],
    injected: "hit-roll",
    values: [43, 44],
    channels: ["events", "mutationTrace", "resultEvent", "finalState", "drawCount"]
  },
  {
    name: "power-band rollneeded bracket",
    arms: ["candidate-probe-power-rollneeded-miss", "candidate-probe-power-rollneeded-hit"],
    injected: "hit-roll",
    values: [62, 63],
    channels: ["events", "mutationTrace", "resultEvent", "finalState", "drawCount"]
  },
  {
    name: "quick-band rollneeded bracket",
    arms: ["candidate-probe-quick-rollneeded-miss", "candidate-probe-quick-rollneeded-hit"],
    injected: "hit-roll",
    values: [26, 27],
    channels: ["events", "mutationTrace", "resultEvent", "finalState", "drawCount"]
  },
  {
    name: "critical-deflection threshold bracket",
    arms: [
      "candidate-probe-deflection-threshold-critical",
      "candidate-probe-deflection-threshold-cleared"
    ],
    injected: "critical-deflection-roll",
    values: [99, 100],
    // The sharpest pair in the set: identical mutations, identical final state,
    // identical draw count. Only the dispatched defender_hurt method moves.
    channels: ["events"]
  },
  {
    name: "armour-removal gate bracket",
    arms: [
      "candidate-probe-armour-removal-gate-below",
      "candidate-probe-armour-removal-gate-above"
    ],
    injected: "armour-removal-roll",
    values: [66, 67],
    // The mirror image: identical events, identical mutations, identical final
    // state. Only the number of draws moves, because remove_armour draws its
    // group selection before testing whether the piece is even equipped.
    channels: ["drawCount"]
  }
];

test("every probe fixture is registered and replays exactly through the physical resolver", () => {
  const registered = PROBES.flatMap((probe) => probe.arms);
  assert.equal(new Set(registered).size, registered.length, "a probe arm may appear in only one pair");
  const onDisk = fixtures
    .map((fixture) => fixture.fixtureId)
    .filter((id) => id.startsWith("candidate-probe-"))
    .sort();
  assert.deepEqual(
    onDisk,
    [...registered].sort(),
    "every candidate-probe-* fixture must be catalogued here, and every catalogued arm registered"
  );
  for (const id of registered) {
    const fixture = byId.get(id);
    assert.ok(fixture, `${id} is not registered in SS2_FIXTURE_FILES`);
    assert.equal(fixture.classification, "candidate");
    assert.equal(fixture.provenance.runtimeVerified, false);
    assert.equal(fixture.provenance.kind, "synthetic-static-map");
    const replay = runSs2OneVsOneGoldenFixture(fixture, resolveSs2PhysicalAttackCandidate);
    assert.deepEqual(replay.outcome, fixture.expected, id);
    assert.deepEqual(replay.trace, fixture.samples, id);
  }
});

test("every probe stages the one unattended fight, unchanged", () => {
  // The operator's gladiator against the tutorial prisoner, fight_mode "misc",
  // attacker side hero. Neither side wears armour, which is what makes the
  // deflection threshold exactly 100 and the removal gate silent in state.
  for (const probe of PROBES) {
    for (const id of probe.arms) {
      const { scenario } = byId.get(id);
      assert.deepEqual(scenario.hero, STAGING.scenario.hero, id);
      assert.deepEqual(scenario.villain, STAGING.scenario.villain, id);
      assert.equal(scenario.attackerSide, "hero", id);
      assert.equal(scenario.fightMode, "misc", id);
      assert.equal(scenario.result, null, id);
      assert.equal(scenario.hero.helmet ?? 0, 0, id);
      assert.equal(scenario.villain.helmet ?? 0, 0, id);
      assert.equal(scenario.villain.greaves ?? 0, 0, id);
      assert.equal(scenario.villain.armourclass, 0, id);
    }
  }
});

for (const probe of PROBES) {
  test(`${probe.name}: the arms differ in one injected value and nothing else about the staging`, () => {
    const [left, right] = probe.arms.map((id) => byId.get(id));

    // Same fight, same action: any observed difference is attributable to the
    // one injected value, not to the setup.
    assert.deepEqual(left.scenario, right.scenario, `${probe.name} arms must stage identically`);

    const [leftValue, rightValue] = probe.values;
    assert.equal(sampleByLabel(left, probe.injected).value, leftValue);
    assert.equal(sampleByLabel(right, probe.injected).value, rightValue);
    assert.notEqual(leftValue, rightValue);

    // Every OTHER shared tape slot must agree, or the pair would be confounded.
    const rightByLabel = new Map(right.samples.map((sample) => [sample.label, sample]));
    for (const sample of left.samples) {
      if (sample.label === probe.injected) continue;
      const counterpart = rightByLabel.get(sample.label);
      if (!counterpart) continue; // a slot the other arm does not reach at all
      assert.deepEqual(sample, counterpart, `${probe.name}: ${sample.label} is confounded`);
    }
  });

  test(`${probe.name}: the arms differ in exactly the declared OBSERVED channels`, () => {
    const [left, right] = probe.arms.map((id) => byId.get(id));

    // The whole point. Echoed sample labels, bounds and values are excluded
    // from this comparison, because the wrapper copies them out of the tape it
    // was handed: a pair that only moved those would be measuring itself.
    assert.deepEqual(
      differingObservedChannels(left, right),
      probe.channels,
      `${probe.name} must separate exactly ${probe.channels.join(", ")}`
    );
    assert.ok(
      probe.channels.length > 0,
      `${probe.name} would be indistinguishable at runtime and is not a probe`
    );
  });
}

test("the three rollneeded brackets measure each band's threshold exactly", () => {
  // attack_chances (map lines 408-422): ratio = (attacker.attack + 9) /
  // (defender.defence + 9) = (1 + 9) / (0 + 9) = 10/9, so ratio * 100 =
  // 111.111... The three melee factors give
  //   quick  = round(111.111 * 0.66) = round(73.333) = 73
  //   normal = round(111.111 * 0.50) = round(55.556) = 56
  //   power  = round(111.111 * 0.33) = round(36.667) = 37
  // all inside the 1-99 clamp. The dispatcher (map lines 566-569) computes
  // rollneeded = 100 - chance and hits iff diceroll >= rollneeded.
  const BANDS = [
    { band: "quick", direction: 1, chance: 73, rollNeeded: 27, prefix: "candidate-probe-quick-rollneeded" },
    { band: "normal", direction: 5, chance: 56, rollNeeded: 44, prefix: "candidate-probe-normal-rollneeded" },
    { band: "power", direction: 9, chance: 37, rollNeeded: 63, prefix: "candidate-probe-power-rollneeded" }
  ];

  for (const { band, direction, chance, rollNeeded, prefix } of BANDS) {
    const miss = byId.get(`${prefix}-miss`);
    const hit = byId.get(`${prefix}-hit`);

    for (const fixture of [miss, hit]) {
      assert.equal(fixture.scenario.attackDirection, direction, band);
      assert.equal(fixture.expected.calculation.chance, chance, band);
      assert.equal(fixture.expected.calculation.rollNeeded, rollNeeded, band);
      assert.equal(fixture.expected.calculation.rollNeeded, 100 - chance, "rollneeded = 100 - chance");
    }

    // A bracket, not a demonstration: the two arms are adjacent integers, so
    // the pair pins the smallest hitting roll to a single value.
    assert.equal(miss.expected.calculation.diceroll, rollNeeded - 1, band);
    assert.equal(hit.expected.calculation.diceroll, rollNeeded, band);
    assert.equal(miss.expected.calculation.hit, false, band);
    assert.equal(hit.expected.calculation.hit, true, band);

    // The prediction stated in the channel a capture actually sees.
    assert.deepEqual(deriveExpectedEventsFromSs2Fixture(miss), [{ type: "defender-blocked" }], band);
    assert.equal(deriveExpectedEventsFromSs2Fixture(hit)[0].type, "defender-hurt", band);
  }

  // Re-derive the chances here from the map's own formula rather than trusting
  // the numbers copied into the fixtures.
  const ratio = (1 + 9) / (0 + 9);
  const chanceFor = (factor) => Math.round(ratio * 100 * factor);
  assert.deepEqual(
    [chanceFor(0.66), chanceFor(0.5), chanceFor(0.33)],
    BANDS.map(({ chance }) => chance),
    "quick 0.66, normal 0.50, power 0.33 against ratio 10/9"
  );

  // Taken together the three brackets over-determine the comparison's polarity.
  // The three smallest hitting rolls this family predicts are (27, 44, 63).
  assert.deepEqual(
    BANDS.map(({ prefix }) => byId.get(`${prefix}-hit`).expected.calculation.diceroll),
    [27, 44, 63]
  );
  // Under the mapped inclusive reading, smallest hitting roll = 100 - chance.
  assert.deepEqual(BANDS.map(({ chance }) => 100 - chance), [27, 44, 63]);
  // Under a strict `diceroll > 100 - chance` the same three observations would
  // require chances (74, 57, 38) — and no factor in the mapped attack_chances
  // table produces any of them against this ratio. So the three pairs together
  // decide the comparison's polarity, not merely the three thresholds.
  const reachableChances = new Set([0.2, 0.33, 0.4, 0.5, 0.6, 0.66, 0.9].map(chanceFor));
  for (const strictChance of [74, 57, 38]) {
    assert.equal(
      reachableChances.has(strictChance),
      false,
      `a strict-comparison reading would need chance ${strictChance}, which the map's factors cannot yield`
    );
  }
});

test("the miss arms prove the damage and critical samples are drawn before the hit test", () => {
  // Map lines 566-569: checkattackroll rolls the diceroll, then "derives damage
  // and a critical sample from attack_direction, then computes rollneeded". A
  // miss therefore still consumes its band's damage/critical draws, and nothing
  // after them — no deflection roll, no armour-removal roll, no knockback roll,
  // no enchantment roll, because damagecharacter is never called.
  assert.deepEqual(labels(byId.get("candidate-probe-quick-rollneeded-miss")), [
    "hit-roll",
    "quick-critical-roll"
  ]);
  assert.deepEqual(labels(byId.get("candidate-probe-normal-rollneeded-miss")), [
    "hit-roll",
    "normal-damage-roll",
    "normal-critical-roll"
  ]);
  assert.deepEqual(labels(byId.get("candidate-probe-power-rollneeded-miss")), [
    "hit-roll",
    "power-critical-roll"
  ]);

  // The dispatcher table (map lines 571-580) gives each band its own critical
  // bounds and its own damage rule, so the miss tapes are band-distinguishable
  // even though no state moves at all.
  assert.deepEqual(
    [
      sampleByLabel(byId.get("candidate-probe-quick-rollneeded-miss"), "quick-critical-roll").min,
      sampleByLabel(byId.get("candidate-probe-quick-rollneeded-miss"), "quick-critical-roll").max
    ],
    [-20, 20]
  );
  assert.deepEqual(
    [
      sampleByLabel(byId.get("candidate-probe-normal-rollneeded-miss"), "normal-critical-roll").min,
      sampleByLabel(byId.get("candidate-probe-normal-rollneeded-miss"), "normal-critical-roll").max
    ],
    [1, 20]
  );
  assert.deepEqual(
    [
      sampleByLabel(byId.get("candidate-probe-power-rollneeded-miss"), "power-critical-roll").min,
      sampleByLabel(byId.get("candidate-probe-power-rollneeded-miss"), "power-critical-roll").max
    ],
    [5, 20]
  );

  // Selected damage per band, from the same table: quick takes min_damage,
  // normal takes the rolled value, power takes max_damage.
  assert.equal(byId.get("candidate-probe-quick-rollneeded-miss").expected.calculation.selectedDamage, 21);
  assert.equal(byId.get("candidate-probe-normal-rollneeded-miss").expected.calculation.selectedDamage, 22);
  assert.equal(byId.get("candidate-probe-power-rollneeded-miss").expected.calculation.selectedDamage, 23);

  // No miss may record a mutation, a result, or any post-dispatch draw.
  for (const suffix of ["quick", "normal", "power"]) {
    const miss = byId.get(`candidate-probe-${suffix}-rollneeded-miss`);
    assert.deepEqual(miss.expected.mutationTrace, []);
    assert.equal(miss.expected.resultEvent, null);
    assert.equal(miss.expected.state.villain.hitpoints, 10);
    for (const forbidden of [
      "critical-deflection-roll",
      "armour-removal-roll",
      "armour-selection-1",
      "knockback-roll",
      "enchantment-potency-roll"
    ]) {
      assert.equal(sampleByLabel(miss, forbidden), null, `${miss.fixtureId} must not draw ${forbidden}`);
    }
  }
});

test("the deflection bracket measures the threshold at exactly 100 through the dispatched method", () => {
  // Map lines 585-589: the critical-deflection threshold is
  // (100 - 1.5 * game_defender.helmet) + game_defender.greaves, and an
  // inclusive 1-100 roll AT OR ABOVE that threshold clears the critical.
  // The prisoner wears neither helmet nor greaves, so the threshold is
  // 100 - 0 + 0 = 100 — the single largest value the roll can take.
  const critical = byId.get("candidate-probe-deflection-threshold-critical");
  const cleared = byId.get("candidate-probe-deflection-threshold-cleared");

  for (const fixture of [critical, cleared]) {
    assert.equal(fixture.expected.calculation.deflectionThreshold, 100, fixture.fixtureId);
    // Map line 574: direction 5-8 draws its critical from randomBetween(1, 20),
    // and line 583 dispatches defender_hurt("critical") on a SURVIVING 20.
    assert.equal(sampleByLabel(fixture, "normal-critical-roll").max, 20, fixture.fixtureId);
    assert.equal(fixture.expected.calculation.criticalSample, 20, fixture.fixtureId);
    assert.equal(fixture.expected.calculation.hit, true, fixture.fixtureId);
  }

  // 99 is one below the threshold: the critical survives.
  assert.equal(critical.expected.calculation.deflectionRoll, 99);
  assert.equal(critical.expected.calculation.criticalCleared, false);
  assert.equal(critical.expected.calculation.criticalSampleAfterDeflection, 20);
  assert.equal(critical.expected.calculation.dispatchedMethod, "critical");

  // 100 is the threshold itself: "at or above" clears. Getting this boundary
  // backwards — reading it as strictly above — would predict "critical" here
  // too, and the pair is what catches that.
  assert.equal(cleared.expected.calculation.deflectionRoll, 100);
  assert.equal(cleared.expected.calculation.criticalCleared, true);
  assert.equal(cleared.expected.calculation.criticalSampleAfterDeflection, 0);
  assert.equal(cleared.expected.calculation.dispatchedMethod, "normal");

  // The observed channel, stated as the capture will see it.
  assert.deepEqual(deriveExpectedEventsFromSs2Fixture(critical)[0], {
    type: "defender-hurt",
    method: "critical"
  });
  assert.deepEqual(deriveExpectedEventsFromSs2Fixture(cleared)[0], {
    type: "defender-hurt",
    method: "normal"
  });

  // Nothing else may move, or the probe would be attributing a difference it
  // did not isolate. Critical damage bypasses the armour branch (map line 641)
  // but the prisoner has no armour, so even the damage path coincides.
  assert.deepEqual(critical.expected.mutationTrace, cleared.expected.mutationTrace);
  assert.deepEqual(critical.expected.state, cleared.expected.state);
  assert.deepEqual(labels(critical), labels(cleared));
});

test("the removal-gate bracket measures the > 66 gate through the draw count alone", () => {
  // Map lines 638-640: every physical damage invocation rolls an inclusive
  // 1-100 armour-removal chance and calls remove_armour when the roll is
  // GREATER THAN 66. Map lines 550-556: remove_armour consumes exactly one
  // interceptable randomBetween group-selection sample, drawn BEFORE the
  // `piece != 0` test, "so the sample is consumed even when the selected piece
  // is not equipped and nothing is destroyed". Map line 547: directions
  // 1, 5, 8, 9 select the top group, whose selector is randomBetween(1, 2)
  // over helmet and shoulderguard.
  const below = byId.get("candidate-probe-armour-removal-gate-below");
  const above = byId.get("candidate-probe-armour-removal-gate-above");

  assert.equal(below.scenario.attackDirection, 5);
  assert.equal(above.scenario.attackDirection, 5);
  assert.equal(sampleByLabel(below, "armour-removal-roll").value, 66);
  assert.equal(sampleByLabel(above, "armour-removal-roll").value, 67);

  // 66 does not clear the gate: no call, no selection draw.
  assert.equal(sampleByLabel(below, "armour-selection-1"), null);
  assert.deepEqual(below.expected.mutation.armourRemovals, []);
  assert.deepEqual(labels(below), [
    "hit-roll",
    "normal-damage-roll",
    "normal-critical-roll",
    "critical-deflection-roll",
    "armour-removal-roll",
    "knockback-roll",
    "enchantment-potency-roll"
  ]);

  // 67 clears it: one extra draw, in the mapped position, with the mapped
  // bounds — and no piece destroyed, because the prisoner wears none.
  assert.deepEqual(sampleByLabel(above, "armour-selection-1"), {
    label: "armour-selection-1",
    source: "randomBetween",
    min: 1,
    max: 2,
    value: 1
  });
  assert.deepEqual(labels(above), [
    "hit-roll",
    "normal-damage-roll",
    "normal-critical-roll",
    "critical-deflection-roll",
    "armour-removal-roll",
    "armour-selection-1",
    "knockback-roll",
    "enchantment-potency-roll"
  ]);
  assert.deepEqual(above.expected.mutation.armourRemovals, [
    { request: 1, selected: "helmet", removed: false, defenceRemoved: 0, debrisRolls: null }
  ]);

  // The measurement is the draw count and nothing else: with no armour on the
  // defender the call is invisible in state, which is exactly why this pair
  // isolates the "drawn before the equipped test" claim.
  assert.equal(below.samples.length, 7);
  assert.equal(above.samples.length, 8);
  assert.deepEqual(below.expected.mutationTrace, above.expected.mutationTrace);
  assert.deepEqual(below.expected.state, above.expected.state);
  assert.deepEqual(
    deriveExpectedEventsFromSs2Fixture(below),
    deriveExpectedEventsFromSs2Fixture(above)
  );
});

test("no probe pair relies on an echoed sample value to tell its arms apart", () => {
  // The audit finding this whole family answers: the wrapper's roll lines are
  // copied from the injected tape, so a "discriminator" whose arms differ only
  // in a sample value compares a fixture against a copy of itself. Erasing the
  // tape's labels, bounds and values entirely must still leave every pair
  // distinguishable.
  for (const probe of PROBES) {
    const [left, right] = probe.arms.map((id) => byId.get(id));
    assert.ok(
      differingObservedChannels(left, right).length > 0,
      `${probe.name} is not discriminating: its arms agree on every observed channel`
    );
  }

  // ...and the check above has teeth. Both sharp pairs are one edit away from
  // measuring nothing; simulate that edit and confirm the guard would fire.
  const clone = (value) => JSON.parse(JSON.stringify(value));

  // "Simplify" the cleared deflection arm so it dispatches critical like its
  // twin: every observed channel collapses, and the pair stops being a probe.
  const flattenedDeflection = clone(byId.get("candidate-probe-deflection-threshold-cleared"));
  flattenedDeflection.expected.calculation.criticalCleared = false;
  flattenedDeflection.expected.calculation.criticalSampleAfterDeflection = 20;
  flattenedDeflection.expected.calculation.dispatchedMethod = "critical";
  flattenedDeflection.expected.calculation.effectiveDamageMethod = "critical";
  assert.deepEqual(
    differingObservedChannels(byId.get("candidate-probe-deflection-threshold-critical"), flattenedDeflection),
    [],
    "a deflection pair whose arms dispatch the same method measures nothing"
  );

  // "Simplify" the above-gate arm by dropping the group-selection draw: the
  // draw count matches its twin and the pair stops being a probe.
  const flattenedRemoval = clone(byId.get("candidate-probe-armour-removal-gate-above"));
  flattenedRemoval.samples = flattenedRemoval.samples.filter(
    (sample) => sample.label !== "armour-selection-1"
  );
  flattenedRemoval.expected.mutation.armourRemovals = [];
  assert.deepEqual(
    differingObservedChannels(byId.get("candidate-probe-armour-removal-gate-below"), flattenedRemoval),
    [],
    "a removal-gate pair whose arms draw the same number of samples measures nothing"
  );
});
