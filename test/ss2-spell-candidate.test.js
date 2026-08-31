import assert from "node:assert/strict";
import test from "node:test";

import { ingestSs2CaptureTrace } from "../src/golden/capture-ingest.js";
import {
  SS2_SIMULATED_CAPTURE_METHOD,
  matchSs2ObservationToFixture
} from "../src/golden/observation.js";
import {
  OrderedRollError,
  RollSequenceError,
  UnusedRollSamplesError,
  RollSource,
  createOrderedRollTape
} from "../src/golden/ordered-rolls.js";
import {
  GoldenClassification,
  GoldenProvenance,
  runSs2OneVsOneGoldenFixture,
  validateSs2OneVsOneFixture
} from "../src/golden/run-1v1-fixture.js";
import { simulateSs2CaptureTrace } from "../src/golden/simulate-capture-trace.js";
import {
  SS2_DIRECT_DAMAGE_SPELLS,
  Ss2SpellCandidateError,
  applySs2MagicDamageCandidate,
  resolveSs2SpellCandidate,
  resolveSs2SpellDamageCandidate
} from "../src/golden/ss2-spell-candidate.js";

import { loadSs2SpellFixtures } from "./ss2-fixture-files.js";

const cloneJson = (value) => JSON.parse(JSON.stringify(value));

const fixtures = await loadSs2SpellFixtures();
const fixturesById = new Map(fixtures.map((fixture) => [fixture.fixtureId, fixture]));

const betweenSample = (label, min, max, value) => ({
  label,
  source: RollSource.RANDOM_BETWEEN,
  min,
  max,
  value
});

/** A minimal, hand-built spell scenario for direct rule tests. */
function spellScenario(overrides = {}) {
  const { hero = {}, villain = {}, ...scenarioOverrides } = overrides;
  return {
    attackerSide: "hero",
    // Fireball's mapped inventory id; see the resolver's schema note. A spell
    // scenario carries no attackDirection at all — the ingress reads none.
    spellId: 30,
    result: null,
    ...scenarioOverrides,
    hero: {
      hitpoints: 200,
      hitpointsmax: 200,
      staminaleft: 50,
      staminamax: 150,
      ...hero
    },
    villain: {
      hitpoints: 200,
      hitpointsmax: 200,
      staminaleft: 50,
      staminamax: 150,
      ...villain
    }
  };
}

function runSpellScenario(scenario, samples) {
  const tape = createOrderedRollTape(samples);
  const outcome = resolveSs2SpellDamageCandidate(scenario, tape);
  const trace = tape.finish();
  return { outcome, trace };
}

// ---------------------------------------------------------------------------
// Fixture replay
// ---------------------------------------------------------------------------

for (const fixture of fixtures) {
  test(`${fixture.fixtureId} matches the isolated spell-ingress candidate`, () => {
    assert.equal(validateSs2OneVsOneFixture(fixture), fixture);
    const result = runSs2OneVsOneGoldenFixture(fixture, resolveSs2SpellDamageCandidate);
    assert.deepEqual(result.outcome, fixture.expected);
    assert.deepEqual(result.trace, fixture.samples);
  });
}

