import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidRollSampleError,
  OrderedRollError,
  RollExhaustedError,
  RollSequenceError,
  RollSource,
  UnusedRollSamplesError,
  createOrderedRollTape
} from "../src/golden/ordered-rolls.js";
import {
  GoldenClassification,
  GoldenFixtureValidationError,
  GoldenProvenance,
  SS2_BUILD_SHA256,
  SS2_STEAM_BUILD_ID,
  runSs2OneVsOneGoldenFixture,
  validateSs2OneVsOneFixture
} from "../src/golden/run-1v1-fixture.js";
import {
  Ss2CandidateError,
  calculateSs2AttackChances,
  createOneShotResultBridge,
  resolveSs2PhysicalAttackCandidate
} from "../src/golden/ss2-attack-candidate.js";

import { loadSs2Fixtures } from "./ss2-fixture-files.js";

const cloneJson = (value) => JSON.parse(JSON.stringify(value));

const fixtures = await loadSs2Fixtures();
const fixturesById = new Map(fixtures.map((fixture) => [fixture.fixtureId, fixture]));

const betweenSample = (label, min, max, value) => ({
  label,
  source: RollSource.RANDOM_BETWEEN,
  min,
  max,
  value
});

function physicalScenario(overrides = {}) {
  const { hero = {}, villain = {}, ...scenarioOverrides } = overrides;
  return {
    attackerSide: "hero",
    attackDirection: 5,
    result: null,
    ...scenarioOverrides,
    hero: {
      attack: 11,
      defence: 11,
      strength: 5,
      min_damage: 12,
      max_damage: 20,
      hitpoints: 60,
      hitpointsmax: 60,
      staminaleft: 20,
      staminamax: 100,
      ...hero
    },
    villain: {
      attack: 11,
      defence: 11,
      hitpoints: 100,
      hitpointsmax: 100,
      staminaleft: 20,
      staminamax: 100,
      ...villain
    }
  };
}

function runPhysicalScenario(scenario, samples) {
  const tape = createOrderedRollTape(samples);
  const outcome = resolveSs2PhysicalAttackCandidate(scenario, tape);
  const trace = tape.finish();
  return { outcome, trace };
}

test("the ordered roll tape consumes exact randomBetween and randomNumber samples", () => {
  const samples = [
    betweenSample("inclusive-roll", 1, 3, 2),
    { label: "opcode-roll", source: RollSource.RANDOM_NUMBER, min: 0, max: 3, value: 3 }
  ];
  const tape = createOrderedRollTape(samples);

  assert.equal(tape.consumedCount, 0);
  assert.equal(tape.remainingCount, 2);
  assert.equal(tape.randomBetween("inclusive-roll", 1, 3), 2);
  assert.equal(tape.randomNumber("opcode-roll", 4), 3);
  assert.equal(tape.consumedCount, 2);
  assert.equal(tape.remainingCount, 0);

  const trace = tape.finish();
  assert.deepEqual(trace, samples);
  trace[0].value = 99;
  assert.equal(tape.trace[0].value, 2);
  assert.throws(
    () => tape.consume({ label: "after-finish", source: RollSource.RANDOM_BETWEEN, min: 1, max: 1 }),
    OrderedRollError
  );
});

test("the ordered roll tape rejects a wrong label", () => {
  const tape = createOrderedRollTape([betweenSample("observed-label", 1, 100, 50)]);
  assert.throws(() => tape.randomBetween("different-label", 1, 100), RollSequenceError);
  assert.equal(tape.consumedCount, 0);
});

test("the ordered roll tape rejects a wrong RNG source", () => {
  const tape = createOrderedRollTape([
    { label: "source-sensitive", source: RollSource.RANDOM_NUMBER, min: 0, max: 99, value: 50 }
  ]);
  assert.throws(
    () => tape.consume({ label: "source-sensitive", source: RollSource.RANDOM_BETWEEN, min: 0, max: 99 }),
    RollSequenceError
  );
  assert.equal(tape.consumedCount, 0);
});

