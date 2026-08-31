/**
 * Band-level contract for the prisoner-kill candidate families.
 *
 * The capture campaign injects ONE tape per family and only learns which
 * direction the game drew after reading the trace, so a family is only usable
 * as a campaign if its members agree on everything except
 * `scenario.attackDirection` — and in particular on their injectable samples
 * (`campaign.mjs seed` refuses to nominate a tape otherwise, because injection
 * is tape-positional). These tests hold the three bands to that contract and
 * pin the roll-order differences the `checkattackroll` dispatcher table
 * dictates between them.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { runSs2OneVsOneGoldenFixture } from "../src/golden/run-1v1-fixture.js";
import { resolveSs2PhysicalAttackCandidate } from "../src/golden/ss2-attack-candidate.js";

import { loadSs2Fixtures } from "./ss2-fixture-files.js";

const cloneJson = (value) => JSON.parse(JSON.stringify(value));

const fixtures = await loadSs2Fixtures();

/**
 * A band is a family in the campaign driver's sense: candidates sharing the
 * `candidate-<family>` id prefix that differ only in attack direction.
 * `expectedDirections` is the dispatcher table's direction range for the
 * band, so a missing sibling fails here rather than silently shrinking the
 * campaign's coverage target.
 */
const BANDS = [
  { family: "prisoner-quick-kill", expectedDirections: [1, 2, 3, 4] },
  { family: "prisoner-normal-kill", expectedDirections: [5, 6, 7, 8] },
  { family: "prisoner-power-kill", expectedDirections: [9, 10, 11, 12] }
];

function bandMembers(family) {
  return fixtures
    .filter((fixture) => fixture.fixtureId.startsWith(`candidate-${family}`))
    .sort((left, right) => left.scenario.attackDirection - right.scenario.attackDirection);
}

const membersByFamily = new Map(BANDS.map(({ family }) => [family, bandMembers(family)]));

/** The injectable tape exactly as tools/capture-session.mjs derives it. */
function injectableTape(fixture) {
  return fixture.samples
    .filter((sample) => sample.source === "randomBetween")
    .map((sample) => `${sample.label}:${sample.min}:${sample.max}:${sample.value}`)
    .join(",");
}

/** Everything a family's members must agree on: the fixture minus its identity. */
function bandInvariant(fixture) {
  const invariant = cloneJson(fixture);
  delete invariant.fixtureId;
  delete invariant.scenario.attackDirection;
  delete invariant.expected.calculation.attackDirection;
  // `provenance.authoredFrom` is per-member by construction: each transcribed
  // member was copied out of its OWN direction's capture, so the four normal-band
  // members name four different records. That is lineage, not fight setup, and
  // this invariant is about the fight. The lineage claim is asserted directly in
  // "no two members of a family were transcribed from one record" below, so
  // dropping it here hides nothing.
  delete invariant.provenance.authoredFrom;
  return invariant;
}

function rollLabels(fixture) {
  return fixture.samples.map((sample) => sample.label);
}

function sampleByLabel(fixture, label) {
  return fixture.samples.find((sample) => sample.label === label) ?? null;
}

for (const { family, expectedDirections } of BANDS) {
  const members = membersByFamily.get(family);

  test(`${family} covers exactly its dispatcher direction range`, () => {
    assert.deepEqual(
      members.map((fixture) => fixture.scenario.attackDirection),
      expectedDirections
    );
    assert.equal(
      new Set(members.map((fixture) => fixture.fixtureId)).size,
      members.length,
      "two fixtures claiming one direction is a repository error, not a campaign choice"
    );
  });

  test(`${family} replays exactly through the physical resolver`, () => {
    for (const fixture of members) {
      const replay = runSs2OneVsOneGoldenFixture(fixture, resolveSs2PhysicalAttackCandidate);
      assert.deepEqual(replay.outcome, fixture.expected);
      assert.deepEqual(
        replay.trace.map((sample) => sample.label),
        fixture.samples.map((sample) => sample.label),
        "the resolver must consume the tape in the fixture's order"
      );
    }
  });

  test(`${family} members differ only in attackDirection`, () => {
    const [reference, ...rest] = members;
    for (const fixture of rest) {
      assert.deepEqual(
        bandInvariant(fixture),
        bandInvariant(reference),
        `${fixture.fixtureId} disagrees with ${reference.fixtureId} outside attackDirection`
      );
      assert.notEqual(fixture.scenario.attackDirection, reference.scenario.attackDirection);
      assert.notEqual(fixture.fixtureId, reference.fixtureId);
    }
  });

  test(`${family}: no two members were transcribed from one record`, () => {
    // Two members naming one `authoredFrom` would mean one capture was copied
    // into two directions' fixtures — which cannot be true, since a record
    // carries exactly one attackDirection. It would also mean the promotion
    // gate's refusal, which keys on the id, silently covered a fixture whose
    // real source it had never been told about.
    const sources = members
      .filter((fixture) => fixture.provenance.kind === "transcribed-observation")
      .map((fixture) => fixture.provenance.authoredFrom);
    assert.equal(
      new Set(sources).size,
      sources.length,
      `${family} has two members claiming the same authoredFrom: ${sources.join(", ")}`
    );
    for (const fixture of members) {
      // Whichever kind a member declares, it is never runtime-verified, and a
      // synthetic member must not be carrying a source id.
      assert.equal(fixture.provenance.runtimeVerified, false, fixture.fixtureId);
      assert.equal(
        Object.hasOwn(fixture.provenance, "authoredFrom"),
        fixture.provenance.kind === "transcribed-observation",
        `${fixture.fixtureId} declares ${fixture.provenance.kind} but ` +
        `${Object.hasOwn(fixture.provenance, "authoredFrom") ? "carries" : "omits"} authoredFrom`
      );
    }
  });

  test(`${family} injects one tape for the whole family`, () => {
    const tapes = new Set(members.map((fixture) => injectableTape(fixture)));
    assert.equal(
      tapes.size,
      1,
      "campaign.mjs seed refuses a family whose members disagree about their injectable samples"
    );
  });

  test(`${family} stages the same fight as the rest of the prisoner families`, () => {
    const normal = membersByFamily.get("prisoner-normal-kill")[0];
    for (const fixture of members) {
      assert.deepEqual(fixture.scenario.hero, normal.scenario.hero);
      assert.deepEqual(fixture.scenario.villain, normal.scenario.villain);
      assert.equal(fixture.scenario.attackerSide, normal.scenario.attackerSide);
      assert.equal(fixture.scenario.fightMode, normal.scenario.fightMode);
      assert.equal(fixture.classification, "candidate");
      assert.equal(fixture.provenance.runtimeVerified, false);
    }
  });
}