test("every spell fixture is an unverified static candidate of the spell ingress", () => {
  assert.ok(fixtures.length >= 7);
  for (const fixture of fixtures) {
    assert.match(fixture.fixtureId, /^candidate-spell-/);
    assert.equal(fixture.classification, GoldenClassification.CANDIDATE);
    assert.equal(fixture.provenance.kind, GoldenProvenance.SYNTHETIC);
    assert.equal(fixture.provenance.runtimeVerified, false);
    assert.ok(fixture.provenance.candidateFlags.includes("spell-ingress"));
    assert.ok(
      fixture.provenance.sourceRefs.some((ref) => ref.endsWith("/magic_damage_character")),
      `${fixture.fixtureId} must cite the spell ingress`
    );
    // The ingress makes no RNG call itself: the single sample belongs to the
    // caller's mapped randomBetween damage range.
    assert.equal(fixture.samples.length, 1);
    assert.equal(fixture.samples[0].source, RollSource.RANDOM_BETWEEN);
    // The spell identity rides in its own schema field. The old
    // `spell-id-in-attack-direction` hack (and its candidate flag) is retired:
    // a spell scenario carries no attack direction, because the ingress reads
    // none (map line 317).
    assert.equal(fixture.scenario.attackDirection, undefined);
    assert.equal(
      fixture.provenance.candidateFlags.includes("spell-id-in-attack-direction"),
      false,
      `${fixture.fixtureId} must not carry the retired spell-id-in-attack-direction flag`
    );
    const spell = SS2_DIRECT_DAMAGE_SPELLS[fixture.scenario.spellId];
    assert.ok(spell, `${fixture.fixtureId} must name a mapped direct-damage spell id`);
    assert.equal(fixture.expected.calculation.spellId, fixture.scenario.spellId);
    assert.equal(fixture.samples[0].label, spell.rollLabel);
    assert.equal(fixture.samples[0].min, spell.min);
    assert.equal(fixture.samples[0].max, spell.max);
  }
});

test("spell fixture replay deep-clones input and is repeatably deterministic", () => {
  const fixture = fixturesById.get("candidate-spell-armour-overflow-remainder");
  const original = cloneJson(fixture);

  const first = runSs2OneVsOneGoldenFixture(fixture, resolveSs2SpellDamageCandidate);
  const second = runSs2OneVsOneGoldenFixture(fixture, resolveSs2SpellDamageCandidate);
  assert.deepEqual(first, second);
  assert.deepEqual(fixture, original);

  first.outcome.state.villain.hitpoints = -1;
  first.trace[0].value = -1;
  const third = runSs2OneVsOneGoldenFixture(fixture, resolveSs2SpellDamageCandidate);
  assert.deepEqual(third, second);
  assert.deepEqual(fixture, original);
});

test("resolveSs2SpellCandidate is an alias of the damage-ingress resolver", () => {
  assert.equal(resolveSs2SpellCandidate, resolveSs2SpellDamageCandidate);
});

// ---------------------------------------------------------------------------
// One test per encoded rule
// ---------------------------------------------------------------------------

test("rule: the ingress itself consumes no RNG; the caller supplies one damage roll", () => {
  // Map lines 366-371: the complete call inventory of magic_damage_character
  // has no RNG call and no RandomNumber opcode.
  const { outcome, trace } = runSpellScenario(
    spellScenario({ villain: { armourclass: 0, armourclass_max: 0 } }),
    [betweenSample("fireball-damage-roll", 80, 160, 90)]
  );
  assert.equal(trace.length, 1);
  assert.equal(outcome.calculation.rolledDamage, 90);

  // The core takes an explicit damage argument and no tape at all.
  const core = applySs2MagicDamageCandidate(
    spellScenario({ villain: { armourclass: 0, armourclass_max: 0 } }),
    90
  );
  assert.deepEqual(core.mutationTrace, outcome.mutationTrace);
  assert.deepEqual(core.state, outcome.state);
  assert.equal(core.calculation.rolledDamage, null);
});

test("rule: armour absorbs the whole hit and hitpoints are untouched", () => {
  // Map lines 351-360: armour-first, and the hitpoints subtraction is gated on
  // the post-decrement armourclass <= 0.
  const scenario = spellScenario({
    villain: { armourclass: 120, armourclass_max: 120, hitpoints: 200, hitpointsmax: 200 }
  });
  const { outcome } = runSpellScenario(scenario, [
    betweenSample("fireball-damage-roll", 80, 160, 100)
  ]);
  assert.equal(outcome.calculation.armourAfterDamage, 20);
  assert.equal(outcome.calculation.hitpointsApplied, false);
  assert.equal(outcome.state.villain.armourclass, 20);
  assert.equal(outcome.state.villain.hitpoints, 200);
  assert.equal(outcome.mutation.hitpointDamage, 0);
  assert.equal(outcome.mutation.armourDamage, 100);
});