test("the ordered roll tape rejects wrong bounds", () => {
  const tape = createOrderedRollTape([betweenSample("bounded-roll", 1, 100, 50)]);
  assert.throws(() => tape.randomBetween("bounded-roll", 1, 99), RollSequenceError);
  assert.equal(tape.consumedCount, 0);
});

test("the ordered roll tape rejects an out-of-range recorded value", () => {
  assert.throws(
    () => createOrderedRollTape([betweenSample("invalid-value", 1, 100, 101)]),
    InvalidRollSampleError
  );
});

test("the ordered roll tape reports exhaustion", () => {
  const tape = createOrderedRollTape([betweenSample("only-roll", 1, 1, 1)]);
  assert.equal(tape.randomBetween("only-roll", 1, 1), 1);
  assert.throws(() => tape.randomBetween("missing-roll", 1, 1), RollExhaustedError);
});

test("the ordered roll tape reports unused fixture samples", () => {
  const tape = createOrderedRollTape([
    betweenSample("used-roll", 1, 2, 1),
    betweenSample("unused-roll", 1, 2, 2)
  ]);
  assert.equal(tape.randomBetween("used-roll", 1, 2), 1);
  assert.throws(() => tape.finish(), UnusedRollSamplesError);
});

for (const fixture of fixtures) {
  test(`${fixture.fixtureId} matches the isolated physical-attack candidate`, () => {
    assert.equal(validateSs2OneVsOneFixture(fixture), fixture);
    const result = runSs2OneVsOneGoldenFixture(fixture, resolveSs2PhysicalAttackCandidate);
    assert.deepEqual(result.outcome, fixture.expected);
    assert.deepEqual(result.trace, fixture.samples);
  });
}

test("fixture execution deep-clones input and is repeatably deterministic", () => {
  const fixture = fixturesById.get("candidate-armour-overflow-burning");
  const original = cloneJson(fixture);

  const first = runSs2OneVsOneGoldenFixture(fixture, resolveSs2PhysicalAttackCandidate);
  const second = runSs2OneVsOneGoldenFixture(fixture, resolveSs2PhysicalAttackCandidate);
  assert.deepEqual(first, second);
  assert.deepEqual(fixture, original);

  first.outcome.state.villain.hitpoints = -1;
  first.trace[0].value = -1;
  const third = runSs2OneVsOneGoldenFixture(fixture, resolveSs2PhysicalAttackCandidate);
  assert.deepEqual(third, second);
  assert.deepEqual(fixture, original);
});

test("fixture validation pins the licensed-build fingerprint", () => {
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  assert.equal(fixture.build.ss2Sha256, SS2_BUILD_SHA256);
  assert.equal(fixture.build.steamBuildId, SS2_STEAM_BUILD_ID);

  for (const mutate of [
    (candidate) => { candidate.build.ss2Sha256 = "0".repeat(64); },
    (candidate) => { candidate.build.steamBuildId += 1; },
    (candidate) => { candidate.build.fingerprintSchemaVersion += 1; }
  ]) {
    const invalid = cloneJson(fixture);
    mutate(invalid);
    assert.throws(() => validateSs2OneVsOneFixture(invalid), GoldenFixtureValidationError);
  }
});