test("the three bands' tapes differ exactly as the dispatcher table dictates", () => {
  const [quick] = membersByFamily.get("prisoner-quick-kill");
  const [normal] = membersByFamily.get("prisoner-normal-kill");
  const [power] = membersByFamily.get("prisoner-power-kill");

  // Damage: only the normal band (5-8) rolls randomBetween(min, max); quick
  // takes min_damage and power takes max_damage with no roll at all.
  assert.deepEqual(sampleByLabel(normal, "normal-damage-roll"), {
    label: "normal-damage-roll",
    source: "randomBetween",
    min: normal.scenario.hero.min_damage,
    max: normal.scenario.hero.max_damage,
    value: 22
  });
  assert.equal(sampleByLabel(quick, "quick-damage-roll"), null);
  assert.equal(sampleByLabel(power, "power-damage-roll"), null);
  assert.equal(quick.expected.calculation.selectedDamage, quick.scenario.hero.min_damage);
  assert.equal(power.expected.calculation.selectedDamage, power.scenario.hero.max_damage);

  // Critical sample bounds, per the dispatcher table.
  assert.deepEqual(
    [sampleByLabel(quick, "quick-critical-roll").min, sampleByLabel(quick, "quick-critical-roll").max],
    [-20, 20]
  );
  assert.deepEqual(
    [sampleByLabel(normal, "normal-critical-roll").min, sampleByLabel(normal, "normal-critical-roll").max],
    [1, 20]
  );
  assert.deepEqual(
    [sampleByLabel(power, "power-critical-roll").min, sampleByLabel(power, "power-critical-roll").max],
    [5, 20]
  );

  // Whole roll orders. Knockback is dispatched for directions 5-12 only, so
  // the quick band never reaches the knockback roll.
  assert.deepEqual(rollLabels(quick), [
    "hit-roll",
    "quick-critical-roll",
    "critical-deflection-roll",
    "armour-removal-roll",
    "enchantment-potency-roll"
  ]);
  assert.deepEqual(rollLabels(normal), [
    "hit-roll",
    "normal-damage-roll",
    "normal-critical-roll",
    "critical-deflection-roll",
    "armour-removal-roll",
    "knockback-roll",
    "enchantment-potency-roll"
  ]);
  assert.deepEqual(rollLabels(power), [
    "hit-roll",
    "power-critical-roll",
    "critical-deflection-roll",
    "armour-removal-roll",
    "knockback-roll",
    "enchantment-potency-roll"
  ]);
  assert.equal(quick.expected.mutation.knockback, null);
  assert.notEqual(normal.expected.mutation.knockback, null);
  assert.notEqual(power.expected.mutation.knockback, null);

  // Chance fields: quick_percentage > normal_percentage > power_percentage for
  // one ratio, because the factors are 0.66 > 0.50 > 0.33.
  const chances = [
    quick.expected.calculation.chance,
    normal.expected.calculation.chance,
    power.expected.calculation.chance
  ];
  assert.deepEqual(chances, [73, 56, 37]);
  for (const fixture of [quick, normal, power]) {
    assert.equal(
      fixture.expected.calculation.rollNeeded,
      100 - fixture.expected.calculation.chance,
      "rollneeded = 100 - chance"
    );
    assert.ok(
      fixture.expected.calculation.diceroll > fixture.expected.calculation.rollNeeded,
      `${fixture.fixtureId} must be an unambiguous hit, not a boundary case`
    );
    assert.equal(fixture.expected.calculation.hit, true);
  }
});

test("every prisoner band kills the villain the same way", () => {
  for (const { family } of BANDS) {
    for (const fixture of membersByFamily.get(family)) {
      assert.equal(fixture.expected.calculation.dispatchedMethod, "normal");
      assert.equal(fixture.expected.calculation.criticalCleared, false);
      assert.equal(fixture.expected.calculation.deflectionThreshold, 100);
      assert.equal(fixture.expected.mutation.hitpointDamage, 10);
      assert.equal(fixture.expected.mutation.staminaBonus, 0);
      assert.deepEqual(fixture.expected.mutation.armourRemovals, []);
      assert.equal(fixture.expected.mutation.statusApplied, null);
      assert.equal(fixture.expected.state.villain.hitpoints, 0);
      assert.equal(fixture.expected.resultEvent.reason, "elimination");
      // fight_mode "misc" is not a duel, and every direction here is <= 12.
      assert.equal(fixture.expected.resultEvent.howDied, "slain");
      assert.equal(fixture.expected.resultEvent.overlayLabel, "combatwon");
    }
  }
});