test("rule: exact armour equality skips the overflow rewrite and applies the full damage", () => {
  // Map lines 351-356 and 374-379: equality sets armour to zero but does not
  // rewrite the damage register, so the full original damage also reaches
  // hitpoints. Boundary pair: 120 vs 121 against 120 armour.
  const armour = { armourclass: 120, armourclass_max: 120, hitpoints: 300, hitpointsmax: 300 };

  const equal = runSpellScenario(spellScenario({ villain: { ...armour } }), [
    betweenSample("fireball-damage-roll", 80, 160, 120)
  ]).outcome;
  assert.equal(equal.calculation.armourEquality, true);
  assert.equal(equal.calculation.overflowRewritten, false);
  assert.equal(equal.calculation.appliedDamage, 120);
  assert.equal(equal.state.villain.hitpoints, 180);

  const overflow = runSpellScenario(spellScenario({ villain: { ...armour } }), [
    betweenSample("fireball-damage-roll", 80, 160, 121)
  ]).outcome;
  assert.equal(overflow.calculation.armourEquality, false);
  assert.equal(overflow.calculation.overflowRewritten, true);
  assert.equal(overflow.calculation.appliedDamage, 1);
  assert.equal(overflow.state.villain.hitpoints, 299);
});

test("rule: strict overflow rewrites the damage register and leaves armour negative until the clamp", () => {
  // Map line 355: armourclass is left negative until check_stats clamps it.
  const scenario = spellScenario({
    spellId: 32,
    villain: { armourclass: 96, armourclass_max: 96, hitpoints: 500, hitpointsmax: 500 }
  });
  const { outcome } = runSpellScenario(scenario, [
    betweenSample("dire-fireball-damage-roll", 300, 600, 400)
  ]);
  assert.equal(outcome.calculation.appliedDamage, 304);
  assert.equal(outcome.state.villain.hitpoints, 196);
  const armourEntries = outcome.mutationTrace.filter((entry) => entry.path === "/villain/armourclass");
  assert.deepEqual(
    armourEntries.map((entry) => [entry.before, entry.after, entry.reason]),
    [[96, -304, "magic-damage"], [-304, 0, "stat-clamp"]]
  );
});

test("rule: an already depleted armour class skips the armour branch entirely", () => {
  const scenario = spellScenario({
    spellId: 34,
    villain: { armourclass: 0, armourclass_max: 108, hitpoints: 250, hitpointsmax: 250 }
  });
  const { outcome } = runSpellScenario(scenario, [
    betweenSample("lightning-bolt-damage-roll", 100, 200, 100)
  ]);
  assert.equal(outcome.calculation.armourBefore, 0);
  assert.equal(outcome.calculation.armourAfterDamage, 0);
  assert.equal(outcome.mutation.armourDamage, 0);
  assert.equal(outcome.state.villain.hitpoints, 150);
  assert.equal(
    outcome.mutationTrace.some((entry) => entry.path === "/villain/armourclass"),
    false,
    "a skipped armour branch must record no armourclass mutation"
  );
});

test("rule: psyche_up is set to 1 unconditionally on every path", () => {
  // Map line 361: game_defender.psyche_up = 1 unconditionally at the join.
  const paths = [
    // fully absorbed
    { villain: { armourclass: 300, armourclass_max: 300 } },
    // strict overflow
    { villain: { armourclass: 10, armourclass_max: 10 } },
    // no armour at all
    { villain: { armourclass: 0, armourclass_max: 0 } }
  ];
  for (const villain of paths) {
    const { outcome } = runSpellScenario(spellScenario(villain), [
      betweenSample("fireball-damage-roll", 80, 160, 80)
    ]);
    const entry = outcome.mutationTrace.find((mutation) => mutation.path === "/villain/psyche_up");
    assert.ok(entry, "every spell path must record the psyche_up write");
    assert.deepEqual([entry.before, entry.after, entry.reason], [null, 1, "psyche-up"]);
    assert.equal(outcome.mutation.psycheUpApplied, true);
  }
  // Repeating the write is a no-op, so it drops out of the ordered trace.
  const already = applySs2MagicDamageCandidate(
    spellScenario({ villain: { armourclass: 0, armourclass_max: 0, psyche_up: 1 } }),
    80
  );
  assert.equal(
    already.mutationTrace.some((entry) => entry.path === "/villain/psyche_up"),
    false
  );
  assert.equal(already.mutation.psycheUpApplied, true);
});