test("a candidate's provenance kind decides whether it must name a source record", () => {
  // Before `transcribed-observation` existed, the schema FORCED every candidate
  // to declare `synthetic-static-map`, so a fixture derived from the bytecode
  // map and a fixture copied verbatim out of a live state dump made the same
  // provenance claim and the field carried no information about provenance.
  // These four cases are the whole content of the repair: the kind and the
  // source field can no longer disagree in either direction.
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  assert.equal(fixture.provenance.kind, GoldenProvenance.SYNTHETIC);

  const transcribed = cloneJson(fixture);
  transcribed.provenance.kind = GoldenProvenance.TRANSCRIBED;
  transcribed.provenance.authoredFrom = "obs-20260830-t1";
  assert.equal(validateSs2OneVsOneFixture(transcribed), transcribed);

  // Transcribed but silent about its source: the exact shape the four prisoner
  // normal-band candidates had for their whole life.
  const unnamedSource = cloneJson(transcribed);
  delete unnamedSource.provenance.authoredFrom;
  assert.throws(
    () => validateSs2OneVsOneFixture(unnamedSource),
    (error) => error instanceof GoldenFixtureValidationError && /requires provenance.authoredFrom/.test(error.message)
  );

  // Synthetic yet naming a source: the same falsehood wearing the other label.
  const synthethicWithSource = cloneJson(fixture);
  synthethicWithSource.provenance.authoredFrom = "obs-20260830-t1";
  assert.throws(
    () => validateSs2OneVsOneFixture(synthethicWithSource),
    (error) => error instanceof GoldenFixtureValidationError && /must not carry provenance.authoredFrom/.test(error.message)
  );

  // A transcribed candidate is still a candidate: where its numbers came from
  // says nothing about whether the runtime has confirmed them.
  const transcribedClaimingVerification = cloneJson(transcribed);
  transcribedClaimingVerification.provenance.runtimeVerified = true;
  assert.throws(
    () => validateSs2OneVsOneFixture(transcribedClaimingVerification),
    GoldenFixtureValidationError
  );

  for (const authoredFrom of [42, null, "", "not a token", "x".repeat(129)]) {
    const malformed = cloneJson(transcribed);
    malformed.provenance.authoredFrom = authoredFrom;
    assert.throws(() => validateSs2OneVsOneFixture(malformed), GoldenFixtureValidationError);
  }

  // And a golden may not borrow the field: its evidence is `observationIds`.
  const golden = cloneJson(fixture);
  golden.classification = GoldenClassification.GOLDEN;
  golden.provenance = {
    kind: GoldenProvenance.LICENSED,
    runtimeVerified: true,
    sourceRefs: cloneJson(fixture.provenance.sourceRefs),
    observedAt: "2026-08-30T00:00:00Z",
    captureToolVersion: "test-capture/1",
    repetitions: 2,
    observationIds: ["observation-1", "observation-2"],
    observationDigests: ["1".repeat(64), "2".repeat(64)],
    captureManifestSha256: "3".repeat(64),
    authoredFrom: "obs-20260830-t1"
  };
  assert.throws(() => validateSs2OneVsOneFixture(golden), GoldenFixtureValidationError);
});

test("fixture classification and provenance must agree", () => {
  const fixture = fixturesById.get("candidate-normal-threshold-hit");

  const verified = cloneJson(fixture);
  verified.classification = GoldenClassification.GOLDEN;
  verified.provenance.kind = GoldenProvenance.LICENSED;
  verified.provenance.runtimeVerified = true;
  verified.provenance.observedAt = "2026-08-30T00:00:00Z";
  verified.provenance.captureToolVersion = "test-capture/1";
  verified.provenance.repetitions = 2;
  verified.provenance.observationIds = ["observation-1", "observation-2"];
  verified.provenance.observationDigests = ["1".repeat(64), "2".repeat(64)];
  verified.provenance.captureManifestSha256 = "3".repeat(64);
  assert.equal(validateSs2OneVsOneFixture(verified), verified);

  const candidateClaimingVerification = cloneJson(fixture);
  candidateClaimingVerification.provenance.runtimeVerified = true;
  assert.throws(
    () => validateSs2OneVsOneFixture(candidateClaimingVerification),
    GoldenFixtureValidationError
  );

  const unverifiedGolden = cloneJson(verified);
  unverifiedGolden.provenance.runtimeVerified = false;
  assert.throws(() => validateSs2OneVsOneFixture(unverifiedGolden), GoldenFixtureValidationError);

  const unknownClassification = cloneJson(fixture);
  unknownClassification.classification = "assumed";
  assert.throws(() => validateSs2OneVsOneFixture(unknownClassification), GoldenFixtureValidationError);

  const incompleteCapture = cloneJson(verified);
  incompleteCapture.provenance.observationDigests = [];
  assert.throws(() => validateSs2OneVsOneFixture(incompleteCapture), GoldenFixtureValidationError);

  const extraCombatant = cloneJson(fixture);
  extraCombatant.scenario.ally = {};
  assert.throws(() => validateSs2OneVsOneFixture(extraCombatant), GoldenFixtureValidationError);
});

test("a scenario carries exactly one action identity", () => {
  // `spellId` is a new optional key, so every fixture written against the
  // earlier schema still validates untouched: it carries `attackDirection` and
  // no `spellId`. The two are mutually exclusive because
  // `magic_damage_character` "has no direction chain" (battle map line 317) —
  // a spell action has no attack direction to name — and because the two id
  // spaces overlap (inventory id 30 is fireball; attack direction 30 is the
  // grievous attack), so one shared field could not be read unambiguously.
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  assert.equal(validateSs2OneVsOneFixture(fixture), fixture);
  for (const physical of fixtures) {
    assert.equal(Number.isSafeInteger(physical.scenario.attackDirection), true);
    assert.equal(physical.scenario.spellId, undefined);
  }

  const asSpell = cloneJson(fixture);
  delete asSpell.scenario.attackDirection;
  asSpell.scenario.spellId = 30;
  assert.equal(validateSs2OneVsOneFixture(asSpell), asSpell);

  const both = cloneJson(fixture);
  both.scenario.spellId = 30;
  assert.throws(() => validateSs2OneVsOneFixture(both), /exactly one action identity/);

  const neither = cloneJson(fixture);
  delete neither.scenario.attackDirection;
  assert.throws(() => validateSs2OneVsOneFixture(neither), /exactly one action identity/);

  const fractionalSpellId = cloneJson(asSpell);
  fractionalSpellId.scenario.spellId = 30.5;
  assert.throws(() => validateSs2OneVsOneFixture(fractionalSpellId), /spellId must be an integer/);

  const fractionalDirection = cloneJson(fixture);
  fractionalDirection.scenario.attackDirection = 5.5;
  assert.throws(
    () => validateSs2OneVsOneFixture(fractionalDirection),
    /attackDirection must be an integer/
  );
});

test("bombard and snipe chance use the attacker's shield", () => {
  const defender = { defence: 11, charisma: 11, magicka: 11, shield: 0 };
  const unshieldedAttacker = { attack: 11, charisma: 11, magicka: 11, shield: 0 };
  const shieldedAttacker = { ...unshieldedAttacker, shield: 10 };

  const unshielded = calculateSs2AttackChances(unshieldedAttacker, defender);
  const defenderShielded = calculateSs2AttackChances(unshieldedAttacker, { ...defender, shield: 99 });
  const attackerShielded = calculateSs2AttackChances(shieldedAttacker, defender);
  assert.equal(unshielded.bombard, 60);
  assert.equal(unshielded.snipe, 90);
  assert.equal(defenderShielded.bombard, unshielded.bombard);
  assert.equal(defenderShielded.snipe, unshielded.snipe);
  assert.equal(attackerShielded.bombard, 69);
  assert.equal(attackerShielded.snipe, 99);
});