test("rule: breastplate stamina is unconditional and uses the current damage register", () => {
  // Map line 362 and lines 283-289: ceil(breastplate * damage / 100), where
  // damage is the full damage when armour absorbed the hit and the overflow
  // remainder after a rewrite.
  const absorbed = runSpellScenario(
    spellScenario({
      spellId: 34,
      villain: {
        armourclass: 112,
        armourclass_max: 112,
        breastplate: 7,
        breastplate_defence: 112,
        staminaleft: 30,
        staminamax: 120
      }
    }),
    [betweenSample("lightning-bolt-damage-roll", 100, 200, 100)]
  ).outcome;
  assert.equal(absorbed.mutation.hitpointDamage, 0);
  assert.equal(absorbed.mutation.staminaBonus, 7);
  assert.equal(absorbed.state.villain.staminaleft, 37);

  const overflowed = runSpellScenario(
    spellScenario({
      spellId: 32,
      villain: {
        armourclass: 96,
        armourclass_max: 96,
        breastplate: 6,
        breastplate_defence: 96,
        hitpoints: 500,
        hitpointsmax: 500,
        staminaleft: 80,
        staminamax: 180
      }
    }),
    [betweenSample("dire-fireball-damage-roll", 300, 600, 400)]
  ).outcome;
  // remainder 400 - 96 = 304 -> ceil(6 * 304 / 100) = ceil(18.24) = 19
  assert.equal(overflowed.mutation.staminaBonus, 19);
  assert.equal(overflowed.state.villain.staminaleft, 99);
});

test("rule: the applied damage is raw; only the displayed bonus is ceiled", () => {
  // Map lines 357-360: unlike damagecharacter, which rounds damage upward,
  // the spell ingress applies the raw damage argument. Roll samples are
  // integer-only, so the fractional argument is exercised on the ingress core.
  const scenario = spellScenario({
    villain: {
      armourclass: 0,
      armourclass_max: 0,
      hitpoints: 100,
      hitpointsmax: 100,
      breastplate: 6,
      breastplate_defence: 96,
      staminaleft: 40,
      staminamax: 150
    }
  });
  const outcome = applySs2MagicDamageCandidate(scenario, 12.4);
  assert.equal(outcome.calculation.incomingDamage, 12.4);
  assert.equal(outcome.calculation.displayedBonus, 13);
  assert.equal(outcome.calculation.appliedDamage, 12.4);
  assert.equal(outcome.state.villain.hitpoints, 87.6);
  // ceil(6 * 12.4 / 100) = ceil(0.744) = 1
  assert.equal(outcome.mutation.staminaBonus, 1);

  // And the same raw treatment for an overflow remainder.
  const fractionalRemainder = applySs2MagicDamageCandidate(
    spellScenario({
      villain: { armourclass: 90.5, armourclass_max: 96, hitpoints: 200, hitpointsmax: 200 }
    }),
    100
  );
  assert.equal(fractionalRemainder.calculation.appliedDamage, 9.5);
  assert.equal(fractionalRemainder.state.villain.hitpoints, 190.5);
});

test("rule: the ingress removes no armour piece and never changes armourclass_max", () => {
  // Map lines 366-371: no armour-removal call is in the ingress call
  // inventory, unlike damagecharacter's 1-100 removal roll.
  const scenario = spellScenario({
    villain: {
      armourclass: 120,
      armourclass_max: 120,
      helmet: 6,
      helmet_defence: 60,
      shield: 5,
      shield_defence: 60
    }
  });
  const { outcome, trace } = runSpellScenario(scenario, [
    betweenSample("fireball-damage-roll", 80, 160, 160)
  ]);
  assert.equal(trace.length, 1, "no removal or debris samples may be consumed");
  assert.equal(outcome.state.villain.armourclass_max, 120);
  assert.equal(outcome.state.villain.helmet, 6);
  assert.equal(outcome.state.villain.shield, 5);
  assert.equal(
    outcome.mutationTrace.some((entry) => /\/(helmet|shield|armourclass_max)$/.test(entry.path)),
    false
  );
  assert.equal(Object.hasOwn(outcome.mutation, "armourRemovals"), false);
  assert.equal(Object.hasOwn(outcome.mutation, "knockback"), false);
  assert.equal(Object.hasOwn(outcome.mutation, "statusApplied"), false);
});

test("rule: the defeat gate is the shared byte-verified gate with a spell-only dispatch", () => {
  // Map lines 304-318: enter iff hitpoints <= 0 OR (hitpoints < hitpointsmax
  // AND mode != tournament); duels always yield; magic_damage_character has no
  // direction chain and always uses "slain" outside duels.
  const wounded = (fightMode) => runSpellScenario(
    spellScenario({
      fightMode,
      villain: { armourclass: 0, armourclass_max: 0, hitpoints: 220, hitpointsmax: 220 }
    }),
    [betweenSample("fireball-damage-roll", 80, 160, 80)]
  ).outcome;

  assert.equal(wounded("tournament").resultEvent, null);
  assert.equal(wounded(undefined).resultEvent, null, "absent fightMode means tournament");

  const duelFirstBlood = wounded("duel").resultEvent;
  assert.equal(duelFirstBlood.reason, "first-blood");
  assert.equal(duelFirstBlood.howDied, "yield");

  const miscFirstBlood = wounded("misc").resultEvent;
  assert.equal(miscFirstBlood.reason, "first-blood");
  assert.equal(miscFirstBlood.howDied, "slain");

  const lethal = (fightMode) => runSpellScenario(
    spellScenario({
      fightMode,
      villain: { armourclass: 0, armourclass_max: 0, hitpoints: 60, hitpointsmax: 60 }
    }),
    [betweenSample("fireball-damage-roll", 80, 160, 80)]
  ).outcome;

  const tournamentKill = lethal("tournament").resultEvent;
  assert.equal(tournamentKill.reason, "elimination");
  assert.equal(tournamentKill.howDied, "slain");
  const duelKill = lethal("duel").resultEvent;
  assert.equal(duelKill.reason, "elimination");
  assert.equal(duelKill.howDied, "yield", "duel kills never route to slain");
  assert.equal(lethal("misc").resultEvent.howDied, "slain");
  assert.equal(lethal("misc").state.villain.hitpoints, 0, "check_stats clamps the kill to zero");
});

test("rule: a fully armour-absorbed duel hit does not enter the defeat gate", () => {
  // Map lines 326-331, observed live: 44 armour absorbed a 23-damage hit with
  // no defeat.
  const { outcome } = runSpellScenario(
    spellScenario({
      fightMode: "duel",
      villain: { armourclass: 200, armourclass_max: 200, hitpoints: 220, hitpointsmax: 220 }
    }),
    [betweenSample("fireball-damage-roll", 80, 160, 100)]
  );
  assert.equal(outcome.resultEvent, null);
  assert.equal(outcome.state.result, null);
});

test("rule: death clears the byte-verified status order across both sides", () => {
  // Map lines 453-462: frozen, burning, poison, life_stolen (hero group then
  // villain group), then taunted1 (hero, villain) and taunted2 (hero, villain).
  const { outcome } = runSpellScenario(
    spellScenario({
      fightMode: "misc",
      hero: { frozen: true, poison: true, taunted2: true },
      villain: {
        armourclass: 0,
        armourclass_max: 0,
        hitpoints: 60,
        hitpointsmax: 60,
        burning: true,
        life_stolen: true,
        taunted1: true
      }
    }),
    [betweenSample("fireball-damage-roll", 80, 160, 80)]
  );
  const clears = outcome.mutationTrace
    .filter((entry) => entry.reason.startsWith("death-"))
    .map((entry) => entry.path);
  assert.deepEqual(clears, [
    "/hero/frozen",
    "/hero/poison",
    "/villain/burning",
    "/villain/life_stolen",
    "/villain/taunted1",
    "/hero/taunted2"
  ]);
  assert.equal(outcome.mutationTrace.at(-1).path, "/result");
});