test("bash requires and inherits the transient critical register", () => {
  const withoutTransient = physicalScenario({ attackDirection: 23 });
  const missingTape = createOrderedRollTape([betweenSample("hit-roll", 1, 100, 80)]);
  assert.throws(
    () => resolveSs2PhysicalAttackCandidate(withoutTransient, missingTape),
    (error) => error instanceof Ss2CandidateError && /transient\.criticalhit/.test(error.message)
  );

  const scenario = physicalScenario({
    attackDirection: 23,
    transient: { criticalhit: 20 },
    villain: { armourclass: 25, armourclass_max: 25 }
  });
  const { outcome, trace } = runPhysicalScenario(scenario, [
    betweenSample("hit-roll", 1, 100, 80),
    betweenSample("critical-deflection-roll", 1, 100, 1),
    betweenSample("armour-removal-roll", 1, 100, 1),
    betweenSample("enchantment-potency-roll", 1, 100, 100)
  ]);

  assert.equal(outcome.calculation.inheritedCritical, true);
  assert.equal(outcome.calculation.criticalSample, 20);
  assert.equal(outcome.calculation.criticalSampleAfterDeflection, 20);
  assert.equal(outcome.calculation.dispatchedMethod, "critical");
  assert.deepEqual(trace.map((sample) => sample.label), [
    "hit-roll",
    "critical-deflection-roll",
    "armour-removal-roll",
    "enchantment-potency-roll"
  ]);
});

test("critical deflection clears a normal critical at the exact threshold", () => {
  const samplesForDeflection = (deflectionRoll) => [
    betweenSample("hit-roll", 1, 100, 50),
    betweenSample("normal-damage-roll", 12, 20, 12),
    betweenSample("normal-critical-roll", 1, 20, 20),
    betweenSample("critical-deflection-roll", 1, 100, deflectionRoll),
    betweenSample("armour-removal-roll", 1, 100, 1),
    betweenSample("knockback-roll", 1, 4, 1),
    betweenSample("enchantment-potency-roll", 1, 100, 100)
  ];
  const makeScenario = () => physicalScenario({ villain: { helmet: 20, greaves: 0 } });

  const below = runPhysicalScenario(makeScenario(), samplesForDeflection(69)).outcome;
  assert.equal(below.calculation.deflectionThreshold, 70);
  assert.equal(below.calculation.criticalCleared, false);
  assert.equal(below.calculation.dispatchedMethod, "critical");

  const equal = runPhysicalScenario(makeScenario(), samplesForDeflection(70)).outcome;
  assert.equal(equal.calculation.deflectionThreshold, 70);
  assert.equal(equal.calculation.criticalCleared, true);
  assert.equal(equal.calculation.criticalSampleAfterDeflection, 0);
  assert.equal(equal.calculation.dispatchedMethod, "normal");
});

test("armour removal preserves selection and native cosmetic roll order", () => {
  const scenario = physicalScenario({
    villain: {
      armourclass: 20,
      armourclass_max: 20,
      helmet: 1,
      helmet_defence: 5,
      gladiator_dir: "left"
    }
  });
  const { outcome, trace } = runPhysicalScenario(scenario, [
    betweenSample("hit-roll", 1, 100, 50),
    betweenSample("normal-damage-roll", 12, 20, 12),
    betweenSample("normal-critical-roll", 1, 20, 7),
    betweenSample("critical-deflection-roll", 1, 100, 42),
    betweenSample("armour-removal-roll", 1, 100, 67),
    betweenSample("armour-selection-1", 1, 2, 1),
    { label: "armour-debris-1-x", source: RollSource.RANDOM_NUMBER, min: 0, max: 29, value: 10 },
    { label: "armour-debris-1-y", source: RollSource.RANDOM_NUMBER, min: 0, max: 19, value: 5 },
    { label: "armour-debris-1-rotation", source: RollSource.RANDOM_NUMBER, min: 0, max: 4, value: 2 },
    betweenSample("knockback-roll", 1, 4, 1),
    betweenSample("enchantment-potency-roll", 1, 100, 100)
  ]);

  assert.equal(outcome.mutation.armourRemovals[0].selected, "helmet");
  assert.equal(outcome.mutation.armourRemovals[0].removed, true);
  assert.equal(outcome.state.villain.helmet, 0);
  assert.equal(outcome.state.villain.armourclass, 3);
  assert.equal(outcome.state.villain.armourclass_max, 15);
  assert.deepEqual(trace.slice(6, 9).map((sample) => sample.source), [
    RollSource.RANDOM_NUMBER,
    RollSource.RANDOM_NUMBER,
    RollSource.RANDOM_NUMBER
  ]);
});