test("rule: no attacker field can influence the spell ingress", () => {
  // Map lines 341-345: attacker and game_attacker are not register-bound.
  const build = (attacker) => runSpellScenario(
    spellScenario({
      hero: attacker,
      villain: { armourclass: 40, armourclass_max: 40, breastplate: 4, breastplate_defence: 64 }
    }),
    [betweenSample("fireball-damage-roll", 80, 160, 100)]
  ).outcome;

  const weak = build({ attack: 1, defence: 1, strength: 1, charisma: 1, magicka: 1, min_damage: 1, max_damage: 2 });
  const strong = build({ attack: 90, defence: 90, strength: 90, charisma: 90, magicka: 90, min_damage: 900, max_damage: 999 });
  assert.deepEqual(weak, strong);
});

// ---------------------------------------------------------------------------
// Negative tests
// ---------------------------------------------------------------------------

test("the resolver rejects malformed scenarios", () => {
  const tape = () => createOrderedRollTape([betweenSample("fireball-damage-roll", 80, 160, 100)]);

  for (const [label, scenario] of [
    ["non-object", null],
    ["array", []],
    ["missing attackerSide", { ...spellScenario(), attackerSide: "ally" }],
    ["absent spell id", (({ spellId, ...rest }) => rest)(spellScenario())],
    ["non-integer spell id", { ...spellScenario(), spellId: 30.5 }],
    ["string spell id", { ...spellScenario(), spellId: "30" }],
    ["unmapped physical direction as a spell id", { ...spellScenario(), spellId: 5 }],
    ["little fat kid is not direct damage", { ...spellScenario(), spellId: 33 }],
    ["multi-impact death from above", { ...spellScenario(), spellId: 49 }],
    ["an attack direction alongside the spell id", { ...spellScenario(), attackDirection: 5 }],
    ["unknown fight mode", { ...spellScenario(), fightMode: "skirmish" }],
    ["non-finite combatant number", spellScenario({ villain: { armourclass: Number.NaN } })]
  ]) {
    assert.throws(
      () => resolveSs2SpellDamageCandidate(scenario, tape()),
      Ss2SpellCandidateError,
      `${label} must be rejected`
    );
  }
});

test("the resolver refuses to overwrite an already decided result", () => {
  const scenario = spellScenario();
  scenario.result = { status: "pending-animation" };
  assert.throws(
    () => resolveSs2SpellDamageCandidate(
      scenario,
      createOrderedRollTape([betweenSample("fireball-damage-roll", 80, 160, 100)])
    ),
    (error) => error instanceof Ss2SpellCandidateError && /already been set/.test(error.message)
  );
});

test("the resolver requires an ordered roll tape and validates before consuming one", () => {
  assert.throws(
    () => resolveSs2SpellDamageCandidate(spellScenario(), null),
    (error) => error instanceof Ss2SpellCandidateError && /ordered roll tape/.test(error.message)
  );

  // A malformed envelope must not burn a sample.
  const tape = createOrderedRollTape([betweenSample("fireball-damage-roll", 80, 160, 100)]);
  assert.throws(
    () => resolveSs2SpellDamageCandidate({ ...spellScenario(), fightMode: "skirmish" }, tape),
    Ss2SpellCandidateError
  );
  assert.equal(tape.consumedCount, 0);
});

test("the ingress core rejects a non-finite damage argument", () => {
  for (const damage of [undefined, null, "40", Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => applySs2MagicDamageCandidate(spellScenario(), damage),
      (error) => error instanceof Ss2SpellCandidateError && /damage argument/.test(error.message)
    );
  }
  assert.throws(
    () => applySs2MagicDamageCandidate(spellScenario(), 40, "identity"),
    Ss2SpellCandidateError
  );
});