test("fully absorbed armour damage still grants breastplate stamina", () => {
  // Byte-verified: the vanilla stamina block is an unconditional join, so an
  // armour-absorbed hit grants ceil(breastplate * fullDamage / 100).
  const scenario = physicalScenario({
    villain: {
      armourclass: 32,
      armourclass_max: 32,
      breastplate: 2,
      staminaleft: 20,
      staminamax: 100
    }
  });
  const { outcome } = runPhysicalScenario(scenario, [
    betweenSample("hit-roll", 1, 100, 50),
    betweenSample("normal-damage-roll", 12, 20, 20),
    betweenSample("normal-critical-roll", 1, 20, 7),
    betweenSample("critical-deflection-roll", 1, 100, 42),
    betweenSample("armour-removal-roll", 1, 100, 66),
    betweenSample("knockback-roll", 1, 4, 1),
    betweenSample("enchantment-potency-roll", 1, 100, 100)
  ]);

  assert.equal(outcome.state.villain.armourclass, 12);
  assert.equal(outcome.state.villain.hitpoints, 100);
  assert.equal(outcome.mutation.staminaBonus, 1);
  assert.equal(outcome.state.villain.staminaleft, 21);
});

test("knockback force sign follows the defender avatar direction", () => {
  const scenario = physicalScenario({
    hero: { gladiator_dir: "right" },
    villain: { gladiator_dir: "left" }
  });
  const { outcome } = runPhysicalScenario(scenario, [
    betweenSample("hit-roll", 1, 100, 50),
    betweenSample("normal-damage-roll", 12, 20, 12),
    betweenSample("normal-critical-roll", 1, 20, 7),
    betweenSample("critical-deflection-roll", 1, 100, 42),
    betweenSample("armour-removal-roll", 1, 100, 66),
    betweenSample("knockback-roll", 1, 4, 4),
    betweenSample("enchantment-potency-roll", 1, 100, 100)
  ]);

  assert.equal(outcome.mutation.knockback.force, 42);
});

test("secondary enchantment type still uses primary potency", () => {
  const scenario = physicalScenario({
    hero: {
      equipped_weapon: 2,
      weapon_enchantment_potency: 1,
      secondary_weapon_enchantment_type: 2,
      secondary_weapon_enchantment_potency: 10
    }
  });
  const { outcome } = runPhysicalScenario(scenario, [
    betweenSample("hit-roll", 1, 100, 50),
    betweenSample("normal-damage-roll", 12, 20, 12),
    betweenSample("normal-critical-roll", 1, 20, 7),
    betweenSample("critical-deflection-roll", 1, 100, 42),
    betweenSample("armour-removal-roll", 1, 100, 66),
    betweenSample("knockback-roll", 1, 4, 1),
    betweenSample("enchantment-potency-roll", 1, 100, 50)
  ]);

  assert.equal(outcome.mutation.statusApplied, null);
  assert.equal(outcome.state.villain.burning, false);
});

/**
 * The positive half of the test above. Without it, "statusApplied is null"
 * could be passing because the secondary branch is broken rather than because
 * the potency gate refused — and those are opposite conclusions.
 */
test("the secondary weapon's TYPE is what fires, gated on the primary potency", () => {
  const scenario = physicalScenario({
    hero: {
      equipped_weapon: 2,
      // Primary potency 10 -> threshold 100, so the roll of 50 clears it.
      weapon_enchantment_potency: 10,
      // Primary type 5 (life_stolen) must NOT be the one applied.
      weapon_enchantment_type: 5,
      secondary_weapon_enchantment_type: 2,
      secondary_weapon_enchantment_potency: 0
    }
  });
  const { outcome } = runPhysicalScenario(scenario, enchantmentTape());
  assert.equal(outcome.mutation.statusApplied, "burning");
  assert.equal(outcome.state.villain.burning, true);
  assert.equal(outcome.state.villain.life_stolen, false, "the PRIMARY type must not fire on a secondary weapon");
});