test("the ordered tape rejects a wrong caller roll and reports leftovers", () => {
  assert.throws(
    () => resolveSs2SpellDamageCandidate(
      spellScenario(),
      createOrderedRollTape([betweenSample("fireball-damage-roll", 80, 200, 100)])
    ),
    RollSequenceError
  );
  assert.throws(
    () => resolveSs2SpellDamageCandidate(
      spellScenario({ spellId: 34 }),
      createOrderedRollTape([betweenSample("fireball-damage-roll", 80, 160, 100)])
    ),
    RollSequenceError
  );

  const extra = createOrderedRollTape([
    betweenSample("fireball-damage-roll", 80, 160, 100),
    betweenSample("armour-removal-roll", 1, 100, 90)
  ]);
  resolveSs2SpellDamageCandidate(spellScenario(), extra);
  assert.throws(() => extra.finish(), UnusedRollSamplesError);
  assert.ok(UnusedRollSamplesError.prototype instanceof OrderedRollError);
});

test("the spell resolver rejects every physical-attack fixture scenario", () => {
  // Isolation guard: the two families must never silently accept each other's
  // fixtures just because they share the 1v1 schema. Direction 30 is the
  // sharpest case — it is the grievous attack direction AND fireball's
  // inventory id, which is exactly why the two identities cannot share a field.
  for (const attackDirection of [1, 5, 9, 20, 21, 22, 23, 30]) {
    const { spellId, ...physical } = spellScenario();
    assert.throws(
      () => resolveSs2SpellDamageCandidate(
        { ...physical, attackDirection },
        createOrderedRollTape([betweenSample("hit-roll", 1, 100, 50)])
      ),
      Ss2SpellCandidateError,
      `attack direction ${attackDirection} must not resolve as a spell`
    );
  }
});

// ---------------------------------------------------------------------------
// Capture pipeline
// ---------------------------------------------------------------------------

test("every spell fixture round-trips through simulate -> ingest -> verify", () => {
  // Result-bearing spell fixtures used to be unprojectable: the derived event
  // list keyed on the physical dispatcher's `expected.calculation.hit`, and the
  // ingest death dispatch synthesized howDied from the physical
  // `attack_direction` chain. Both now have a spell arm, so the whole family
  // round-trips — including the two fixtures that end the battle.
  assert.equal(fixtures.length, 8);
  assert.equal(fixtures.filter((fixture) => fixture.expected.resultEvent !== null).length, 2);
  for (const fixture of fixtures) {
    const trace = simulateSs2CaptureTrace(fixture, {
      observationId: `sim-${fixture.fixtureId}`,
      sessionId: "sim-spell-session-1"
    });
    const record = ingestSs2CaptureTrace(trace, fixture);
    assert.equal(record.capture.method, SS2_SIMULATED_CAPTURE_METHOD);
    assert.equal(record.target.fixtureId, fixture.fixtureId);
    assert.equal(record.scenario.spellId, fixture.scenario.spellId);
    assert.equal(Object.hasOwn(record.scenario, "attackDirection"), false);
    const comparison = matchSs2ObservationToFixture(fixture, record);
    assert.deepEqual(comparison.differences, []);
    assert.equal(comparison.match, true);
  }
});

test("a spell action is observed as the spell ingress, never as a hit or a miss", () => {
  // Map lines 366-371: the complete call inventory of magic_damage_character
  // contains neither defender_hurt nor defender_blocked, so neither event may
  // appear. `method` is its damage_method argument — the defender animation
  // label (map lines 346-350), null where the map records none.
  const observed = (fixtureId) => {
    const fixture = fixturesById.get(fixtureId);
    return ingestSs2CaptureTrace(
      simulateSs2CaptureTrace(fixture, { observationId: `sim-ev-${fixtureId}`, sessionId: "sim-ev" }),
      fixture
    ).events;
  };

  assert.deepEqual(observed("candidate-spell-fireball-armour-absorbed"), [
    { type: "magic-damage", method: "burning" }
  ]);
  assert.deepEqual(observed("candidate-spell-first-blood-duel"), [
    { type: "magic-damage", method: "burning" },
    { type: "death", side: "villain" },
    { type: "overlay-label", label: "combatwon" }
  ]);
  // dire fireball: the map records a damage range but no animation label.
  assert.deepEqual(observed("candidate-spell-lethal-slain"), [
    { type: "magic-damage", method: null },
    { type: "death", side: "hero" },
    { type: "overlay-label", label: "combatlost" }
  ]);
  for (const fixture of fixtures) {
    const events = observed(fixture.fixtureId);
    assert.equal(events.some((event) => event.type === "defender-hurt"), false);
    assert.equal(events.some((event) => event.type === "defender-blocked"), false);
  }
});

test("the spell defeat gate synthesizes slain outside duels and yield inside them", () => {
  // Map lines 313-318: the duel arm is on the shared gate, so it covers both
  // ingresses; outside duels magic_damage_character "has no direction chain and
  // always uses `slain`". The old direction chain could not reach this: ids
  // 31/32/34/35 hit no arm at all, and id 30 would have read as grievous.
  const resultOf = (fixtureId) => {
    const fixture = fixturesById.get(fixtureId);
    return ingestSs2CaptureTrace(
      simulateSs2CaptureTrace(fixture, { observationId: `sim-gate-${fixtureId}`, sessionId: "sim-gate" }),
      fixture
    ).resultEvent;
  };

  const misc = resultOf("candidate-spell-lethal-slain");
  assert.equal(misc.howDied, "slain");
  assert.equal(misc.reason, "elimination");
  assert.equal(misc.loserSide, "hero");

  const duel = resultOf("candidate-spell-first-blood-duel");
  assert.equal(duel.howDied, "yield");
  assert.equal(duel.reason, "first-blood");
  assert.equal(duel.loserSide, "villain");
});

test("spell mutations are attributed to the spell ingress, not to damagecharacter", () => {
  // Map lines 351-364: steps 2-6 (the armour/hitpoint writes, the unconditional
  // psyche_up join, the breastplate stamina join and check_stats) are all
  // inside magic_damage_character, so a wrapper attributing by call frame never
  // reports `damagecharacter` for a spell action. `death` is genuinely shared.
  const hooks = (fixtureId) => {
    const fixture = fixturesById.get(fixtureId);
    return simulateSs2CaptureTrace(fixture, {
      observationId: `sim-hook-${fixtureId}`,
      sessionId: "sim-hook"
    })
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .filter((line) => line.t === "set")
      .map((line) => `${line.path}=${line.hook}`);
  };

  assert.deepEqual(hooks("candidate-spell-fireball-armour-absorbed"), [
    "/villain/armourclass=magic-damage-character",
    "/villain/psyche_up=magic-damage-character"
  ]);
  assert.deepEqual(hooks("candidate-spell-lethal-slain"), [
    "/hero/armourclass=magic-damage-character",
    "/hero/hitpoints=magic-damage-character",
    "/hero/psyche_up=magic-damage-character",
    "/hero/staminaleft=magic-damage-character",
    "/hero/hitpoints=magic-damage-character",
    "/hero/armourclass=magic-damage-character",
    "/hero/poison=death",
    "/villain/taunted2=death"
  ]);
  for (const fixture of fixtures) {
    for (const hook of hooks(fixture.fixtureId)) {
      assert.equal(hook.endsWith("=unattributed"), false, `${fixture.fixtureId}: ${hook}`);
      assert.equal(hook.endsWith("=damagecharacter"), false, `${fixture.fixtureId}: ${hook}`);
    }
  }
});

test("a spell trace records spell_id, and a spell fixture cannot be ingested without it", () => {
  const fixture = fixturesById.get("candidate-spell-fireball-armour-absorbed");
  const lines = simulateSs2CaptureTrace(fixture).trim().split("\n").map((line) => JSON.parse(line));
  const vars = lines.filter((line) => line.t === "var").map((line) => line.name);
  assert.deepEqual(vars, ["fight_mode", "spell_id"]);
  assert.equal(vars.includes("attack_direction"), false);

  const withoutSpellId = lines.filter((line) => !(line.t === "var" && line.name === "spell_id"));
  assert.throws(
    () => ingestSs2CaptureTrace(`${withoutSpellId.map((line) => JSON.stringify(line)).join("\n")}\n`, fixture),
    /never recorded the spell_id variable/
  );
});