/**
 * `damagecharacter` tests `equipped_weapon == 1` and `equipped_weapon == 2`
 * explicitly (`+0x1c27` / `+0x1c58`, repeated per status arm), so any other
 * value satisfies neither conjunct and applies NO status. This module used to
 * treat "not 2" as "primary", which applied one.
 *
 * Nothing in the corpus stages such a value today; these pin the branch so a
 * future armoured or enchanted capture cannot silently diverge on it.
 */
for (const equipped of [0, 3]) {
  test(`equipped_weapon ${equipped} applies no enchantment, as the build does not`, () => {
    const scenario = physicalScenario({
      hero: {
        equipped_weapon: equipped,
        weapon_enchantment_potency: 10,
        weapon_enchantment_type: 2,
        secondary_weapon_enchantment_type: 2,
        secondary_weapon_enchantment_potency: 10
      }
    });
    const { outcome } = runPhysicalScenario(scenario, enchantmentTape());
    assert.equal(outcome.mutation.statusApplied, null);
    assert.equal(outcome.state.villain.burning, false);
    // The roll is still DRAWN — the build draws it before any weapon test — so
    // the RNG stream must not depend on which weapon is equipped.
    assert.equal(outcome.mutation.enchantmentRoll, 50);
  });
}

/** The seven samples the physical scenarios above consume, in order. */
function enchantmentTape() {
  return [
    betweenSample("hit-roll", 1, 100, 50),
    betweenSample("normal-damage-roll", 12, 20, 12),
    betweenSample("normal-critical-roll", 1, 20, 7),
    betweenSample("critical-deflection-roll", 1, 100, 42),
    betweenSample("armour-removal-roll", 1, 100, 66),
    betweenSample("knockback-roll", 1, 4, 1),
    betweenSample("enchantment-potency-roll", 1, 100, 50)
  ];
}

test("the result bridge delivers the final pending result only once", () => {
  const resultEvent = fixturesById.get("candidate-lethal-result").expected.resultEvent;
  const delivered = [];
  const bridge = createOneShotResultBridge((event) => {
    delivered.push(event);
    event.winnerSide = "mutated-in-callback";
  });

  const acknowledgement = {
    type: "battle-result-animation-complete",
    completionToken: resultEvent.completionToken
  };
  assert.equal(bridge.delivered, false);
  assert.throws(
    () => bridge.acknowledge(resultEvent, { ...acknowledgement, completionToken: "wrong" }),
    Ss2CandidateError
  );
  assert.equal(bridge.delivered, false);
  assert.equal(bridge.acknowledge(resultEvent, acknowledgement), true);
  assert.equal(bridge.delivered, true);
  assert.equal(bridge.acknowledge(resultEvent, acknowledgement), false);
  assert.equal(delivered.length, 1);
  assert.equal(resultEvent.winnerSide, "hero");

  const invalidBridge = createOneShotResultBridge(() => assert.fail("invalid events must not be delivered"));
  assert.throws(
    () => invalidBridge.acknowledge({ type: "defeated" }, acknowledgement),
    Ss2CandidateError
  );
  assert.equal(invalidBridge.delivered, false);

  const missingTokenBridge = createOneShotResultBridge(
    () => assert.fail("tokenless events must not be delivered")
  );
  assert.throws(
    () => missingTokenBridge.acknowledge(
      { type: "battle-result-pending" },
      { type: "battle-result-animation-complete" }
    ),
    Ss2CandidateError
  );
  assert.equal(missingTokenBridge.delivered, false);
});
